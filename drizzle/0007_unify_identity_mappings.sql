-- Rename tool_identity_mappings to identity_mappings
-- and unify naming around 'source' for consistency with repositories.source

-- Rename the table
ALTER TABLE tool_identity_mappings RENAME TO identity_mappings;

-- Rename the column from 'tool' to 'source'
ALTER TABLE identity_mappings RENAME COLUMN tool TO source;

-- Rename the index (PostgreSQL doesn't auto-rename indexes)
ALTER INDEX idx_identity_email RENAME TO idx_identity_mappings_email;

-- Add author_id to commits table for provider user ID tracking
-- This enables identity mapping via (repositories.source, commits.author_id) -> identity_mappings
ALTER TABLE commits ADD COLUMN author_id VARCHAR(64);
CREATE INDEX idx_commits_author_id ON commits(author_id);
