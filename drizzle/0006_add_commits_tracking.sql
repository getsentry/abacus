-- Migration: Add commits tracking for AI attribution analysis
-- This enables tracking AI Attributed commits across repositories (GitHub, GitLab, etc.)

-- Normalized repositories table (saves space, enables source-agnostic design)
CREATE TABLE repositories (
  id SERIAL PRIMARY KEY,
  source VARCHAR(64) NOT NULL,        -- 'github', 'gitlab', 'bitbucket'
  full_name VARCHAR(255) NOT NULL,    -- 'getsentry/sentry'
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_repositories_unique ON repositories(source, full_name);

-- Commits table (stores ALL commits for percentage calculations)
CREATE TABLE commits (
  id SERIAL PRIMARY KEY,
  repo_id INTEGER NOT NULL REFERENCES repositories(id),
  commit_id VARCHAR(64) NOT NULL,     -- SHA (40 chars for git)
  author_email VARCHAR(255),          -- Maps via tool_identity_mappings
  committed_at TIMESTAMP NOT NULL,
  ai_tool VARCHAR(64),                -- 'claude_code', 'cursor', 'copilot', NULL if none
  ai_model VARCHAR(128),              -- 'opus-4.5', etc.
  additions INTEGER DEFAULT 0,
  deletions INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Unique constraint on repo + commit
CREATE UNIQUE INDEX idx_commits_unique ON commits(repo_id, commit_id);

-- Query indexes
CREATE INDEX idx_commits_author ON commits(author_email);
CREATE INDEX idx_commits_committed_at ON commits(committed_at);
CREATE INDEX idx_commits_repo_date ON commits(repo_id, committed_at);

-- Partial index for AI Attributed commits (commonly queried)
CREATE INDEX idx_commits_ai_tool ON commits(ai_tool) WHERE ai_tool IS NOT NULL;
