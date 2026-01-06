import { insertUsageRecord, getApiKeyMappings } from '../queries';
import { calculateCost } from '../db';

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
}

function extractEmailFromApiKeyId(apiKeyId: string): string | null {
  // Pattern: claude_code_key_{firstname.lastname}_{suffix}
  const match = apiKeyId.match(/^claude_code_key_([a-z]+(?:\.[a-z]+)?)_[a-z]+$/i);
  if (match) {
    return `${match[1]}@sentry.io`;
  }
  return null;
}

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
    errors: []
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

      const response = await fetch(
        `https://api.anthropic.com/v1/organizations/usage_report/messages?${params}`,
        {
          headers: {
            'X-Api-Key': adminKey,
            'anthropic-version': '2023-06-01'
          }
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
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
