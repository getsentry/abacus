-- Migration: Modular schema for multi-provider support
-- Renames provider-specific columns to generic names

-- Rename raw_api_key to tool_record_id in usage_records (if not already renamed)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'usage_records' AND column_name = 'raw_api_key') THEN
    ALTER TABLE usage_records RENAME COLUMN raw_api_key TO tool_record_id;
  END IF;
END $$;

-- Drop old unique index and recreate with new column name
DROP INDEX IF EXISTS idx_usage_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_usage_unique ON usage_records (date, email, tool, model, COALESCE(tool_record_id, ''));

-- Rename api_key_mappings to tool_identity_mappings (if not already renamed)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_name = 'api_key_mappings') THEN
    ALTER TABLE api_key_mappings RENAME TO tool_identity_mappings;
  END IF;
END $$;

-- Rename api_key column to external_id (if not already renamed)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'tool_identity_mappings' AND column_name = 'api_key') THEN
    ALTER TABLE tool_identity_mappings RENAME COLUMN api_key TO external_id;
  END IF;
END $$;

-- Add tool column with default for existing data (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'tool_identity_mappings' AND column_name = 'tool') THEN
    ALTER TABLE tool_identity_mappings ADD COLUMN tool VARCHAR(64) NOT NULL DEFAULT 'claude_code';
  END IF;
END $$;

-- Convert text columns to varchar for better primary key semantics (safe to re-run)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tool_identity_mappings') THEN
    ALTER TABLE tool_identity_mappings ALTER COLUMN external_id TYPE VARCHAR(255);
    ALTER TABLE tool_identity_mappings ALTER COLUMN email TYPE VARCHAR(255);
  END IF;
END $$;

-- Drop old primary key and create new composite primary key (if needed)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints
             WHERE constraint_name = 'api_key_mappings_pkey' AND table_name = 'tool_identity_mappings') THEN
    ALTER TABLE tool_identity_mappings DROP CONSTRAINT api_key_mappings_pkey;
    ALTER TABLE tool_identity_mappings ADD PRIMARY KEY (tool, external_id);
  END IF;
END $$;

-- Remove the default now that existing data is migrated (safe to re-run)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'tool_identity_mappings' AND column_name = 'tool') THEN
    ALTER TABLE tool_identity_mappings ALTER COLUMN tool DROP DEFAULT;
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Ignore if default doesn't exist
  NULL;
END $$;
