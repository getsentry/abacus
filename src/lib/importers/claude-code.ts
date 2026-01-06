import { calculateCost } from '../db';
import { insertUsageRecord, getApiKeyMappings } from '../queries';
import Papa from 'papaparse';

interface ClaudeCodeRow {
  usage_date_utc: string;
  model_version: string;
  api_key: string;
  workspace: string;
  usage_type: string;
  context_window: string;
  usage_input_tokens_no_cache: string;
  usage_input_tokens_cache_write_5m: string;
  usage_input_tokens_cache_write_1h: string;
  usage_input_tokens_cache_read: string;
  usage_output_tokens: string;
  web_search_count: string;
}

export function extractEmailFromApiKey(apiKey: string): string | null {
  // Pattern: claude_code_key_{firstname.lastname}_{suffix} or claude_code_key_{firstname}_{suffix}
  const match = apiKey.match(/^claude_code_key_([a-z]+(?:\.[a-z]+)?)_[a-z]+$/i);
  if (match) {
    const name = match[1];
    return `${name}@sentry.io`;
  }
  return null;
}

export function isClaudeCodeCsv(headers: string[]): boolean {
  const requiredHeaders = ['usage_date_utc', 'model_version', 'api_key', 'usage_output_tokens'];
  return requiredHeaders.every(h => headers.includes(h));
}

export interface ImportResult {
  success: boolean;
  recordsImported: number;
  recordsSkipped: number;
  unmappedKeys: string[];
  errors: string[];
}

interface AggregatedRecord {
  email: string;
  model: string;
  rawApiKey: string;
  inputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  outputTokens: number;
}

// Create a composite key that's safe to split (uses null character separator)
function makeKey(date: string, email: string, model: string, apiKey: string): string {
  return [date, email, model, apiKey].join('\0');
}

function parseKey(key: string): { date: string; email: string; model: string; apiKey: string } {
  const [date, email, model, apiKey] = key.split('\0');
  return { date, email, model, apiKey };
}

export async function importClaudeCodeCsv(csvContent: string): Promise<ImportResult> {
  const result: ImportResult = {
    success: true,
    recordsImported: 0,
    recordsSkipped: 0,
    unmappedKeys: [],
    errors: []
  };

  // Get existing mappings
  const mappingsArray = await getApiKeyMappings();
  const mappings = new Map<string, string>(
    mappingsArray.map(m => [m.api_key, m.email])
  );

  const parsed = Papa.parse<ClaudeCodeRow>(csvContent, {
    header: true,
    skipEmptyLines: true
  });

  if (parsed.errors.length > 0) {
    result.errors = parsed.errors.map(e => e.message);
  }

  const unmappedKeysSet = new Set<string>();

  // Aggregate by (date, email, model, api_key) since CSV may have multiple rows per combination
  const aggregated = new Map<string, AggregatedRecord>();

  for (const row of parsed.data) {
    // Skip non-Claude Code workspace entries unless they have the key pattern
    if (row.workspace !== 'Claude Code' && !row.api_key.startsWith('claude_code_key_')) {
      result.recordsSkipped++;
      continue;
    }

    // Resolve email
    let email = mappings.get(row.api_key) || extractEmailFromApiKey(row.api_key);

    if (!email) {
      email = 'unknown';
      unmappedKeysSet.add(row.api_key);
    }

    const inputTokens = parseInt(row.usage_input_tokens_no_cache || '0', 10);
    const cacheWriteTokens = parseInt(row.usage_input_tokens_cache_write_5m || '0', 10) +
                             parseInt(row.usage_input_tokens_cache_write_1h || '0', 10);
    const cacheReadTokens = parseInt(row.usage_input_tokens_cache_read || '0', 10);
    const outputTokens = parseInt(row.usage_output_tokens || '0', 10);

    const key = makeKey(row.usage_date_utc, email, row.model_version, row.api_key);
    const existing = aggregated.get(key);

    if (existing) {
      existing.inputTokens += inputTokens;
      existing.cacheWriteTokens += cacheWriteTokens;
      existing.cacheReadTokens += cacheReadTokens;
      existing.outputTokens += outputTokens;
    } else {
      aggregated.set(key, {
        email,
        model: row.model_version,
        rawApiKey: row.api_key,
        inputTokens,
        cacheWriteTokens,
        cacheReadTokens,
        outputTokens
      });
    }
  }

  // Insert aggregated records
  for (const [key, data] of aggregated) {
    try {
      const { date } = parseKey(key);
      const cost = calculateCost(data.model, data.inputTokens + data.cacheWriteTokens, data.outputTokens);

      await insertUsageRecord({
        date,
        email: data.email,
        tool: 'claude_code',
        model: data.model,
        inputTokens: data.inputTokens,
        cacheWriteTokens: data.cacheWriteTokens,
        cacheReadTokens: data.cacheReadTokens,
        outputTokens: data.outputTokens,
        cost,
        rawApiKey: data.rawApiKey
      });

      result.recordsImported++;
    } catch (error) {
      result.errors.push(`Row error: ${error instanceof Error ? error.message : 'Unknown'}`);
    }
  }

  result.unmappedKeys = Array.from(unmappedKeysSet);
  return result;
}
