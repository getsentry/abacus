import { syncAnthropicUsage, syncAnthropicCron, backfillAnthropicUsage, getAnthropicSyncState, resetAnthropicBackfillComplete, SyncResult as AnthropicResult } from './anthropic';
import { syncCursorCron, syncCursorUsage, backfillCursorUsage, getCursorSyncState, resetCursorBackfillComplete, SyncResult as CursorResult } from './cursor';
import { syncAnthropicApiKeyMappings, syncApiKeyMappingsSmart, MappingResult } from './anthropic-mappings';
import {
  syncGitHubRepo,
  syncGitHubCron,
  backfillGitHubUsage,
  getGitHubSyncState,
  getGitHubBackfillState,
  resetGitHubBackfillComplete,
  processWebhookPush,
  detectAiAttribution,
  getOrCreateRepository,
  getGitHubToken,
  SyncResult as GitHubResult,
  GitHubPushEvent,
} from './github';
import {
  getGitHubUsersWithMappingStatus,
  getUnmappedGitHubUsers,
  mapGitHubUser,
  syncGitHubOrgMembers,
  syncGitHubMemberEmails,
  hasUnattributedCommits,
  getGitHubUser,
  GitHubMappingResult,
} from './github-mappings';
import { sql } from '@vercel/postgres';

export interface FullSyncResult {
  anthropic: AnthropicResult;
  cursor: CursorResult;
  mappings?: MappingResult;
}

export async function getSyncState(id: string): Promise<{ lastSyncAt: string | null; lastCursor: string | null }> {
  const result = await sql`SELECT last_sync_at, last_cursor FROM sync_state WHERE id = ${id}`;
  if (result.rows.length === 0) {
    return { lastSyncAt: null, lastCursor: null };
  }
  return {
    lastSyncAt: result.rows[0].last_sync_at,
    lastCursor: result.rows[0].last_cursor
  };
}

export async function updateSyncState(id: string, lastSyncAt: string, lastCursor?: string): Promise<void> {
  await sql`
    INSERT INTO sync_state (id, last_sync_at, last_cursor)
    VALUES (${id}, ${lastSyncAt}, ${lastCursor || null})
    ON CONFLICT (id) DO UPDATE SET last_sync_at = ${lastSyncAt}, last_cursor = ${lastCursor || null}
  `;
}

/**
 * Run Anthropic cron sync.
 * Only syncs new data since last sync.
 * Safe to call frequently - will skip if already synced.
 */
export async function runAnthropicSync(options: { includeMappings?: boolean } = {}): Promise<{ anthropic: AnthropicResult; mappings?: MappingResult }> {
  // Sync API key mappings FIRST so usage sync has them available
  let mappingsResult: MappingResult | undefined;
  if (options.includeMappings) {
    mappingsResult = await syncApiKeyMappingsSmart();
  }

  const anthropicResult = await syncAnthropicCron();

  return {
    anthropic: anthropicResult,
    mappings: mappingsResult
  };
}

/**
 * Run Cursor cron sync.
 * Only syncs new complete hours since last sync.
 * Safe to call frequently - will skip if already synced.
 */
export async function runCursorSync(): Promise<CursorResult> {
  return syncCursorCron();
}

/**
 * Run full sync for both services.
 * For backwards compatibility and manual syncs via CLI.
 */
export async function runFullSync(
  startDate?: string,
  endDate?: string,
  options: { includeMappings?: boolean } = {}
): Promise<FullSyncResult> {
  // Default to last 7 days if no dates provided
  const end = endDate || new Date().toISOString().split('T')[0];
  const start = startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // Sync API key mappings FIRST so usage sync has them available
  let mappingsResult: MappingResult | undefined;
  if (options.includeMappings) {
    mappingsResult = await syncApiKeyMappingsSmart();
  }

  // Run usage syncs in parallel
  // Note: For manual syncs, use date-based sync
  const [anthropicResult, cursorResult] = await Promise.all([
    syncAnthropicUsage(start, end),
    syncCursorUsage(start, end)
  ]);

  // Update sync state
  await updateSyncState('main', new Date().toISOString());

  return {
    anthropic: anthropicResult,
    cursor: cursorResult,
    mappings: mappingsResult
  };
}

// Standalone function to just sync mappings (uses smart incremental sync)
export async function syncMappings(): Promise<MappingResult> {
  return syncApiKeyMappingsSmart();
}

// Force full mappings sync (for initial setup or manual refresh)
export async function syncMappingsFull(): Promise<MappingResult> {
  return syncAnthropicApiKeyMappings();
}

export {
  syncAnthropicUsage,
  syncAnthropicCron,
  backfillAnthropicUsage,
  getAnthropicSyncState,
  resetAnthropicBackfillComplete,
  syncCursorUsage,
  syncCursorCron,
  backfillCursorUsage,
  getCursorSyncState,
  resetCursorBackfillComplete,
  syncAnthropicApiKeyMappings,
  // GitHub exports
  syncGitHubRepo,
  syncGitHubCron,
  backfillGitHubUsage,
  getGitHubSyncState,
  getGitHubBackfillState,
  resetGitHubBackfillComplete,
  processWebhookPush,
  detectAiAttribution,
  getOrCreateRepository,
  getGitHubToken,
  // GitHub user mapping exports
  getGitHubUsersWithMappingStatus,
  getUnmappedGitHubUsers,
  mapGitHubUser,
  syncGitHubOrgMembers,
  syncGitHubMemberEmails,
  hasUnattributedCommits,
  getGitHubUser,
};

export type { GitHubResult, GitHubPushEvent, GitHubMappingResult };
