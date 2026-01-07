import { drizzle } from 'drizzle-orm/vercel-postgres';
import { sql as vercelSql } from '@vercel/postgres';
import { sql } from 'drizzle-orm';
import * as schema from './schema';

// Create Drizzle client
export const db = drizzle(vercelSql, { schema });

// Re-export schema for convenience
export * from './schema';

// Re-export sql for raw queries
export { sql };

// Legacy sql template tag for backward compatibility with existing queries
// This allows gradual migration from raw SQL to Drizzle
export { sql as vercelSql } from '@vercel/postgres';

// Cost calculation for Claude models (per million tokens)
// Cache write tokens cost 1.25x input price, cache read tokens cost 0.1x input price
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-4-5-20251101': { input: 15, output: 75 },
  'claude-opus-4-1-20250805': { input: 15, output: 75 },
  'claude-sonnet-4-5-20250929': { input: 3, output: 15 },
  'claude-sonnet-4-20250514': { input: 3, output: 15 },
  'claude-haiku-4-5-20251001': { input: 0.8, output: 4 },
  'claude-3-5-haiku-20241022': { input: 0.8, output: 4 },
};

const CACHE_WRITE_MULTIPLIER = 1.25;
const CACHE_READ_MULTIPLIER = 0.1;

export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheWriteTokens: number = 0,
  cacheReadTokens: number = 0
): number {
  const pricing = Object.entries(MODEL_PRICING).find(([key]) =>
    model.toLowerCase().includes(key.toLowerCase()) || key.toLowerCase().includes(model.toLowerCase())
  )?.[1];

  const inputPrice = pricing?.input ?? 3;
  const outputPrice = pricing?.output ?? 15;

  const inputCost = inputTokens * inputPrice;
  const outputCost = outputTokens * outputPrice;
  const cacheWriteCost = cacheWriteTokens * inputPrice * CACHE_WRITE_MULTIPLIER;
  const cacheReadCost = cacheReadTokens * inputPrice * CACHE_READ_MULTIPLIER;

  return (inputCost + outputCost + cacheWriteCost + cacheReadCost) / 1_000_000;
}
