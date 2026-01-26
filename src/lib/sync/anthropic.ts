import * as Sentry from '@sentry/nextjs';
import { insertUsageRecord } from '../queries';
import { db, syncState, usageRecords } from '../db';
import { normalizeModelName } from '../utils';
import { eq, min, and, sql } from 'drizzle-orm';
import { getApiKeyNameToEmailMap } from './anthropic-mappings';

/**
 * Claude Code Analytics API response types
 * Endpoint: /v1/organizations/usage_report/claude_code
 * Docs: https://platform.claude.com/docs/en/build-with-claude/claude-code-analytics-api
 */

interface ClaudeCodeActor {
  type: 'user_actor' | 'api_actor';
  email_address?: string;  // Present when type is 'user_actor'
  api_key_name?: string;   // Present when type is 'api_actor'
}

interface ClaudeCodeTokens {
  input: number;
  output: number;
  cache_read: number;
  cache_creation: number;
}

interface ClaudeCodeEstimatedCost {
  currency: string;  // Always 'USD'
  amount: number;    // Cost in cents
}

interface ClaudeCodeModelBreakdown {
  model: string;
  tokens: ClaudeCodeTokens;
  estimated_cost: ClaudeCodeEstimatedCost;
}

interface ClaudeCodeRecord {
  date: string;  // RFC 3339 format
  actor: ClaudeCodeActor;
  organization_id: string;
  customer_type: 'api' | 'subscription';
  terminal_type: string;
  core_metrics: {
    num_sessions: number;
    lines_of_code: {
      added: number;
      removed: number;
    };
    commits_by_claude_code: number;
    pull_requests_by_claude_code: number;
  };
  tool_actions: {
    edit_tool: { accepted: number; rejected: number };
    multi_edit_tool?: { accepted: number; rejected: number };
    write_tool: { accepted: number; rejected: number };
    notebook_edit_tool: { accepted: number; rejected: number };
  };
  model_breakdown: ClaudeCodeModelBreakdown[];
}

interface ClaudeCodeAnalyticsResponse {
  data: ClaudeCodeRecord[];
  has_more: boolean;
  next_page: string | null;
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
 * Fetch Claude Code analytics for a single date from Anthropic's API.
 * Uses the Claude Code Analytics API which provides:
 * - Per-user email attribution (no API key mapping needed)
 * - Accurate estimated_cost calculated by Anthropic
 * - Token breakdowns per model
 */
async function fetchClaudeCodeAnalytics(
  adminKey: string,
  date: string,
  page?: string
): Promise<{ response: Response; data?: ClaudeCodeAnalyticsResponse }> {
  const params = new URLSearchParams({
    starting_at: date,
    limit: '1000',
  });

  if (page) {
    params.set('page', page);
  }

  const response = await fetch(
    `https://api.anthropic.com/v1/organizations/usage_report/claude_code?${params}`,
    {
      headers: {
        'X-Api-Key': adminKey,
        'anthropic-version': '2023-06-01'
      }
    }
  );

  if (!response.ok) {
    return { response };
  }

  const data: ClaudeCodeAnalyticsResponse = await response.json();
  return { response, data };
}

/**
 * Sync Claude Code usage for a specific date.
 * Uses the Claude Code Analytics API for accurate costs and direct email attribution.
 *
 * After inserting fresh data, cleans up stale records from the old sync that used
 * API key IDs as toolRecordId. New records have toolRecordId=NULL, so any records
 * with non-null toolRecordId are deleted after successful insert.
 *
 * CONCURRENCY NOTE: Not safe for concurrent execution on the same date.
 * Multiple concurrent syncs will race on UPSERT, causing last write to win and data loss.
 * Mitigation: syncAnthropicCron() has early-exit logic to prevent concurrent runs.
 * Manual CLI calls should avoid overlapping dates.
 */
async function syncClaudeCodeForDate(
  adminKey: string,
  date: string,
  apiKeyNameToEmail: Map<string, string>
): Promise<SyncResult> {
  const result: SyncResult = {
    success: true,
    recordsImported: 0,
    recordsSkipped: 0,
    errors: [],
    syncedRange: { startDate: date, endDate: date }
  };

  let page: string | undefined;
  let insertErrors = 0;

  // Aggregate records by (date, email, rawModel) before inserting.
  // Multiple API keys can belong to the same user, and the insertUsageRecord UPSERT
  // would overwrite instead of summing when it encounters duplicate (date, email, tool, raw_model).
  // Aggregating first ensures we don't lose data.
  type AggregationKey = string; // Format: "date|email|rawModel"
  type AggregatedRecord = Omit<Parameters<typeof insertUsageRecord>[0], 'tool' | 'model'>;
  const aggregated = new Map<AggregationKey, AggregatedRecord>();

  try {
    do {
      const { response, data } = await fetchClaudeCodeAnalytics(adminKey, date, page);

      // On rate limit, stop pagination but continue to cleanup
      if (response.status === 429) {
        console.warn('[Anthropic Sync] Rate limited - will retry on next run');
        const errorText = await response.text();
        result.success = false;
        result.errors.push(`Anthropic API rate limited: ${errorText}`);
        break;
      }

      if (!response.ok || !data) {
        const errorText = await response.text();
        const error = new Error(`Anthropic API error: ${response.status} - ${errorText}`);
        Sentry.captureException(error);
        throw error;
      }

      for (const record of data.data) {
        // Extract email from actor
        const email = record.actor.email_address
          ?? (record.actor.type === 'api_actor' && record.actor.api_key_name
            ? apiKeyNameToEmail.get(record.actor.api_key_name)
            : null);

        // Skip records without email attribution
        if (!email) {
          result.recordsSkipped++;
          continue;
        }

        // Extract date (just the date portion from RFC 3339)
        const recordDate = record.date.split('T')[0];

        // Process each model in the breakdown
        for (const modelData of record.model_breakdown) {
          const rawModel = modelData.model || undefined;
          const key: AggregationKey = `${recordDate}|${email}|${rawModel || 'unknown'}`;

          const existing = aggregated.get(key);
          const costInDollars = (modelData.estimated_cost.amount || 0) / 100;

          if (existing) {
            // Aggregate: sum tokens and costs
            existing.inputTokens += modelData.tokens.input || 0;
            existing.outputTokens += modelData.tokens.output || 0;
            existing.cacheWriteTokens += modelData.tokens.cache_creation || 0;
            existing.cacheReadTokens += modelData.tokens.cache_read || 0;
            existing.cost += costInDollars;
          } else {
            // First occurrence: create new entry
            aggregated.set(key, {
              date: recordDate,
              email,
              rawModel,
              inputTokens: modelData.tokens.input || 0,
              outputTokens: modelData.tokens.output || 0,
              cacheWriteTokens: modelData.tokens.cache_creation || 0,
              cacheReadTokens: modelData.tokens.cache_read || 0,
              cost: costInDollars,
            });
          }
        }
      }

      page = data.has_more && data.next_page ? data.next_page : undefined;
    } while (page);

    // Insert aggregated records
    for (const record of aggregated.values()) {
      try {
        await insertUsageRecord({
          date: record.date,
          email: record.email,
          tool: 'claude_code',
          model: normalizeModelName(record.rawModel || 'unknown'),
          rawModel: record.rawModel,
          inputTokens: record.inputTokens,
          cacheWriteTokens: record.cacheWriteTokens,
          cacheReadTokens: record.cacheReadTokens,
          outputTokens: record.outputTokens,
          cost: record.cost,
        });
        result.recordsImported++;
      } catch (err) {
        result.errors.push(`Insert error: ${err instanceof Error ? err.message : 'Unknown'}`);
        result.recordsSkipped++;
        result.success = false;
        insertErrors++;
      }
    }

  } catch (err) {
    result.success = false;
    result.errors.push(err instanceof Error ? err.message : 'Unknown error');
  }

  // Clean up legacy records only on fully successful sync
  if (result.success && result.recordsImported > 0 && insertErrors === 0) {
    try {
      await db.delete(usageRecords)
        .where(
          and(
            eq(usageRecords.date, date),
            eq(usageRecords.tool, 'claude_code'),
            sql`${usageRecords.toolRecordId} IS NOT NULL`
          )
        );
    } catch (deleteErr) {
      const error = new Error(`Failed to clean up legacy records for ${date}: ${deleteErr instanceof Error ? deleteErr.message : 'Unknown'}`);
      Sentry.captureException(error);
      result.errors.push(error.message);
      result.success = false;
    }
  }

  return result;
}

/**
 * Sync Anthropic usage for a date range.
 * Iterates through each date and fetches data from Claude Code Analytics API.
 */
export async function syncAnthropicUsage(
  startDate: string,
  endDate: string
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

  // Generate list of dates to sync
  const dates: string[] = [];
  const current = new Date(startDate);
  const end = new Date(endDate);

  while (current <= end) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }

  // Fetch API key name -> email map once for all dates (avoids redundant API calls)
  const apiKeyNameToEmail = await getApiKeyNameToEmailMap({ includeArchived: true });

  // Sync each date
  for (const date of dates) {
    const dateResult = await syncClaudeCodeForDate(adminKey, date, apiKeyNameToEmail);

    result.recordsImported += dateResult.recordsImported;
    result.recordsSkipped += dateResult.recordsSkipped;
    result.errors.push(...dateResult.errors);

    if (!dateResult.success) {
      result.success = false;
      // Stop on rate limit or error
      if (dateResult.errors.some(e => e.includes('rate limited'))) {
        break;
      }
    }
  }

  return result;
}

/**
 * Sync Anthropic usage for the cron job.
 * Runs every 6 hours. Syncs from yesterday to today.
 * Note: Claude Code Analytics API has ~1h lag.
 *
 * Safe to call frequently - returns early if already synced today.
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

  // Check if we've already synced today - skip to avoid redundant API calls
  const { lastSyncedDate } = await getAnthropicSyncState();
  if (lastSyncedDate === todayStr) {
    return {
      success: true,
      recordsImported: 0,
      recordsSkipped: 0,
      errors: [],
      syncedRange: undefined  // Signal no actual sync occurred
    };
  }

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
