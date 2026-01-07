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

// Cost calculation for models (per million tokens)
// Cache write tokens cost 1.25x input price, cache read tokens cost 0.1x input price
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // Claude models
  'claude-opus-4-5-20251101': { input: 15, output: 75 },
  'claude-opus-4-1-20250805': { input: 15, output: 75 },
  'claude-sonnet-4-5-20250929': { input: 3, output: 15 },
  'claude-sonnet-4-20250514': { input: 3, output: 15 },
  'claude-haiku-4-5-20251001': { input: 0.8, output: 4 },
  'claude-3-5-haiku-20241022': { input: 0.8, output: 4 },
  // OpenAI GPT models
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4-turbo': { input: 10, output: 30 },
  'gpt-4': { input: 30, output: 60 },
  'gpt-3.5-turbo': { input: 0.5, output: 1.5 },
  // OpenAI reasoning models
  'o1': { input: 15, output: 60 },
  'o1-mini': { input: 1.1, output: 4.4 },
  'o1-pro': { input: 150, output: 600 },
  'o3-mini': { input: 1.1, output: 4.4 },
  // OpenAI Codex models
  'codex-mini': { input: 1.5, output: 6 },
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
