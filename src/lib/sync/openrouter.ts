import * as Sentry from '@sentry/nextjs';
import { insertUsageRecord } from '../queries';
import { normalizeModelName } from '../utils';
import { db, syncState, usageRecords, openrouterKeys } from '../db';
import { eq, min } from 'drizzle-orm';
import { getOpenRouterActivity } from '../openrouter';
import { NotFoundResponseError } from '@openrouter/sdk/models/errors';
import { getOpenRouterWorkspaces, NO_OPENROUTER_WORKSPACES_ERROR } from '../openrouter-workspaces';

export const NO_OPENROUTER_KEY_ERROR = NO_OPENROUTER_WORKSPACES_ERROR;

const SYNC_STATE_ID = 'openrouter';

export interface SyncResult {
  success: boolean;
  recordsImported: number;
  recordsSkipped: number;
  errors: string[];
  syncedRange?: { startDate: string; endDate: string };
}

// Get OpenRouter sync state from database
export async function getOpenRouterSyncState(): Promise<{ lastSyncedDate: string | null; lastSyncAt: string | null }> {
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
    lastSyncedDate: row.lastSyncedHourEnd || null,
    lastSyncAt: row.lastSyncAt ? new Date(row.lastSyncAt).toISOString() : null,
  };
}

// Update OpenRouter sync state
async function updateOpenRouterSyncState(lastSyncedDate: string): Promise<void> {
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

// Get backfill state — derives oldest date from actual usage data
export async function getOpenRouterBackfillState(): Promise<{ oldestDate: string | null; isComplete: boolean }> {
  const usageResult = await db
    .select({ oldestDate: min(usageRecords.date) })
    .from(usageRecords)
    .where(eq(usageRecords.tool, 'openrouter'));
  const oldestDate = usageResult[0]?.oldestDate || null;

  const stateResult = await db
    .select({ backfillComplete: syncState.backfillComplete })
    .from(syncState)
    .where(eq(syncState.id, SYNC_STATE_ID));
  const isComplete = stateResult[0]?.backfillComplete === true;

  return { oldestDate, isComplete };
}

// Mark backfill as complete (OpenRouter exposes only the last 30 completed UTC days)
async function markOpenRouterBackfillComplete(): Promise<void> {
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
export async function resetOpenRouterBackfillComplete(): Promise<void> {
  await db
    .update(syncState)
    .set({ backfillComplete: false })
    .where(eq(syncState.id, SYNC_STATE_ID));
}

/**
 * Sync OpenRouter usage for a date range.
 *
 * Approach A: per-key full-window fetch with client-side date filtering.
 * For each openrouter_keys row (including revoked — they may have pre-revocation
 * usage within the 30-day window): one getUserActivity({ apiKeyHash }) call
 * returning up to 30 days of daily aggregates; filter to range in code.
 *
 * CONCURRENCY NOTE: Not safe for concurrent execution on overlapping dates.
 * Multiple concurrent syncs will race on UPSERT, causing last write to win.
 * Mitigation: syncOpenRouterCron() has early-exit logic to prevent concurrent runs.
 * Manual CLI calls should avoid overlapping dates.
 */
export async function syncOpenRouterUsage(startDate: string, endDate: string): Promise<SyncResult> {
  const workspaces = getOpenRouterWorkspaces();
  if (workspaces.length === 0) {
    return {
      success: false,
      recordsImported: 0,
      recordsSkipped: 0,
      errors: [NO_OPENROUTER_KEY_ERROR],
    };
  }

  const result: SyncResult = {
    success: true,
    recordsImported: 0,
    recordsSkipped: 0,
    errors: [],
    syncedRange: { startDate, endDate },
  };

  // Load all openrouter_keys rows, including revoked ones.
  // Revoked keys can have pre-revocation usage within the 30-day window.
  const keys = await db
    .select({ hash: openrouterKeys.hash, email: openrouterKeys.email, workspace: openrouterKeys.workspace })
    .from(openrouterKeys);

  if (keys.length === 0) {
    // No keys provisioned — nothing to sync; success (empty is not an error)
    return result;
  }

  // Aggregate in memory per (email, workspace, date, rawModel, endpointId) before inserting.
  // A user with multiple keys in the same workspace, or across workspaces, must not be merged
  // across workspace boundaries — different workspaces produce separate organizationId rows.
  type AggKey = string; // Format: "email|workspace|date|rawModel|endpointId"
  type AggValue = {
    email: string;
    workspace: string;
    date: string;
    rawModel: string;
    endpointId: string;
    promptTokens: number;
    completionTokens: number;
    reasoningTokens: number;
    usage: number;
  };
  const aggregated = new Map<AggKey, AggValue>();

  for (const key of keys) {
    try {
      const items = await getOpenRouterActivity(key.workspace, { apiKeyHash: key.hash });

      for (const item of items) {
        // The API returns date as "YYYY-MM-DD HH:MM:SS" — extract the date part
        const itemDate = item.date.split(' ')[0];

        // Filter to requested date range
        if (itemDate < startDate || itemDate > endDate) continue;

        const rawModel = item.model; // Full slug e.g. "anthropic/claude-sonnet-4.5"
        const aggKey: AggKey = `${key.email}|${key.workspace}|${itemDate}|${rawModel}|${item.endpointId}`;

        const existing = aggregated.get(aggKey);
        if (existing) {
          existing.promptTokens += item.promptTokens || 0;
          existing.completionTokens += item.completionTokens || 0;
          existing.reasoningTokens += item.reasoningTokens || 0;
          existing.usage += item.usage || 0;
        } else {
          aggregated.set(aggKey, {
            email: key.email,
            workspace: key.workspace,
            date: itemDate,
            rawModel,
            endpointId: item.endpointId,
            promptTokens: item.promptTokens || 0,
            completionTokens: item.completionTokens || 0,
            reasoningTokens: item.reasoningTokens || 0,
            usage: item.usage || 0,
          });
        }
      }
    } catch (err) {
      // 404 = key deleted on OpenRouter side — treat as no activity, keep syncing
      if (err instanceof NotFoundResponseError) {
        console.warn(`[OpenRouter Sync] Key ${key.hash.slice(0, 10)}... not found (404) — skipping (key may have been deleted)`);
        continue;
      }
      // Per-key error: log, skip, continue the loop
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[OpenRouter Sync] Error fetching activity for key ${key.hash.slice(0, 10)}...: ${msg}`);
      Sentry.captureException(err);
      result.errors.push(`Key ${key.hash.slice(0, 10)}...: ${msg}`);
      result.success = false;
    }
  }

  // Insert aggregated records
  for (const rec of aggregated.values()) {
    // Strip vendor prefix from model slug and normalize.
    // e.g. "anthropic/claude-sonnet-4.5" → normalize("claude-sonnet-4.5") → "sonnet-4.5"
    // normalizeModelName handles claude-{family}-{decimal} → canonical form.
    // Non-Claude models pass through as-is (e.g. "gpt-4.1", "gemini-2.5-pro").
    const tail = rec.rawModel.includes('/') ? rec.rawModel.split('/').slice(1).join('/') : rec.rawModel;
    const model = normalizeModelName(tail);

    try {
      await insertUsageRecord({
        date: rec.date,
        email: rec.email,
        tool: 'openrouter',
        model,
        rawModel: rec.rawModel,       // Full untouched slug preserved for future re-normalization
        inputTokens: rec.promptTokens,
        outputTokens: rec.completionTokens + rec.reasoningTokens, // Reasoning billed as output
        cacheWriteTokens: 0,          // OpenRouter aggregate API does not expose cache tokens
        cacheReadTokens: 0,
        // cost = usage (already USD dollars from OpenRouter credits).
        // Do NOT divide by 100 — unlike Anthropic/Cursor which return cents.
        // byokUsageInference is intentionally excluded: we don't provision BYOK keys,
        // and mixing OpenRouter credits with external billing would corrupt cost reporting.
        cost: rec.usage,
        toolRecordId: rec.endpointId,
        organizationId: rec.workspace, // Workspace name — ties each row to its OpenRouter workspace
      });
      result.recordsImported++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`Insert error for ${rec.email} ${rec.date}: ${msg}`);
      result.recordsSkipped++;
      result.success = false;
    }
  }

  // Update sync state on success
  if (result.success) {
    await updateOpenRouterSyncState(endDate);
  }

  return result;
}

/**
 * Sync OpenRouter usage for the cron job.
 * Runs daily shortly after UTC midnight. The OpenRouter /activity endpoint
 * only returns completed UTC days, so the most recent syncable day is
 * yesterday. Syncs the last two completed days to catch late-arriving data.
 *
 * Safe to call more often — returns early if yesterday is already synced.
 */
export async function syncOpenRouterCron(): Promise<SyncResult> {
  if (getOpenRouterWorkspaces().length === 0) {
    return {
      success: false,
      recordsImported: 0,
      recordsSkipped: 0,
      errors: [NO_OPENROUTER_KEY_ERROR],
    };
  }

  // The most recent completed UTC day is yesterday — today's activity is
  // not exposed by the API until the UTC day rolls over.
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  // Skip if the latest completed day is already synced
  const { lastSyncedDate } = await getOpenRouterSyncState();
  if (lastSyncedDate && lastSyncedDate >= yesterdayStr) {
    return {
      success: true,
      recordsImported: 0,
      recordsSkipped: 0,
      errors: [],
      syncedRange: undefined, // Signal no actual sync occurred
    };
  }

  // Sync the last two completed days to catch late-arriving data
  const dayBefore = new Date();
  dayBefore.setUTCDate(dayBefore.getUTCDate() - 2);
  const startDate = dayBefore.toISOString().split('T')[0];

  const result = await syncOpenRouterUsage(startDate, yesterdayStr);

  if (result.success) {
    await updateOpenRouterSyncState(yesterdayStr);
  }

  return result;
}

/**
 * Backfill OpenRouter usage.
 * Fetches the full available window (last 30 completed UTC days → today),
 * then marks backfillComplete = true. The 30-day API cap means there is
 * no deeper history to retrieve; subsequent cron runs keep the window current.
 */
export async function backfillOpenRouterUsage(): Promise<SyncResult> {
  if (getOpenRouterWorkspaces().length === 0) {
    return {
      success: false,
      recordsImported: 0,
      recordsSkipped: 0,
      errors: [NO_OPENROUTER_KEY_ERROR],
    };
  }

  const { isComplete } = await getOpenRouterBackfillState();
  if (isComplete) {
    return {
      success: true,
      recordsImported: 0,
      recordsSkipped: 0,
      errors: [],
    };
  }

  // Backfill = full available window: 30 days ago through today
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const startDate = thirtyDaysAgo.toISOString().split('T')[0];

  const result = await syncOpenRouterUsage(startDate, todayStr);

  // Mark complete — OpenRouter only exposes 30 days; nothing older is available
  if (result.success) {
    await markOpenRouterBackfillComplete();
  }

  return result;
}
