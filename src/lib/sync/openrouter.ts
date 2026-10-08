import * as Sentry from '@sentry/nextjs';
import { insertUsageRecord } from '../queries';
import { normalizeModelName } from '../utils';
import { db, syncState, usageRecords } from '../db';
import { eq, min } from 'drizzle-orm';
import {
  getOpenRouterKey,
  getOpenRouterWorkspaces,
  NO_OPENROUTER_KEY_ERROR,
} from './provider-keys';

export { NO_OPENROUTER_KEY_ERROR };

/**
 * OpenRouter usage sync.
 *
 * Uses the management API:
 * - GET /organization/members       -> member user IDs and emails
 * - GET /workspaces/{ref}           -> resolve configured workspace slugs to IDs
 * - GET /workspaces/{id}/members    -> limit members to a workspace
 * - GET /activity?user_id=&workspace_id= -> daily per-model activity (last 30 days)
 *
 * Docs: https://openrouter.ai/docs/api/api-reference/analytics/get-user-activity
 */

const OPENROUTER_API_BASE = 'https://openrouter.ai/api/v1';
const SYNC_STATE_ID = 'openrouter';
const TOOL = 'openrouter';
const PAGE_LIMIT = 100;
const MEMBER_CONCURRENCY = 5;

/**
 * OpenRouter's activity API returns the last 30 *completed* UTC days.
 * The current UTC day is never included; data for a day appears once it ends.
 */
export const OPENROUTER_ACTIVITY_WINDOW_DAYS = 30;

interface OpenRouterMember {
  id: string;
  email: string;
}

interface OpenRouterWorkspace {
  id: string;
  slug: string;
}

interface OpenRouterWorkspaceMember {
  user_id: string;
}

interface OpenRouterActivityItem {
  date: string;
  model: string;
  model_permaslug: string;
  endpoint_id: string;
  provider_name: string;
  usage: number;
  byok_usage_inference: number;
  requests: number;
  prompt_tokens: number;
  completion_tokens: number;
  reasoning_tokens: number;
  cached_tokens: number;
  workspace_id?: string;
}

export interface SyncResult {
  success: boolean;
  recordsImported: number;
  recordsSkipped: number;
  errors: string[];
  syncedRange?: { startDate: string; endDate: string };
}

class OpenRouterApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function openRouterGet<T>(
  path: string,
  key: string,
  params: Record<string, string | number | undefined> = {}
): Promise<T> {
  const url = new URL(`${OPENROUTER_API_BASE}${path}`);
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(name, String(value));
  }

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${key}` },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new OpenRouterApiError(
      response.status,
      `OpenRouter API error: ${response.status} ${path} - ${text}`
    );
  }

  return response.json() as Promise<T>;
}

async function listPaginated<T>(path: string, key: string): Promise<T[]> {
  const items: T[] = [];
  let offset = 0;
  while (true) {
    const page = await openRouterGet<{ data: T[]; total_count: number }>(path, key, {
      offset,
      limit: PAGE_LIMIT,
    });
    items.push(...(page.data || []));
    offset += PAGE_LIMIT;
    if (!page.data?.length || offset >= page.total_count) break;
  }
  return items;
}

/**
 * Turn an OpenRouter model slug into an Abacus model name.
 * "anthropic/claude-sonnet-4.5" -> "sonnet-4.5", "anthropic/claude-3.7-sonnet:thinking" -> "sonnet-3.7"
 */
export function normalizeOpenRouterModel(slug: string): string {
  const withoutVendor = slug.includes('/') ? slug.slice(slug.indexOf('/') + 1) : slug;
  const withoutVariant = withoutVendor.split(':')[0];
  return normalizeModelName(withoutVariant);
}

function toDateStr(date: Date): string {
  return date.toISOString().split('T')[0];
}

/** Oldest date still available from the OpenRouter activity API (today - 30). */
export function getActivityWindowStart(now: Date = new Date()): string {
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - OPENROUTER_ACTIVITY_WINDOW_DAYS);
  return toDateStr(start);
}

/** Most recent completed UTC day, i.e. the newest date the activity API can return. */
export function getLatestCompletedDay(now: Date = new Date()): string {
  const end = new Date(now);
  end.setUTCDate(end.getUTCDate() - 1);
  return toDateStr(end);
}

function deriveOrganizationId(workspaceId?: string): string | undefined {
  return workspaceId ? `openrouter:${workspaceId}` : undefined;
}

/**
 * Run async work over items with a small concurrency limit.
 */
async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}

/**
 * Aggregate activity rows (one per date/model/endpoint) into one row per date/model.
 */
function aggregateActivity(
  items: OpenRouterActivityItem[],
  startDate: string,
  endDate: string
): Map<string, OpenRouterActivityItem> {
  const byKey = new Map<string, OpenRouterActivityItem>();
  for (const item of items) {
    if (item.date < startDate || item.date > endDate) continue;
    const key = `${item.date}|${item.model}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...item });
      continue;
    }
    existing.usage += item.usage || 0;
    existing.byok_usage_inference += item.byok_usage_inference || 0;
    existing.requests += item.requests || 0;
    existing.prompt_tokens += item.prompt_tokens || 0;
    existing.completion_tokens += item.completion_tokens || 0;
    existing.reasoning_tokens += item.reasoning_tokens || 0;
    existing.cached_tokens += item.cached_tokens || 0;
  }
  return byKey;
}

async function resolveWorkspaces(refs: string[], key: string): Promise<OpenRouterWorkspace[]> {
  const workspaces: OpenRouterWorkspace[] = [];
  for (const ref of refs) {
    const { data } = await openRouterGet<{ data: OpenRouterWorkspace }>(
      `/workspaces/${encodeURIComponent(ref)}`,
      key
    );
    workspaces.push({ id: data.id, slug: data.slug });
  }
  return workspaces;
}

// Get OpenRouter sync state from database
export async function getOpenRouterSyncState(): Promise<{ lastSyncAt: string | null; lastSyncedDate: string | null }> {
  const result = await db
    .select({ lastSyncAt: syncState.lastSyncAt, lastSyncedDate: syncState.lastSyncedHourEnd })
    .from(syncState)
    .where(eq(syncState.id, SYNC_STATE_ID));

  if (result.length === 0) {
    return { lastSyncAt: null, lastSyncedDate: null };
  }
  return {
    lastSyncAt: result[0].lastSyncAt ? new Date(result[0].lastSyncAt).toISOString() : null,
    // Date string of last synced data (e.g., "2026-01-08"), same convention as Anthropic
    lastSyncedDate: result[0].lastSyncedDate || null,
  };
}

async function updateOpenRouterSyncState(lastSyncedDate: string): Promise<void> {
  await db
    .insert(syncState)
    .values({ id: SYNC_STATE_ID, lastSyncAt: new Date(), lastSyncedHourEnd: lastSyncedDate })
    .onConflictDoUpdate({
      target: syncState.id,
      set: { lastSyncAt: new Date(), lastSyncedHourEnd: lastSyncedDate },
    });
}

/**
 * Oldest OpenRouter date we have in usage_records.
 * The API only keeps 30 days, so there is no separate backfill process.
 */
export async function getOpenRouterBackfillState(): Promise<{ oldestDate: string | null; isComplete: boolean }> {
  const result = await db
    .select({ oldestDate: min(usageRecords.date) })
    .from(usageRecords)
    .where(eq(usageRecords.tool, TOOL));
  const oldestDate = result[0]?.oldestDate || null;
  return { oldestDate, isComplete: oldestDate !== null };
}

/**
 * Sync OpenRouter usage for a date range (clamped to the API's 30-day window).
 * Imports per-member activity, optionally restricted to OPENROUTER_WORKSPACES.
 * Does NOT update sync state - use syncOpenRouterCron for production syncing.
 *
 * @param startDate ISO date string (YYYY-MM-DD)
 * @param endDate ISO date string (YYYY-MM-DD)
 */
export async function syncOpenRouterUsage(startDate: string, endDate: string): Promise<SyncResult> {
  const key = getOpenRouterKey();
  if (!key) {
    return { success: false, recordsImported: 0, recordsSkipped: 0, errors: [NO_OPENROUTER_KEY_ERROR] };
  }

  const windowStart = getActivityWindowStart();
  const effectiveStart = startDate < windowStart ? windowStart : startDate;

  const result: SyncResult = {
    success: true,
    recordsImported: 0,
    recordsSkipped: 0,
    errors: [],
    syncedRange: { startDate: effectiveStart, endDate },
  };

  if (effectiveStart > endDate) {
    return result;
  }

  let members: OpenRouterMember[];
  let workspaces: (OpenRouterWorkspace | undefined)[];
  try {
    members = await listPaginated<OpenRouterMember>('/organization/members', key);
    const workspaceRefs = getOpenRouterWorkspaces();
    workspaces = workspaceRefs.length > 0 ? await resolveWorkspaces(workspaceRefs, key) : [undefined];
  } catch (err) {
    Sentry.captureException(err);
    return {
      ...result,
      success: false,
      errors: [err instanceof Error ? err.message : 'Unknown error'],
    };
  }

  const emailById = new Map(members.map((m) => [m.id, m.email]));
  if (emailById.size === 0) {
    return {
      ...result,
      success: false,
      errors: ['No OpenRouter organization members found (a management key for an organization is required)'],
    };
  }

  for (const workspace of workspaces) {
    const label = workspace ? `[${workspace.slug}] ` : '';
    let userIds: string[];
    try {
      userIds = workspace
        ? (await listPaginated<OpenRouterWorkspaceMember>(`/workspaces/${workspace.id}/members`, key))
            .map((m) => m.user_id)
            .filter((id) => emailById.has(id))
        : [...emailById.keys()];
    } catch (err) {
      Sentry.captureException(err);
      result.success = false;
      result.errors.push(`${label}${err instanceof Error ? err.message : 'Unknown error'}`);
      continue;
    }

    const organizationId = deriveOrganizationId(workspace?.id);
    let rateLimited = false;

    await mapWithConcurrency(userIds, MEMBER_CONCURRENCY, async (userId) => {
      if (rateLimited) return;
      const email = emailById.get(userId)!;

      let items: OpenRouterActivityItem[];
      try {
        const response = await openRouterGet<{ data: OpenRouterActivityItem[] }>('/activity', key, {
          user_id: userId,
          workspace_id: workspace?.id,
        });
        items = response.data || [];
      } catch (err) {
        if (err instanceof OpenRouterApiError && err.status === 429) {
          rateLimited = true;
        } else {
          Sentry.captureException(err);
        }
        result.success = false;
        result.errors.push(`${label}${err instanceof Error ? err.message : 'Unknown error'}`);
        return;
      }

      for (const item of aggregateActivity(items, effectiveStart, endDate).values()) {
        const promptTokens = item.prompt_tokens || 0;
        const cachedTokens = item.cached_tokens || 0;
        const outputTokens = item.completion_tokens || 0;
        if (promptTokens + cachedTokens + outputTokens === 0) {
          result.recordsSkipped++;
          continue;
        }

        try {
          await insertUsageRecord({
            date: item.date,
            email,
            tool: TOOL,
            model: normalizeOpenRouterModel(item.model),
            rawModel: item.model,
            // prompt_tokens includes cache hits; store them separately like other providers
            inputTokens: Math.max(promptTokens - cachedTokens, 0),
            cacheWriteTokens: 0,
            cacheReadTokens: cachedTokens,
            outputTokens,
            cost: (item.usage || 0) + (item.byok_usage_inference || 0),
            organizationId,
          });
          result.recordsImported++;
        } catch (err) {
          result.recordsSkipped++;
          result.errors.push(`${label}Insert error: ${err instanceof Error ? err.message : 'Unknown'}`);
        }
      }
    });

    if (rateLimited) {
      result.errors.push(`${label}OpenRouter API rate limited - will retry on next run`);
      break;
    }
  }

  return result;
}

/**
 * Sync OpenRouter usage for the cron job.
 * OpenRouter only publishes completed UTC days, so the sync ends at yesterday.
 * First run imports the full 30-day window; later runs re-sync from the day
 * before the last synced date, which also picks up any late corrections.
 */
export async function syncOpenRouterCron(): Promise<SyncResult> {
  const latestDay = getLatestCompletedDay();
  const { lastSyncedDate } = await getOpenRouterSyncState();

  let startDate = getActivityWindowStart();
  if (lastSyncedDate) {
    const resume = new Date(`${lastSyncedDate}T00:00:00Z`);
    resume.setUTCDate(resume.getUTCDate() - 1);
    const resumeStr = toDateStr(resume);
    if (resumeStr > startDate) startDate = resumeStr;
  }

  const result = await syncOpenRouterUsage(startDate, latestDay);
  if (result.success) {
    await updateOpenRouterSyncState(latestDay);
  }
  return result;
}
