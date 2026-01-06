import { syncAnthropicUsage, SyncResult as AnthropicResult } from './anthropic';
import { syncCursorUsage, SyncResult as CursorResult } from './cursor';
import { syncAnthropicApiKeyMappings, MappingResult } from './anthropic-mappings';
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

export async function runFullSync(
  startDate?: string,
  endDate?: string,
  options: { includeMappings?: boolean } = {}
): Promise<FullSyncResult> {
  // Default to last 7 days if no dates provided
  const end = endDate || new Date().toISOString().split('T')[0];
  const start = startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // Run usage syncs in parallel
  const [anthropicResult, cursorResult] = await Promise.all([
    syncAnthropicUsage(start, end),
    syncCursorUsage(start, end)
  ]);

  // Optionally sync API key mappings
  let mappingsResult: MappingResult | undefined;
  if (options.includeMappings) {
    mappingsResult = await syncAnthropicApiKeyMappings();
  }

  // Update sync state
  await updateSyncState('main', new Date().toISOString());

  return {
    anthropic: anthropicResult,
    cursor: cursorResult,
    mappings: mappingsResult
  };
}

// Standalone function to just sync mappings
export async function syncMappings(): Promise<MappingResult> {
  return syncAnthropicApiKeyMappings();
}

export { syncAnthropicUsage, syncCursorUsage, syncAnthropicApiKeyMappings };
