import {
  pgTable,
  serial,
  varchar,
  integer,
  real,
  date,
  timestamp,
  boolean,
  index,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Maps provider-specific identities to user emails.
 *
 * Examples:
 * - Anthropic: tool='claude_code', external_id=API key ID
 * - Future providers: tool='provider_name', external_id=their user/key ID
 */
export const toolIdentityMappings = pgTable('tool_identity_mappings', {
  tool: varchar('tool', { length: 64 }).notNull(),
  externalId: varchar('external_id', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.tool, table.externalId] }),
  index('idx_identity_email').on(table.email),
]);

/**
 * Usage records aggregated by date, user, tool, and model.
 *
 * The tool_record_id is a provider-specific identifier used for deduplication:
 * - Anthropic: API key ID (usage is reported per key)
 * - Cursor: null (usage is reported per email)
 * - Future providers: whatever unique ID they provide
 */
export const usageRecords = pgTable('usage_records', {
  id: serial('id').primaryKey(),
  date: date('date').notNull(),
  email: varchar('email', { length: 255 }).notNull(),
  tool: varchar('tool', { length: 64 }).notNull(),
  model: varchar('model', { length: 128 }).notNull(),
  inputTokens: integer('input_tokens').default(0),
  cacheWriteTokens: integer('cache_write_tokens').default(0),
  cacheReadTokens: integer('cache_read_tokens').default(0),
  outputTokens: integer('output_tokens').default(0),
  cost: real('cost').default(0),
  toolRecordId: varchar('tool_record_id', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('idx_usage_date').on(table.date),
  index('idx_usage_email').on(table.email),
  index('idx_usage_date_email').on(table.date, table.email),
  // Partial index for tool_record_id lookups (only where not null)
  index('idx_usage_tool_record_id').on(table.tool, table.toolRecordId),
  // Unique index for deduplication (using raw SQL for COALESCE)
  uniqueIndex('idx_usage_unique').on(
    table.date,
    table.email,
    table.tool,
    table.model,
    sql`COALESCE(${table.toolRecordId}, '')`
  ),
]);

/**
 * Tracks sync state for each provider to enable incremental syncing.
 */
export const syncState = pgTable('sync_state', {
  id: varchar('id', { length: 64 }).primaryKey(),
  lastSyncAt: timestamp('last_sync_at'),
  lastCursor: varchar('last_cursor', { length: 255 }),
  // For Cursor: tracks the end of the last synced hour (epoch ms)
  lastSyncedHourEnd: varchar('last_synced_hour_end', { length: 32 }),
  // For backfills: tracks the oldest date we've successfully synced to
  backfillOldestDate: varchar('backfill_oldest_date', { length: 10 }),
  // True when backfill has definitively completed
  backfillComplete: boolean('backfill_complete').default(false),
});

// Type exports for use in queries
export type ToolIdentityMapping = typeof toolIdentityMappings.$inferSelect;
export type NewToolIdentityMapping = typeof toolIdentityMappings.$inferInsert;
export type UsageRecord = typeof usageRecords.$inferSelect;
export type NewUsageRecord = typeof usageRecords.$inferInsert;
export type SyncState = typeof syncState.$inferSelect;
