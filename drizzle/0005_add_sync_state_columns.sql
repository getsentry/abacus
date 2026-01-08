-- Add missing sync_state columns (schema defines them but no migration created them)
ALTER TABLE sync_state ADD COLUMN IF NOT EXISTS last_synced_hour_end VARCHAR(32);
ALTER TABLE sync_state ADD COLUMN IF NOT EXISTS backfill_oldest_date VARCHAR(10);
