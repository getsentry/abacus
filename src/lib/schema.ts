import {
  pgTable,
  serial,
  text,
  integer,
  real,
  date,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const apiKeyMappings = pgTable('api_key_mappings', {
  apiKey: text('api_key').primaryKey(),
  email: text('email').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const usageRecords = pgTable('usage_records', {
  id: serial('id').primaryKey(),
  date: date('date').notNull(),
  email: text('email').notNull(),
  tool: text('tool').notNull(), // 'claude_code' | 'cursor'
  model: text('model').notNull(),
  inputTokens: integer('input_tokens').default(0),
  cacheWriteTokens: integer('cache_write_tokens').default(0),
  cacheReadTokens: integer('cache_read_tokens').default(0),
  outputTokens: integer('output_tokens').default(0),
  cost: real('cost').default(0),
  rawApiKey: text('raw_api_key'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('idx_usage_date').on(table.date),
  index('idx_usage_email').on(table.email),
  index('idx_usage_tool').on(table.tool),
  index('idx_usage_model').on(table.model),
  index('idx_usage_date_email').on(table.date, table.email),
  // Unique index for deduplication (using raw SQL for COALESCE)
  uniqueIndex('idx_usage_unique').on(
    table.date,
    table.email,
    table.tool,
    table.model,
    sql`COALESCE(${table.rawApiKey}, '')`
  ),
]);

export const syncState = pgTable('sync_state', {
  id: text('id').primaryKey(),
  lastSyncAt: timestamp('last_sync_at'),
  lastCursor: text('last_cursor'),
});

// Type exports for use in queries
export type ApiKeyMapping = typeof apiKeyMappings.$inferSelect;
export type NewApiKeyMapping = typeof apiKeyMappings.$inferInsert;
export type UsageRecord = typeof usageRecords.$inferSelect;
export type NewUsageRecord = typeof usageRecords.$inferInsert;
export type SyncState = typeof syncState.$inferSelect;
