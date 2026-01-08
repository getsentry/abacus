-- Migration: Schema improvements
-- - Convert text columns to varchar for consistency
-- - Add missing indexes for common query patterns
-- - Remove redundant single-column indexes
-- - Convert backfill_complete to boolean

-- ============================================
-- 1. Convert usage_records text columns to varchar
-- ============================================
ALTER TABLE usage_records ALTER COLUMN email TYPE VARCHAR(255);
ALTER TABLE usage_records ALTER COLUMN tool TYPE VARCHAR(64);
ALTER TABLE usage_records ALTER COLUMN model TYPE VARCHAR(128);
ALTER TABLE usage_records ALTER COLUMN tool_record_id TYPE VARCHAR(255);

-- ============================================
-- 2. Convert sync_state columns
-- ============================================
ALTER TABLE sync_state ALTER COLUMN id TYPE VARCHAR(64);

-- Add backfill_complete column if it doesn't exist (it was missing from initial schema)
-- Using DO block to handle the case where column might already exist as text or boolean
DO $$
BEGIN
  -- Check if backfill_complete column exists
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'sync_state' AND column_name = 'backfill_complete') THEN
    -- Column exists - check if it's text type and needs conversion
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'sync_state' AND column_name = 'backfill_complete' AND data_type = 'text') THEN
      -- Convert from text to boolean
      ALTER TABLE sync_state ADD COLUMN backfill_complete_bool BOOLEAN DEFAULT FALSE;
      UPDATE sync_state SET backfill_complete_bool = (backfill_complete = 'true');
      ALTER TABLE sync_state DROP COLUMN backfill_complete;
      ALTER TABLE sync_state RENAME COLUMN backfill_complete_bool TO backfill_complete;
    END IF;
    -- If it's already boolean, do nothing
  ELSE
    -- Column doesn't exist, create it as boolean
    ALTER TABLE sync_state ADD COLUMN backfill_complete BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

-- ============================================
-- 3. Add missing indexes
-- ============================================

-- Index for setToolIdentityMapping() UPDATE query: WHERE tool = ? AND tool_record_id = ?
CREATE INDEX idx_usage_tool_record_id ON usage_records (tool, tool_record_id) WHERE tool_record_id IS NOT NULL;

-- Index for reverse email lookups on tool_identity_mappings
CREATE INDEX idx_identity_email ON tool_identity_mappings (email);

-- ============================================
-- 4. Remove redundant single-column indexes
-- These columns are rarely queried alone and are covered by composite indexes
-- ============================================
DROP INDEX IF EXISTS idx_usage_tool;
DROP INDEX IF EXISTS idx_usage_model;
