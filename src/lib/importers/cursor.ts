import { insertUsageRecord } from '../queries';
import Papa from 'papaparse';

interface CursorRow {
  Date: string;
  User: string;
  Kind: string;
  Model: string;
  'Max Mode': string;
  'Input (w/ Cache Write)': string;
  'Input (w/o Cache Write)': string;
  'Cache Read': string;
  'Output Tokens': string;
  'Total Tokens': string;
  Cost: string;
}

export function isCursorCsv(headers: string[]): boolean {
  const requiredHeaders = ['Date', 'User', 'Model', 'Output Tokens', 'Cost'];
  return requiredHeaders.every(h => headers.includes(h));
}

export interface ImportResult {
  success: boolean;
  recordsImported: number;
  recordsSkipped: number;
  unmappedKeys?: string[];
  errors: string[];
}

interface AggregatedRecord {
  email: string;
  model: string;
  inputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  outputTokens: number;
  cost: number;
}

// Create a composite key that's safe to split (uses null character separator)
function makeKey(date: string, email: string, model: string): string {
  return [date, email, model].join('\0');
}

function parseKey(key: string): { date: string; email: string; model: string } {
  const [date, email, model] = key.split('\0');
  return { date, email, model };
}

export async function importCursorCsv(csvContent: string): Promise<ImportResult> {
  const result: ImportResult = {
    success: true,
    recordsImported: 0,
    recordsSkipped: 0,
    errors: []
  };

  const parsed = Papa.parse<CursorRow>(csvContent, {
    header: true,
    skipEmptyLines: true
  });

  if (parsed.errors.length > 0) {
    result.errors = parsed.errors.map(e => e.message);
  }

  // Aggregate by (date, email, model) since Cursor has multiple events per day
  const aggregated = new Map<string, AggregatedRecord>();

  for (const row of parsed.data) {
    // Skip errored/no-charge entries with 0 tokens
    const totalTokens = parseInt(row['Total Tokens'] || '0', 10);
    if (totalTokens === 0) {
      result.recordsSkipped++;
      continue;
    }

    // Parse the ISO date to just the date part
    const date = row.Date.split('T')[0];
    const key = makeKey(date, row.User, row.Model);

    const inputWithCache = parseInt(row['Input (w/ Cache Write)'] || '0', 10);
    const inputWithoutCache = parseInt(row['Input (w/o Cache Write)'] || '0', 10);
    const cacheRead = parseInt(row['Cache Read'] || '0', 10);
    const outputTokens = parseInt(row['Output Tokens'] || '0', 10);
    const cost = parseFloat(row.Cost || '0');
    const cacheWriteTokens = Math.max(0, inputWithCache - inputWithoutCache);

    const existing = aggregated.get(key);
    if (existing) {
      existing.inputTokens += inputWithoutCache;
      existing.cacheWriteTokens += cacheWriteTokens;
      existing.cacheReadTokens += cacheRead;
      existing.outputTokens += outputTokens;
      existing.cost += cost;
    } else {
      aggregated.set(key, {
        email: row.User,
        model: row.Model,
        inputTokens: inputWithoutCache,
        cacheWriteTokens,
        cacheReadTokens: cacheRead,
        outputTokens,
        cost
      });
    }
  }

  // Insert aggregated records
  for (const [key, data] of aggregated) {
    try {
      const { date } = parseKey(key);
      await insertUsageRecord({
        date,
        email: data.email,
        tool: 'cursor',
        model: data.model,
        inputTokens: data.inputTokens,
        cacheWriteTokens: data.cacheWriteTokens,
        cacheReadTokens: data.cacheReadTokens,
        outputTokens: data.outputTokens,
        cost: data.cost
      });
      result.recordsImported++;
    } catch (error) {
      result.errors.push(`Row error: ${error instanceof Error ? error.message : 'Unknown'}`);
    }
  }

  return result;
}
