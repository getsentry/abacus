import { insertUsageRecord, getApiKeyMappings } from '../queries';
import { calculateCost } from '../db';
import { sql } from '@vercel/postgres';

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
export async function getAnthropicSyncState(): Promise<{ lastSyncedDate: string | null }> {
  const result = await sql`
    SELECT last_synced_hour_end FROM sync_state WHERE id = ${SYNC_STATE_ID}
  `;
  if (result.rows.length === 0 || !result.rows[0].last_synced_hour_end) {
    return { lastSyncedDate: null };
  }
  // We store date as ISO string in the last_synced_hour_end column (reusing the column)
  return { lastSyncedDate: result.rows[0].last_synced_hour_end };
}

// Update Anthropic sync state
async function updateAnthropicSyncState(lastSyncedDate: string): Promise<void> {
  await sql`
    INSERT INTO sync_state (id, last_sync_at, last_synced_hour_end)
    VALUES (${SYNC_STATE_ID}, NOW(), ${lastSyncedDate})
    ON CONFLICT (id) DO UPDATE SET
      last_sync_at = NOW(),
      last_synced_hour_end = ${lastSyncedDate}
  `;
}

function extractEmailFromApiKeyId(apiKeyId: string): string | null {
  // Pattern: claude_code_key_{firstname.lastname}_{suffix}
  // Only used as fallback when API key mapping doesn't exist
  const emailDomain = process.env.DEFAULT_EMAIL_DOMAIN;
  if (!emailDomain) return null;

  const match = apiKeyId.match(/^claude_code_key_([a-z]+(?:\.[a-z]+)?)_[a-z]+$/i);
  if (match) {
    return `${match[1]}@${emailDomain}`;
  }
  return null;
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch with exponential backoff for rate limit handling
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries: number = 5,
  initialDelayMs: number = 10000
): Promise<{ response: Response; rateLimited: boolean }> {
  let delay = initialDelayMs;
  let rateLimited = false;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, options);

    if (response.ok) {
      return { response, rateLimited: false };
    }

    // If rate limited, wait and retry
    if (response.status === 429) {
      rateLimited = true;
      if (attempt < maxRetries) {
        // Check for Retry-After header
        const retryAfter = response.headers.get('Retry-After');
        const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : delay;

        await sleep(waitTime);
        delay *= 2; // Exponential backoff
        continue;
      }
    }

    // For non-429 errors or final attempt, return the response
    return { response, rateLimited };
  }

  throw new Error('Max retries exceeded');
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

  // Get existing mappings
  const mappingsArray = await getApiKeyMappings();
  const mappings = new Map<string, string>(
    mappingsArray.map(m => [m.api_key, m.email])
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

      const { response, rateLimited } = await fetchWithRetry(
        `https://api.anthropic.com/v1/organizations/usage_report/messages?${params}`,
        {
          headers: {
            'X-Api-Key': adminKey,
            'anthropic-version': '2023-06-01'
          }
        },
        5,  // maxRetries
        10000  // initial delay 10s
      );

      if (!response.ok) {
        const errorText = await response.text();
        if (rateLimited) {
          throw new Error(`Anthropic API rate limited after retries: ${response.status} - ${errorText}`);
        }
        throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
      }

      const data: AnthropicUsageResponse = await response.json();

      for (const bucket of data.data) {
        const date = bucket.starting_at.split('T')[0];

        for (const item of bucket.results) {
          if (!item.model) continue;

          // Resolve email from API key
          let email = 'unknown';
          const apiKeyId = item.api_key_id;

          if (apiKeyId) {
            email = mappings.get(apiKeyId) || extractEmailFromApiKeyId(apiKeyId) || 'unknown';
          }

          const inputTokens = item.uncached_input_tokens || 0;
          const cacheWriteTokens = (item.cache_creation?.ephemeral_5m_input_tokens || 0) +
                                   (item.cache_creation?.ephemeral_1h_input_tokens || 0);
          const cacheReadTokens = item.cache_read_input_tokens || 0;
          const outputTokens = item.output_tokens || 0;

          const cost = calculateCost(item.model, inputTokens + cacheWriteTokens, outputTokens);

          try {
            await insertUsageRecord({
              date,
              email,
              tool: 'claude_code',
              model: item.model,
              inputTokens,
              cacheWriteTokens,
              cacheReadTokens,
              outputTokens,
              cost,
              rawApiKey: apiKeyId || undefined
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
 * Tracks state to avoid re-fetching data we already have.
 * Syncs from (last_synced_date - 1 day) to yesterday to:
 * - Catch any late-arriving data from the previous day
 * - Not fetch today's incomplete data
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

  // Get yesterday's date (complete day)
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  // Check what we've already synced
  const { lastSyncedDate } = await getAnthropicSyncState();

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
  // If never synced, start from 7 days ago
  // Otherwise, start from (last_synced_date - 1 day) to catch late data
  let startDate: string;
  if (!lastSyncedDate) {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    startDate = weekAgo.toISOString().split('T')[0];
  } else {
    const lastDate = new Date(lastSyncedDate);
    lastDate.setDate(lastDate.getDate() - 1); // Go back 1 day to catch late data
    startDate = lastDate.toISOString().split('T')[0];
  }

  // End date is yesterday (today's data is incomplete)
  const endDate = yesterdayStr;

  // Sync the range
  const result = await syncAnthropicUsage(startDate, endDate);

  // Update sync state to yesterday if successful
  if (result.success) {
    await updateAnthropicSyncState(yesterdayStr);
  }

  return result;
}

/**
 * Backfill Anthropic data for a date range.
 * Updates sync state after completion.
 */
export async function backfillAnthropicUsage(
  startDate: string,
  endDate: string,
  options: { onProgress?: (msg: string) => void } = {}
): Promise<SyncResult> {
  const log = options.onProgress || (() => {});

  log(`Fetching Anthropic usage from ${startDate} to ${endDate}...`);
  const result = await syncAnthropicUsage(startDate, endDate);

  if (result.success) {
    // Update sync state to the end date
    const { lastSyncedDate } = await getAnthropicSyncState();
    if (!lastSyncedDate || endDate > lastSyncedDate) {
      await updateAnthropicSyncState(endDate);
    }
  }

  log(`Done: ${result.recordsImported} imported, ${result.recordsSkipped} skipped`);
  return result;
}
