-- Rename tool_identity_mappings to identity_mappings
-- and unify naming around 'source' for consistency with repositories.source

-- Rename the table (if not already renamed)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_name = 'tool_identity_mappings') THEN
    ALTER TABLE tool_identity_mappings RENAME TO identity_mappings;
  END IF;
END $$;

-- Rename the column from 'tool' to 'source' (if not already renamed)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'identity_mappings' AND column_name = 'tool') THEN
    ALTER TABLE identity_mappings RENAME COLUMN tool TO source;
  END IF;
END $$;

-- Rename the index (if not already renamed)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes
             WHERE indexname = 'idx_identity_email') THEN
    ALTER INDEX idx_identity_email RENAME TO idx_identity_mappings_email;
  END IF;
END $$;

-- Add author_id to commits table for provider user ID tracking
-- This enables identity mapping via (repositories.source, commits.author_id) -> identity_mappings
ALTER TABLE commits ADD COLUMN IF NOT EXISTS author_id VARCHAR(64);
CREATE INDEX IF NOT EXISTS idx_commits_author_id ON commits(author_id);
