import { sql } from '@vercel/postgres';
import { neonConfig } from '@neondatabase/serverless';

// Configure for local development
if (!process.env.VERCEL_ENV) {
  neonConfig.wsProxy = (host) => `${host}:5433/v1`;
  neonConfig.useSecureWebSocket = false;
  neonConfig.pipelineTLS = false;
  neonConfig.pipelineConnect = false;
}

let schemaInitialized = false;

export async function initializeSchema() {
  if (schemaInitialized) return;

  await sql`
    CREATE TABLE IF NOT EXISTS api_key_mappings (
      api_key TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS usage_records (
      id SERIAL PRIMARY KEY,
      date DATE NOT NULL,
      email TEXT NOT NULL,
      tool TEXT NOT NULL CHECK (tool IN ('claude_code', 'cursor')),
      model TEXT NOT NULL,
      input_tokens INTEGER DEFAULT 0,
      cache_write_tokens INTEGER DEFAULT 0,
      cache_read_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      cost REAL DEFAULT 0,
      raw_api_key TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_usage_date ON usage_records(date)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_usage_email ON usage_records(email)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_usage_tool ON usage_records(tool)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_usage_model ON usage_records(model)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_usage_date_email ON usage_records(date, email)`;

  // Unique constraint for deduplication (COALESCE handles NULL raw_api_key)
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_usage_unique ON usage_records(date, email, tool, model, COALESCE(raw_api_key, ''))`;

  await sql`
    CREATE TABLE IF NOT EXISTS sync_state (
      id TEXT PRIMARY KEY,
      last_sync_at TIMESTAMP,
      last_cursor TEXT
    )
  `;

  schemaInitialized = true;
}

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

export { sql };
