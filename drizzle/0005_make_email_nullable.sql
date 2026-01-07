-- Make email column nullable and convert 'unknown' to NULL
-- This is a cleaner database design than using a sentinel string value

-- Step 1: Drop the NOT NULL constraint on email (must do this before setting NULL)
ALTER TABLE usage_records ALTER COLUMN email DROP NOT NULL;

-- Step 2: Update existing 'unknown' values to NULL
UPDATE usage_records SET email = NULL WHERE email = 'unknown';

-- Step 3: Update unique index to handle NULL emails using COALESCE
-- (Two NULL emails should be considered equal for uniqueness purposes)
DROP INDEX IF EXISTS idx_usage_unique;
CREATE UNIQUE INDEX idx_usage_unique ON usage_records (date, COALESCE(email, ''), tool, model, COALESCE(tool_record_id, ''));

-- Step 4: Add a comment explaining the semantics
COMMENT ON COLUMN usage_records.email IS 'User email address. NULL means the usage could not be attributed to a specific user.';
