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
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-4-5-20251101': { input: 15, output: 75 },
  'claude-opus-4-1-20250805': { input: 15, output: 75 },
  'claude-sonnet-4-5-20250929': { input: 3, output: 15 },
  'claude-sonnet-4-20250514': { input: 3, output: 15 },
  'claude-haiku-4-5-20251001': { input: 0.8, output: 4 },
  'claude-3-5-haiku-20241022': { input: 0.8, output: 4 },
};

export function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = Object.entries(MODEL_PRICING).find(([key]) =>
    model.toLowerCase().includes(key.toLowerCase()) || key.toLowerCase().includes(model.toLowerCase())
  )?.[1];

  if (!pricing) {
    return (inputTokens * 3 + outputTokens * 15) / 1_000_000;
  }

  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
}
