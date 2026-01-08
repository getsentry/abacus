-- Multi-tool commit attribution support
-- Allows a single commit to be attributed to multiple AI tools

-- Add message column for retroactive attribution fixes
ALTER TABLE commits ADD COLUMN IF NOT EXISTS message TEXT;

-- Create junction table for multiple tool attributions per commit
CREATE TABLE IF NOT EXISTS commit_attributions (
  id SERIAL PRIMARY KEY,
  commit_id INTEGER NOT NULL REFERENCES commits(id) ON DELETE CASCADE,
  ai_tool VARCHAR(64) NOT NULL,
  ai_model VARCHAR(128),
  confidence VARCHAR(20) DEFAULT 'detected',
  source VARCHAR(64),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(commit_id, ai_tool)
);

CREATE INDEX IF NOT EXISTS idx_commit_attributions_commit ON commit_attributions(commit_id);
CREATE INDEX IF NOT EXISTS idx_commit_attributions_tool ON commit_attributions(ai_tool);

-- Migrate existing attribution data to junction table
INSERT INTO commit_attributions (commit_id, ai_tool, ai_model, confidence, source)
SELECT id, ai_tool, ai_model, 'detected', 'legacy_migration'
FROM commits
WHERE ai_tool IS NOT NULL
ON CONFLICT (commit_id, ai_tool) DO NOTHING;
