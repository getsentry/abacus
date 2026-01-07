import { insertUsageRecord } from '../queries';
import { normalizeModelName } from '../utils';
import { sql } from '@vercel/postgres';

interface CursorUsageEvent {
  userEmail: string;
  model: string;
  timestamp: string;  // epoch milliseconds as string
  kind?: string;
  maxMode?: boolean;
  requestsCosts?: number;
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    cacheWriteTokens?: number;
    cacheReadTokens?: number;
    totalCents?: number;
  };
}

interface CursorUsageResponse {
  usageEvents: CursorUsageEvent[];
  totalUsageEventsCount: number;
  pagination: {
    numPages: number;
    currentPage: number;
    pageSize: number;
    hasNextPage: boolean;
  };
}

export interface SyncResult {
  success: boolean;
  recordsImported: number;
  recordsSkipped: number;
  errors: string[];
  syncedRange?: { startMs: number; endMs: number };
}

const SYNC_STATE_ID = 'cursor';

// Get the start of an hour (floor to hour boundary)
function getHourStart(date: Date): Date {
  const result = new Date(date);
  result.setMinutes(0, 0, 0);
  return result;
}

// Get the previous complete hour end (the start of the current hour)
// E.g., if it's 2:30pm, returns 2:00pm (end of 1:00-2:00pm hour)
export function getPreviousCompleteHourEnd(): Date {
  return getHourStart(new Date());
}

// Get Cursor sync state from database
export async function getCursorSyncState(): Promise<{ lastSyncedHourEnd: number | null }> {
  const result = await sql`
    SELECT last_synced_hour_end FROM sync_state WHERE id = ${SYNC_STATE_ID}
  `;
  if (result.rows.length === 0 || !result.rows[0].last_synced_hour_end) {
    return { lastSyncedHourEnd: null };
  }
  return { lastSyncedHourEnd: parseInt(result.rows[0].last_synced_hour_end) };
}

// Update Cursor sync state
async function updateCursorSyncState(lastSyncedHourEnd: number): Promise<void> {
  await sql`
    INSERT INTO sync_state (id, last_sync_at, last_synced_hour_end)
    VALUES (${SYNC_STATE_ID}, NOW(), ${lastSyncedHourEnd.toString()})
    ON CONFLICT (id) DO UPDATE SET
      last_sync_at = NOW(),
      last_synced_hour_end = ${lastSyncedHourEnd.toString()}
  `;
}

// Get backfill state - derives oldest date from actual usage data
export async function getCursorBackfillState(): Promise<{ oldestDate: string | null; isComplete: boolean }> {
  // Get actual oldest date from usage_records (source of truth)
  const usageResult = await sql`
    SELECT MIN(date)::text as oldest_date FROM usage_records WHERE tool = 'cursor'
  `;
  const oldestDate = usageResult.rows[0]?.oldest_date || null;

  // Check if backfill has been explicitly marked complete (hit API's data limit)
  const stateResult = await sql`
    SELECT backfill_complete FROM sync_state WHERE id = ${SYNC_STATE_ID}
  `;
  const isComplete = stateResult.rows[0]?.backfill_complete === 'true';

  return { oldestDate, isComplete };
}

// Mark backfill as complete (hit API's data limit - no more historical data)
async function markCursorBackfillComplete(): Promise<void> {
  await sql`
    INSERT INTO sync_state (id, last_sync_at, backfill_complete)
    VALUES (${SYNC_STATE_ID}, NOW(), 'true')
    ON CONFLICT (id) DO UPDATE SET
      last_sync_at = NOW(),
      backfill_complete = 'true'
  `;
}

// Reset backfill complete flag (allows backfill to retry)
export async function resetCursorBackfillComplete(): Promise<void> {
  await sql`
    UPDATE sync_state SET backfill_complete = NULL WHERE id = ${SYNC_STATE_ID}
  `;
}

function getCursorAuthHeader(): string | null {
  const adminKey = process.env.CURSOR_ADMIN_KEY;
  if (!adminKey) {
    return null;
  }
  // Cursor API uses Basic auth with API key as username, empty password
  const credentials = `${adminKey}:`;
  return `Basic ${Buffer.from(credentials).toString('base64')}`;
}

interface AggregatedRecord {
  email: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  cost: number;
}

// Create a composite key that's safe to split (uses null character separator)
function makeKey(date: string, email: string, model: string): string {
  return [date, email, model].join('\0');
}

function parseKey(key: string): { date: string; email: string; model: string } {
  const [date, email, model] = key.split('\0');
  return { date, email, model };
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch Cursor usage for a specific time range.
 * This is the low-level fetch function - it doesn't track state.
 * Immediately aborts on rate limit (no retries) - caller should handle rescheduling.
 */
async function fetchCursorUsage(
  startMs: number,
  endMs: number,
  authHeader: string
): Promise<{ events: CursorUsageEvent[]; errors: string[]; rateLimited: boolean }> {
  const events: CursorUsageEvent[] = [];
  const errors: string[] = [];
  let rateLimited = false;

  let page = 1;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    try {
      const response = await fetch(
        'https://api.cursor.com/teams/filtered-usage-events',
        {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            startDate: startMs,
            endDate: endMs,
            page,
            pageSize
          })
        }
      );

      // On rate limit, immediately abort - don't retry
      if (response.status === 429) {
        rateLimited = true;
        const errorText = await response.text();
        errors.push(`Cursor API rate limited: ${errorText}`);
        break;
      }

      if (!response.ok) {
        const errorText = await response.text();
        errors.push(`Cursor API error: ${response.status} - ${errorText}`);
        break;
      }

      const data: CursorUsageResponse = await response.json();
      events.push(...(data.usageEvents || []));

      if (data.pagination?.hasNextPage) {
        page++;
        // Rate limit: 20 requests per minute = 3 seconds between requests
        await sleep(3000);
      } else {
        hasMore = false;
      }
    } catch (err) {
      errors.push(`Fetch error: ${err instanceof Error ? err.message : 'Unknown'}`);
      break;
    }
  }

  return { events, errors, rateLimited };
}

/**
 * Process events into aggregated records and insert into database.
 */
async function processAndInsertEvents(
  events: CursorUsageEvent[]
): Promise<{ imported: number; skipped: number; errors: string[] }> {
  const aggregated = new Map<string, AggregatedRecord>();
  let skipped = 0;

  for (const event of events) {
    const tokenUsage = event.tokenUsage;

    // Skip events with no tokens at all (including cache)
    const totalTokens = (tokenUsage?.inputTokens || 0) +
      (tokenUsage?.outputTokens || 0) +
      (tokenUsage?.cacheWriteTokens || 0) +
      (tokenUsage?.cacheReadTokens || 0);
    if (totalTokens === 0) {
      skipped++;
      continue;
    }

    // Convert timestamp string to date
    const date = new Date(parseInt(event.timestamp)).toISOString().split('T')[0];
    const email = event.userEmail;
    const model = normalizeModelName(event.model);
    const key = makeKey(date, email, model);

    const existing = aggregated.get(key);
    if (existing) {
      existing.inputTokens += tokenUsage?.inputTokens || 0;
      existing.outputTokens += tokenUsage?.outputTokens || 0;
      existing.cacheWriteTokens += tokenUsage?.cacheWriteTokens || 0;
      existing.cacheReadTokens += tokenUsage?.cacheReadTokens || 0;
      existing.cost += (tokenUsage?.totalCents || 0) / 100;
    } else {
      aggregated.set(key, {
        email,
        model,
        inputTokens: tokenUsage?.inputTokens || 0,
        outputTokens: tokenUsage?.outputTokens || 0,
        cacheWriteTokens: tokenUsage?.cacheWriteTokens || 0,
        cacheReadTokens: tokenUsage?.cacheReadTokens || 0,
        cost: (tokenUsage?.totalCents || 0) / 100
      });
    }
  }

  // Insert aggregated records
  let imported = 0;
  const errors: string[] = [];

  for (const [key, aggData] of aggregated) {
    const { date } = parseKey(key);
    try {
      await insertUsageRecord({
        date,
        email: aggData.email,
        tool: 'cursor',
        model: aggData.model,
        inputTokens: aggData.inputTokens,
        cacheWriteTokens: aggData.cacheWriteTokens,
        cacheReadTokens: aggData.cacheReadTokens,
        outputTokens: aggData.outputTokens,
        cost: aggData.cost
      });
      imported++;
    } catch (err) {
      errors.push(`Insert error: ${err instanceof Error ? err.message : 'Unknown'}`);
      skipped++;
    }
  }

  return { imported, skipped, errors };
}

/**
 * Sync Cursor usage for the cron job.
 * Only syncs if there's a new complete hour that hasn't been synced yet.
 * Returns early if already synced to respect rate limits.
 */
export async function syncCursorCron(): Promise<SyncResult> {
  const authHeader = getCursorAuthHeader();
  if (!authHeader) {
    return {
      success: false,
      recordsImported: 0,
      recordsSkipped: 0,
      errors: ['CURSOR_ADMIN_KEY not configured']
    };
  }

  // Get current complete hour boundary
  const currentHourEnd = getPreviousCompleteHourEnd().getTime();

  // Check what we've already synced
  const { lastSyncedHourEnd } = await getCursorSyncState();

  // If we've already synced up to or past the current complete hour, skip
  if (lastSyncedHourEnd && lastSyncedHourEnd >= currentHourEnd) {
    return {
      success: true,
      recordsImported: 0,
      recordsSkipped: 0,
      errors: [],
      syncedRange: undefined
    };
  }

  // Determine the range to sync
  // If never synced, start from 24 hours ago (to avoid huge initial fetch)
  const startMs = lastSyncedHourEnd || (currentHourEnd - 24 * 60 * 60 * 1000);
  const endMs = currentHourEnd;

  // Fetch and process
  const { events, errors: fetchErrors } = await fetchCursorUsage(startMs, endMs, authHeader);
  const { imported, skipped, errors: insertErrors } = await processAndInsertEvents(events);

  // Update sync state to mark this hour as synced
  await updateCursorSyncState(endMs);

  return {
    success: fetchErrors.length === 0,
    recordsImported: imported,
    recordsSkipped: skipped,
    errors: [...fetchErrors, ...insertErrors],
    syncedRange: { startMs, endMs }
  };
}

/**
 * Sync Cursor usage for a specific date range.
 * Used for backfills and manual syncs.
 * Does NOT update sync state - use syncCursorCron for production syncing.
 *
 * @param startDate ISO date string (YYYY-MM-DD)
 * @param endDate ISO date string (YYYY-MM-DD)
 */
export async function syncCursorUsage(
  startDate: string,
  endDate: string
): Promise<SyncResult> {
  const authHeader = getCursorAuthHeader();
  if (!authHeader) {
    return {
      success: false,
      recordsImported: 0,
      recordsSkipped: 0,
      errors: ['CURSOR_ADMIN_KEY not configured']
    };
  }

  // Convert to epoch milliseconds (start of start day, end of end day)
  const startMs = new Date(startDate).getTime();
  const endMs = new Date(endDate).getTime() + 24 * 60 * 60 * 1000; // End of end day

  const { events, errors: fetchErrors } = await fetchCursorUsage(startMs, endMs, authHeader);
  const { imported, skipped, errors: insertErrors } = await processAndInsertEvents(events);

  return {
    success: fetchErrors.length === 0,
    recordsImported: imported,
    recordsSkipped: skipped,
    errors: [...fetchErrors, ...insertErrors],
    syncedRange: { startMs, endMs }
  };
}

/**
 * Backfill Cursor data, processing one day at a time from newest to oldest.
 * - Works backwards from the oldest date we have data for
 * - Immediately aborts on rate limit
 * - Marks complete when hitting consecutive empty days (no more historical data)
 * - Can be resumed by calling again with the same target date
 */
export async function backfillCursorUsage(
  targetDate: string,
  _endDate: string,
  options: {
    onProgress?: (msg: string) => void;
    stopOnEmptyDays?: number;   // Stop after N consecutive days with 0 events (default: 7)
  } = {}
): Promise<SyncResult & { rateLimited: boolean; lastProcessedDate: string | null }> {
  const authHeader = getCursorAuthHeader();
  if (!authHeader) {
    return {
      success: false,
      recordsImported: 0,
      recordsSkipped: 0,
      errors: ['CURSOR_ADMIN_KEY not configured'],
      rateLimited: false,
      lastProcessedDate: null
    };
  }

  const log = options.onProgress || (() => {});
  const stopOnEmptyDays = options.stopOnEmptyDays ?? 7;

  // Get current backfill state from actual data
  const { oldestDate: existingOldest, isComplete } = await getCursorBackfillState();

  // If backfill is marked complete, nothing to do
  if (isComplete) {
    log(`Backfill already marked complete, skipping.`);
    return {
      success: true,
      recordsImported: 0,
      recordsSkipped: 0,
      errors: [],
      rateLimited: false,
      lastProcessedDate: null
    };
  }

  // If we've already reached the target date, nothing to do
  if (existingOldest && existingOldest <= targetDate) {
    log(`Already have data back to ${existingOldest}, target is ${targetDate}. Done.`);
    return {
      success: true,
      recordsImported: 0,
      recordsSkipped: 0,
      errors: [],
      rateLimited: false,
      lastProcessedDate: null
    };
  }

  // Determine range to sync: work backwards from oldest existing data
  const targetMs = new Date(targetDate).getTime();
  let endMs: number;
  if (existingOldest) {
    // Start from the day before our oldest data
    endMs = new Date(existingOldest).getTime();
  } else {
    // No existing data - start from now
    endMs = getHourStart(new Date()).getTime();
  }

  let totalImported = 0;
  let totalSkipped = 0;
  const allErrors: string[] = [];
  let consecutiveEmptyDays = 0;
  let lastProcessedDate: string | null = null;
  let rateLimited = false;

  // Process in daily chunks, going BACKWARDS (newest to oldest)
  const oneDay = 24 * 60 * 60 * 1000;
  let currentEnd = endMs;

  while (currentEnd > targetMs) {
    const currentStart = Math.max(currentEnd - oneDay, targetMs);
    const dateStr = new Date(currentStart).toISOString().split('T')[0];

    log(`Fetching ${dateStr}...`);

    const { events, errors: fetchErrors, rateLimited: wasRateLimited } = await fetchCursorUsage(
      currentStart,
      currentEnd,
      authHeader
    );

    if (wasRateLimited) {
      rateLimited = true;
      log(`  Rate limited! Will retry on next run.`);
      allErrors.push(`Rate limited at ${dateStr}`);
      break;
    }

    if (fetchErrors.length > 0) {
      allErrors.push(...fetchErrors);
      log(`  Errors: ${fetchErrors.join(', ')}`);
      break;
    }

    // Process the events
    const { imported, skipped, errors: insertErrors } = await processAndInsertEvents(events);
    totalImported += imported;
    totalSkipped += skipped;
    allErrors.push(...insertErrors);
    log(`  Imported: ${imported}, Skipped: ${skipped}`);
    lastProcessedDate = dateStr;

    // Track consecutive empty days (0 events from API)
    if (events.length === 0) {
      consecutiveEmptyDays++;
      if (consecutiveEmptyDays >= stopOnEmptyDays) {
        log(`  ${consecutiveEmptyDays} consecutive empty days. Marking backfill complete.`);
        await markCursorBackfillComplete();
        break;
      }
    } else {
      consecutiveEmptyDays = 0;
    }

    currentEnd = currentStart;

    // Brief delay between days
    if (currentEnd > targetMs) {
      await sleep(3000);
    }
  }

  // Update forward sync state if needed
  const { lastSyncedHourEnd } = await getCursorSyncState();
  const hourEnd = getHourStart(new Date()).getTime();
  if (!lastSyncedHourEnd || hourEnd > lastSyncedHourEnd) {
    await updateCursorSyncState(hourEnd);
  }

  return {
    success: allErrors.length === 0 && !rateLimited,
    recordsImported: totalImported,
    recordsSkipped: totalSkipped,
    errors: allErrors,
    syncedRange: { startMs: targetMs, endMs },
    rateLimited,
    lastProcessedDate
  };
}
