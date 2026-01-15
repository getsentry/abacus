import {
  pgTable,
  serial,
  varchar,
  integer,
  bigint,
  real,
  date,
  timestamp,
  boolean,
  text,
  index,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Maps provider-specific identities to user emails.
 *
 * Uses 'source' to match repositories.source for consistency.
 *
 * Examples:
 * - Anthropic: source='claude_code', external_id=API key ID
 * - GitHub: source='github', external_id=GitHub user ID
 * - GitLab: source='gitlab', external_id=GitLab user ID
 */
export const identityMappings = pgTable('identity_mappings', {
  source: varchar('source', { length: 64 }).notNull(),
  externalId: varchar('external_id', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.source, table.externalId] }),
  index('idx_identity_mappings_email').on(table.email),
]);

/**
 * Usage records - can be stored per-event (Cursor) or aggregated (Anthropic).
 *
 * The deduplication strategy depends on the provider:
 * - Cursor: Uses timestamp_ms for per-event granularity (each event is unique)
 * - Anthropic: Uses tool_record_id (API key ID) for per-day aggregation
 *
 * The unique constraint includes both timestamp_ms and tool_record_id to support both patterns.
 */
export const usageRecords = pgTable('usage_records', {
  id: serial('id').primaryKey(),
  date: date('date').notNull(),
  email: varchar('email', { length: 255 }).notNull(),
  tool: varchar('tool', { length: 64 }).notNull(),
  model: varchar('model', { length: 128 }).notNull(),
  rawModel: varchar('raw_model', { length: 128 }),
  inputTokens: integer('input_tokens').default(0),
  cacheWriteTokens: integer('cache_write_tokens').default(0),
  cacheReadTokens: integer('cache_read_tokens').default(0),
  outputTokens: integer('output_tokens').default(0),
  cost: real('cost').default(0),
  toolRecordId: varchar('tool_record_id', { length: 255 }),
  // Epoch milliseconds timestamp for per-event deduplication (Cursor)
  timestampMs: bigint('timestamp_ms', { mode: 'number' }),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('idx_usage_date').on(table.date),
  index('idx_usage_email').on(table.email),
  index('idx_usage_date_email').on(table.date, table.email),
  // Partial index for tool_record_id lookups (only where not null)
  index('idx_usage_tool_record_id').on(table.tool, table.toolRecordId),
  // Unique index for deduplication - includes timestamp_ms for per-event uniqueness
  uniqueIndex('idx_usage_unique').on(
    table.date,
    sql`COALESCE(${table.email}, '')`,
    table.tool,
    sql`COALESCE(${table.rawModel}, '')`,
    sql`COALESCE(${table.toolRecordId}, '')`,
    sql`COALESCE(${table.timestampMs}::text, '')`
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

/**
 * Normalized repositories table for commit tracking.
 * Enables source-agnostic design (GitHub, GitLab, Bitbucket, etc.)
 */
export const repositories = pgTable('repositories', {
  id: serial('id').primaryKey(),
  source: varchar('source', { length: 64 }).notNull(),
  fullName: varchar('full_name', { length: 255 }).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  uniqueIndex('idx_repositories_unique').on(table.source, table.fullName),
]);

/**
 * Commits table for tracking AI attribution in code commits.
 * Stores all commits to enable percentage calculations.
 *
 * The author_id is the provider's user ID (e.g., GitHub user ID) for identity mapping.
 * Resolution: (repositories.source, commits.author_id) -> identity_mappings -> email
 */
export const commits = pgTable('commits', {
  id: serial('id').primaryKey(),
  repoId: integer('repo_id').notNull().references(() => repositories.id),
  commitId: varchar('commit_id', { length: 64 }).notNull(),
  authorEmail: varchar('author_email', { length: 255 }),
  authorId: varchar('author_id', { length: 64 }),
  committedAt: timestamp('committed_at').notNull(),
  message: text('message'),
  aiTool: varchar('ai_tool', { length: 64 }),
  aiModel: varchar('ai_model', { length: 128 }),
  additions: integer('additions'),
  deletions: integer('deletions'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  uniqueIndex('idx_commits_unique').on(table.repoId, table.commitId),
  index('idx_commits_author').on(table.authorEmail),
  index('idx_commits_author_id').on(table.authorId),
  index('idx_commits_committed_at').on(table.committedAt),
]);

/**
 * Junction table for multiple AI tool attributions per commit.
 * Allows a single commit to be attributed to multiple tools.
 */
export const commitAttributions = pgTable('commit_attributions', {
  id: serial('id').primaryKey(),
  commitId: integer('commit_id').notNull().references(() => commits.id, { onDelete: 'cascade' }),
  aiTool: varchar('ai_tool', { length: 64 }).notNull(),
  aiModel: varchar('ai_model', { length: 128 }),
  confidence: varchar('confidence', { length: 20 }).default('detected'),
  source: varchar('source', { length: 64 }),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  uniqueIndex('idx_commit_attributions_unique').on(table.commitId, table.aiTool),
  index('idx_commit_attributions_commit').on(table.commitId),
  index('idx_commit_attributions_tool').on(table.aiTool),
]);

// Type exports for use in queries
export type IdentityMapping = typeof identityMappings.$inferSelect;
export type NewIdentityMapping = typeof identityMappings.$inferInsert;
export type UsageRecord = typeof usageRecords.$inferSelect;
export type NewUsageRecord = typeof usageRecords.$inferInsert;
export type SyncState = typeof syncState.$inferSelect;
export type Repository = typeof repositories.$inferSelect;
export type NewRepository = typeof repositories.$inferInsert;
export type Commit = typeof commits.$inferSelect;
export type NewCommit = typeof commits.$inferInsert;
export type CommitAttribution = typeof commitAttributions.$inferSelect;
export type NewCommitAttribution = typeof commitAttributions.$inferInsert;
