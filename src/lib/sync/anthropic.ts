import { insertUsageRecord, getIdentityMappings } from '../queries';
import { db, calculateCost, syncState, usageRecords } from '../db';
import { normalizeModelName } from '../utils';
import { eq, min } from 'drizzle-orm';

interface AnthropicUsageResult {
  api_key_id: string | null;
  workspace_id: string | null;
  model: string | null;
  service_tier: string | null;
  context_window: string | null;
  uncached_input_tokens: number;
  cache_creation: {
    ephemeral_1h_input_tokens: number;
    ephemeral_5m_input_tokens: number;
  };
  cache_read_input_tokens: number;
  output_tokens: number;
  server_tool_use: {
    web_search_requests: number;
  };
}

interface AnthropicTimeBucket {
  starting_at: string;
  ending_at: string;
  results: AnthropicUsageResult[];
}

interface AnthropicUsageResponse {
  data: AnthropicTimeBucket[];
  has_more: boolean;
  next_page?: string;
}

export interface SyncResult {
  success: boolean;
  recordsImported: number;
  recordsSkipped: number;
  errors: string[];
  syncedRange?: { startDate: string; endDate: string };
}

const SYNC_STATE_ID = 'anthropic';

// Get Anthropic sync state from database
export async function getAnthropicSyncState(): Promise<{ lastSyncedDate: string | null; lastSyncAt: string | null }> {
  const result = await db
    .select({
      lastSyncedHourEnd: syncState.lastSyncedHourEnd,
      lastSyncAt: syncState.lastSyncAt,
    })
    .from(syncState)
    .where(eq(syncState.id, SYNC_STATE_ID));

  if (result.length === 0) {
    return { lastSyncedDate: null, lastSyncAt: null };
  }
  const row = result[0];
  return {
    // Date string of last synced data (e.g., "2025-01-08")
    lastSyncedDate: row.lastSyncedHourEnd || null,
    // Actual timestamp when sync ran (for freshness check)
    lastSyncAt: row.lastSyncAt ? new Date(row.lastSyncAt).toISOString() : null
  };
}

// Update Anthropic sync state
async function updateAnthropicSyncState(lastSyncedDate: string): Promise<void> {
  await db
    .insert(syncState)
    .values({
      id: SYNC_STATE_ID,
      lastSyncAt: new Date(),
      lastSyncedHourEnd: lastSyncedDate,
    })
    .onConflictDoUpdate({
      target: syncState.id,
      set: {
        lastSyncAt: new Date(),
        lastSyncedHourEnd: lastSyncedDate,
      },
    });
}


// Get backfill state - derives oldest date from actual usage data
export async function getAnthropicBackfillState(): Promise<{ oldestDate: string | null; isComplete: boolean }> {
  // Get actual oldest date from usage_records (source of truth)
  const usageResult = await db
    .select({ oldestDate: min(usageRecords.date) })
    .from(usageRecords)
    .where(eq(usageRecords.tool, 'claude_code'));
  const oldestDate = usageResult[0]?.oldestDate || null;

  // Check if backfill has been explicitly marked complete (hit API's data limit)
  const stateResult = await db
    .select({ backfillComplete: syncState.backfillComplete })
    .from(syncState)
    .where(eq(syncState.id, SYNC_STATE_ID));
  const isComplete = stateResult[0]?.backfillComplete === true;

  return { oldestDate, isComplete };
}

// Mark backfill as complete (hit API's data limit - no more historical data)
async function markAnthropicBackfillComplete(): Promise<void> {
  await db
    .insert(syncState)
    .values({
      id: SYNC_STATE_ID,
      lastSyncAt: new Date(),
      backfillComplete: true,
    })
    .onConflictDoUpdate({
      target: syncState.id,
      set: {
        lastSyncAt: new Date(),
        backfillComplete: true,
      },
    });
}

// Reset backfill complete flag (allows backfill to retry)
export async function resetAnthropicBackfillComplete(): Promise<void> {
  await db
    .update(syncState)
    .set({ backfillComplete: false })
    .where(eq(syncState.id, SYNC_STATE_ID));
}

/**
 * Sync Anthropic usage for a specific date range.
 * This is the low-level function that does the actual API fetching.
 * Does NOT update sync state - use syncAnthropicCron for production syncing.
 */
export async function syncAnthropicUsage(
  startDate: string,
  endDate: string,
  options: { bucketWidth?: '1d' | '1h' | '1m' } = {}
): Promise<SyncResult> {
  const adminKey = process.env.ANTHROPIC_ADMIN_KEY;
  if (!adminKey) {
    return {
      success: false,
      recordsImported: 0,
      recordsSkipped: 0,
      errors: ['ANTHROPIC_ADMIN_KEY not configured']
    };
  }

  const result: SyncResult = {
    success: true,
    recordsImported: 0,
    recordsSkipped: 0,
    errors: [],
    syncedRange: { startDate, endDate }
  };

  // Get existing mappings for claude_code
  const mappingsArray = await getIdentityMappings('claude_code');
  const mappings = new Map<string, string>(
    mappingsArray.map(m => [m.external_id, m.email])
  );

  const bucketWidth = options.bucketWidth || '1d';
  let page: string | undefined;

  try {
    do {
      const params = new URLSearchParams({
        starting_at: startDate,
        ending_at: endDate,
        bucket_width: bucketWidth,
        'group_by[]': 'api_key_id',
      });
      params.append('group_by[]', 'model');

      if (page) {
        params.set('page', page);
      }

      const response = await fetch(
        `https://api.anthropic.com/v1/organizations/usage_report/messages?${params}`,
        {
          headers: {
            'X-Api-Key': adminKey,
            'anthropic-version': '2023-06-01'
          }
        }
      );

      // On rate limit, immediately abort - don't retry
      if (response.status === 429) {
        const errorText = await response.text();
        result.success = false;
        result.errors.push(`Anthropic API rate limited: ${errorText}`);
        return result;
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
      }

      const data: AnthropicUsageResponse = await response.json();

      for (const bucket of data.data) {
        const date = bucket.starting_at.split('T')[0];

        for (const item of bucket.results) {
          if (!item.model) continue;

          // Resolve email from API key mapping (null = unattributed usage)
          const apiKeyId = item.api_key_id;
          const email = apiKeyId ? mappings.get(apiKeyId) ?? null : null;

          const inputTokens = item.uncached_input_tokens || 0;
          const cacheWriteTokens = (item.cache_creation?.ephemeral_5m_input_tokens || 0) +
                                   (item.cache_creation?.ephemeral_1h_input_tokens || 0);
          const cacheReadTokens = item.cache_read_input_tokens || 0;
          const outputTokens = item.output_tokens || 0;

          const cost = calculateCost(item.model, inputTokens, outputTokens, cacheWriteTokens, cacheReadTokens);

          try {
            await insertUsageRecord({
              date,
              email,
              tool: 'claude_code',
              model: normalizeModelName(item.model || 'unknown'),
              rawModel: item.model || undefined,
              inputTokens,
              cacheWriteTokens,
              cacheReadTokens,
              outputTokens,
              cost,
              toolRecordId: apiKeyId || undefined
            });
            result.recordsImported++;
          } catch (err) {
            result.errors.push(`Insert error: ${err instanceof Error ? err.message : 'Unknown'}`);
            result.recordsSkipped++;
          }
        }
      }

      page = data.has_more ? data.next_page : undefined;
    } while (page);

  } catch (err) {
    result.success = false;
    result.errors.push(err instanceof Error ? err.message : 'Unknown error');
  }

  return result;
}

/**
 * Sync Anthropic usage for the cron job.
 * Runs hourly to provide same-day visibility into usage data.
 * Syncs from yesterday to today - today's data will be partial until EOD.
 */
export async function syncAnthropicCron(): Promise<SyncResult> {
  const adminKey = process.env.ANTHROPIC_ADMIN_KEY;
  if (!adminKey) {
    return {
      success: false,
      recordsImported: 0,
      recordsSkipped: 0,
      errors: ['ANTHROPIC_ADMIN_KEY not configured']
    };
  }

  // Get today's date
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  // Start from yesterday to catch any late-arriving data
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const startDate = yesterday.toISOString().split('T')[0];

  // Sync yesterday through today (today's data will be partial)
  const result = await syncAnthropicUsage(startDate, todayStr);

  // Update sync state to today if successful
  if (result.success) {
    await updateAnthropicSyncState(todayStr);
  }

  return result;
}

/**
 * Backfill Anthropic data for a date range.
 * - Works backwards from the oldest date we have data for
 * - Immediately aborts on rate limit
 * - Marks complete when hitting consecutive empty days (no more historical data)
 * - Can be resumed by calling again with the same target date
 */
export async function backfillAnthropicUsage(
  targetDate: string,
  options: { onProgress?: (msg: string) => void; stopOnEmptyDays?: number } = {}
): Promise<SyncResult & { rateLimited: boolean }> {
  const log = options.onProgress || (() => {});
  const stopOnEmptyDays = options.stopOnEmptyDays ?? 7;

  // Get current backfill state from actual data
  const { oldestDate: existingOldest, isComplete } = await getAnthropicBackfillState();

  // If backfill is marked complete, nothing to do
  if (isComplete) {
    log(`Backfill already marked complete, skipping.`);
    return {
      success: true,
      recordsImported: 0,
      recordsSkipped: 0,
      errors: [],
      syncedRange: { startDate: targetDate, endDate: existingOldest || targetDate },
      rateLimited: false
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
      syncedRange: { startDate: targetDate, endDate: existingOldest },
      rateLimited: false
    };
  }

  // Determine range to sync: from target date to the day before our oldest data
  // If no existing data, sync from target to yesterday
  let endDate: string;
  if (existingOldest) {
    // Go back one day from oldest to avoid re-fetching
    // Use date arithmetic instead of milliseconds to handle DST correctly
    const oldestDate = new Date(existingOldest);
    oldestDate.setDate(oldestDate.getDate() - 1);
    endDate = oldestDate.toISOString().split('T')[0];
  } else {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    endDate = yesterday.toISOString().split('T')[0];
  }

  // Don't go past target date
  if (endDate < targetDate) {
    endDate = targetDate;
  }

  log(`Fetching Anthropic usage from ${targetDate} to ${endDate}...`);
  const result = await syncAnthropicUsage(targetDate, endDate);

  // Check if we were rate limited
  const rateLimited = result.errors.some(e => e.includes('rate limited'));

  if (rateLimited) {
    log(`Rate limited! Will retry on next run.`);
  } else if (result.success) {
    // Check if we got any data
    if (result.recordsImported === 0) {
      // No data found - calculate how many days this range spans
      const startMs = new Date(targetDate).getTime();
      const endMs = new Date(endDate).getTime();
      const daysCovered = Math.ceil((endMs - startMs) / (24 * 60 * 60 * 1000));

      log(`No records found for ${targetDate} to ${endDate} (${daysCovered} days).`);

      // Only mark complete if we synced a small range and got 0 records
      // This prevents marking complete prematurely when syncing large historical ranges
      // where a gap in data might exist
      if (daysCovered <= stopOnEmptyDays) {
        log(`Small range (${daysCovered} days) with no data. Marking backfill complete.`);
        await markAnthropicBackfillComplete();
      } else {
        log(`Large range - will continue backfilling on next run.`);
      }
    } else {
      log(`Imported ${result.recordsImported} records.`);
    }

    // Note: We intentionally do NOT update forward sync state here.
    // Backfill is for historical data only. Forward sync state is managed
    // by syncAnthropicCron() to track the latest synced date.
  }

  return { ...result, rateLimited };
}
