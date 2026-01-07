import { insertUsageRecord, getToolIdentityMappings } from '../queries';
import { calculateCost } from '../db';
import { normalizeModelName } from '../utils';
import { sql } from '@vercel/postgres';

interface OpenAIUsageResult {
  input_tokens: number;
  output_tokens: number;
  input_cached_tokens: number;
  num_model_requests: number;
  project_id: string | null;
  user_id: string | null;
  api_key_id: string | null;
  model: string | null;
  batch: boolean;
  service_tier: string | null;
}

interface OpenAITimeBucket {
  start_time: number; // Unix timestamp in seconds
  end_time: number;
  results: OpenAIUsageResult[];
}

interface OpenAIUsageResponse {
  object: string;
  data: OpenAITimeBucket[];
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

const SYNC_STATE_ID = 'openai';

// Get OpenAI sync state from database
export async function getOpenAISyncState(): Promise<{ lastSyncedDate: string | null }> {
  const result = await sql`
    SELECT last_synced_hour_end FROM sync_state WHERE id = ${SYNC_STATE_ID}
  `;
  if (result.rows.length === 0 || !result.rows[0].last_synced_hour_end) {
    return { lastSyncedDate: null };
  }
  return { lastSyncedDate: result.rows[0].last_synced_hour_end };
}

// Update OpenAI sync state
async function updateOpenAISyncState(lastSyncedDate: string): Promise<void> {
  await sql`
    INSERT INTO sync_state (id, last_sync_at, last_synced_hour_end)
    VALUES (${SYNC_STATE_ID}, NOW(), ${lastSyncedDate})
    ON CONFLICT (id) DO UPDATE SET
      last_sync_at = NOW(),
      last_synced_hour_end = ${lastSyncedDate}
  `;
}

// Get backfill state - derives oldest date from actual usage data
export async function getOpenAIBackfillState(): Promise<{ oldestDate: string | null; isComplete: boolean }> {
  const usageResult = await sql`
    SELECT MIN(date)::text as oldest_date FROM usage_records WHERE tool = 'openai'
  `;
  const oldestDate = usageResult.rows[0]?.oldest_date || null;

  const stateResult = await sql`
    SELECT backfill_complete FROM sync_state WHERE id = ${SYNC_STATE_ID}
  `;
  const isComplete = stateResult.rows[0]?.backfill_complete === true;

  return { oldestDate, isComplete };
}

// Mark backfill as complete
async function markOpenAIBackfillComplete(): Promise<void> {
  await sql`
    INSERT INTO sync_state (id, last_sync_at, backfill_complete)
    VALUES (${SYNC_STATE_ID}, NOW(), true)
    ON CONFLICT (id) DO UPDATE SET
      last_sync_at = NOW(),
      backfill_complete = true
  `;
}

// Reset backfill complete flag
export async function resetOpenAIBackfillComplete(): Promise<void> {
  await sql`
    UPDATE sync_state SET backfill_complete = false WHERE id = ${SYNC_STATE_ID}
  `;
}

/**
 * Sync OpenAI usage for a specific date range.
 * This is the low-level function that does the actual API fetching.
 * Does NOT update sync state - use syncOpenAICron for production syncing.
 */
export async function syncOpenAIUsage(
  startDate: string,
  endDate: string,
  options: { bucketWidth?: '1d' | '1h' | '1m' } = {}
): Promise<SyncResult> {
  const adminKey = process.env.OPENAI_ADMIN_KEY;
  if (!adminKey) {
    return {
      success: false,
      recordsImported: 0,
      recordsSkipped: 0,
      errors: ['OPENAI_ADMIN_KEY not configured']
    };
  }

  const result: SyncResult = {
    success: true,
    recordsImported: 0,
    recordsSkipped: 0,
    errors: [],
    syncedRange: { startDate, endDate }
  };

  // Get existing mappings for openai (user_id -> email)
  const mappingsArray = await getToolIdentityMappings('openai');
  const mappings = new Map<string, string>(
    mappingsArray.map(m => [m.external_id, m.email])
  );

  const bucketWidth = options.bucketWidth || '1d';

  // Convert dates to Unix timestamps (seconds)
  const startTime = Math.floor(new Date(startDate).getTime() / 1000);
  const endTime = Math.floor(new Date(endDate + 'T23:59:59Z').getTime() / 1000);

  let page: string | undefined;

  try {
    do {
      const params = new URLSearchParams({
        start_time: startTime.toString(),
        end_time: endTime.toString(),
        bucket_width: bucketWidth,
        'group_by[]': 'user_id',
      });
      params.append('group_by[]', 'model');

      if (page) {
        params.set('page', page);
      }

      const response = await fetch(
        `https://api.openai.com/v1/organization/usage/completions?${params}`,
        {
          headers: {
            'Authorization': `Bearer ${adminKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      // On rate limit, immediately abort
      if (response.status === 429) {
        const errorText = await response.text();
        result.success = false;
        result.errors.push(`OpenAI API rate limited: ${errorText}`);
        return result;
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
      }

      const data: OpenAIUsageResponse = await response.json();

      for (const bucket of data.data) {
        // Convert Unix timestamp to date string
        const date = new Date(bucket.start_time * 1000).toISOString().split('T')[0];

        for (const item of bucket.results) {
          if (!item.model) continue;

          // Resolve email from user_id mapping
          let email = 'unknown';
          const userId = item.user_id;

          if (userId) {
            email = mappings.get(userId) || 'unknown';
          }

          const inputTokens = item.input_tokens || 0;
          const outputTokens = item.output_tokens || 0;
          const cacheReadTokens = item.input_cached_tokens || 0;
          // OpenAI doesn't have separate cache write tokens in usage API
          const cacheWriteTokens = 0;

          const cost = calculateCost(item.model, inputTokens, outputTokens, cacheWriteTokens, cacheReadTokens);

          try {
            await insertUsageRecord({
              date,
              email,
              tool: 'openai',
              model: normalizeModelName(item.model || 'unknown'),
              inputTokens,
              cacheWriteTokens,
              cacheReadTokens,
              outputTokens,
              cost,
              toolRecordId: userId || undefined
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
 * Sync OpenAI usage for the cron job.
 * Tracks state to avoid re-fetching data we already have.
 * Syncs from (last_synced_date - 1 day) to yesterday.
 */
export async function syncOpenAICron(): Promise<SyncResult> {
  const adminKey = process.env.OPENAI_ADMIN_KEY;
  if (!adminKey) {
    return {
      success: false,
      recordsImported: 0,
      recordsSkipped: 0,
      errors: ['OPENAI_ADMIN_KEY not configured']
    };
  }

  // Get yesterday's date (complete day)
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  // Check what we've already synced
  const { lastSyncedDate } = await getOpenAISyncState();

  // If we've already synced yesterday, nothing to do
  if (lastSyncedDate && lastSyncedDate >= yesterdayStr) {
    return {
      success: true,
      recordsImported: 0,
      recordsSkipped: 0,
      errors: [],
      syncedRange: undefined
    };
  }

  // Determine start date
  let startDate: string;
  if (!lastSyncedDate) {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    startDate = weekAgo.toISOString().split('T')[0];
  } else {
    const lastDate = new Date(lastSyncedDate);
    lastDate.setDate(lastDate.getDate() - 1);
    startDate = lastDate.toISOString().split('T')[0];
  }

  const endDate = yesterdayStr;

  const syncResult = await syncOpenAIUsage(startDate, endDate);

  if (syncResult.success) {
    await updateOpenAISyncState(yesterdayStr);
  }

  return syncResult;
}

/**
 * Backfill OpenAI data for a date range.
 * Works backwards from the oldest date we have data for.
 */
export async function backfillOpenAIUsage(
  targetDate: string,
  options: { onProgress?: (msg: string) => void; stopOnEmptyDays?: number } = {}
): Promise<SyncResult & { rateLimited: boolean }> {
  const log = options.onProgress || (() => {});
  const stopOnEmptyDays = options.stopOnEmptyDays ?? 7;

  const { oldestDate: existingOldest, isComplete } = await getOpenAIBackfillState();

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

  let endDate: string;
  if (existingOldest) {
    const oldestDate = new Date(existingOldest);
    oldestDate.setDate(oldestDate.getDate() - 1);
    endDate = oldestDate.toISOString().split('T')[0];
  } else {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    endDate = yesterday.toISOString().split('T')[0];
  }

  if (endDate < targetDate) {
    endDate = targetDate;
  }

  log(`Fetching OpenAI usage from ${targetDate} to ${endDate}...`);
  const syncResult = await syncOpenAIUsage(targetDate, endDate);

  const rateLimited = syncResult.errors.some(e => e.includes('rate limited'));

  if (rateLimited) {
    log(`Rate limited! Will retry on next run.`);
  } else if (syncResult.success) {
    if (syncResult.recordsImported === 0) {
      const startMs = new Date(targetDate).getTime();
      const endMs = new Date(endDate).getTime();
      const daysCovered = Math.ceil((endMs - startMs) / (24 * 60 * 60 * 1000));

      log(`No records found for ${targetDate} to ${endDate} (${daysCovered} days).`);

      if (daysCovered <= stopOnEmptyDays) {
        log(`Small range (${daysCovered} days) with no data. Marking backfill complete.`);
        await markOpenAIBackfillComplete();
      } else {
        log(`Large range - will continue backfilling on next run.`);
      }
    } else {
      log(`Imported ${syncResult.recordsImported} records.`);
    }
  }

  return { ...syncResult, rateLimited };
}
