-- Migration: Modular schema for multi-provider support
-- Renames provider-specific columns to generic names

-- Rename raw_api_key to tool_record_id in usage_records
ALTER TABLE usage_records RENAME COLUMN raw_api_key TO tool_record_id;

-- Drop old unique index and recreate with new column name
DROP INDEX IF EXISTS idx_usage_unique;
CREATE UNIQUE INDEX idx_usage_unique ON usage_records (date, email, tool, model, COALESCE(tool_record_id, ''));

-- Rename api_key_mappings to tool_identity_mappings and restructure
ALTER TABLE api_key_mappings RENAME TO tool_identity_mappings;
ALTER TABLE tool_identity_mappings RENAME COLUMN api_key TO external_id;

-- Add tool column with default for existing data (all existing mappings are from claude_code/anthropic)
ALTER TABLE tool_identity_mappings ADD COLUMN tool VARCHAR(64) NOT NULL DEFAULT 'claude_code';

-- Convert text columns to varchar for better primary key semantics
ALTER TABLE tool_identity_mappings ALTER COLUMN external_id TYPE VARCHAR(255);
ALTER TABLE tool_identity_mappings ALTER COLUMN email TYPE VARCHAR(255);

-- Drop old primary key and create new composite primary key
ALTER TABLE tool_identity_mappings DROP CONSTRAINT api_key_mappings_pkey;
ALTER TABLE tool_identity_mappings ADD PRIMARY KEY (tool, external_id);

-- Remove the default now that existing data is migrated
ALTER TABLE tool_identity_mappings ALTER COLUMN tool DROP DEFAULT;
