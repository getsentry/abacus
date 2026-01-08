-- Add missing sync_state columns for incremental sync tracking
-- These columns were defined in schema.ts but never added via migration

-- last_synced_hour_end: Used by Cursor (epoch ms) and reused by Anthropic/GitHub (ISO date string)
ALTER TABLE sync_state ADD COLUMN IF NOT EXISTS last_synced_hour_end VARCHAR(32);

-- backfill_oldest_date: Tracks the oldest date successfully synced during backfill
ALTER TABLE sync_state ADD COLUMN IF NOT EXISTS backfill_oldest_date VARCHAR(10);

-- backfill_complete: Already handled by migration 0004, but add IF NOT EXISTS as safety
ALTER TABLE sync_state ADD COLUMN IF NOT EXISTS backfill_complete BOOLEAN DEFAULT FALSE;

-- Convert last_cursor to varchar if it's still text (consistency with schema)
ALTER TABLE sync_state ALTER COLUMN last_cursor TYPE VARCHAR(255);
