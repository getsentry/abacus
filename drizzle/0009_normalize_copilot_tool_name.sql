-- Normalize Copilot tool name to github_copilot for consistency
-- The detection code uses 'github_copilot' but some early data may have 'copilot'

-- Update commits table
UPDATE commits
SET ai_tool = 'github_copilot'
WHERE ai_tool = 'copilot';
--> statement-breakpoint

-- Update commit_attributions table
UPDATE commit_attributions
SET ai_tool = 'github_copilot'
WHERE ai_tool = 'copilot';
