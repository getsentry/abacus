-- Add raw_model column to preserve original model strings from providers
-- The model column stores normalized names (without thinking variant suffixes)

-- Step 1: Add the raw_model column (nullable) - IF NOT EXISTS for idempotency
ALTER TABLE usage_records ADD COLUMN IF NOT EXISTS raw_model varchar(128);
--> statement-breakpoint

-- Step 2: Copy current model to raw_model for ALL existing records
-- This preserves uniqueness when we switch the index from model to raw_model
-- For historical data, raw_model = model since we don't have the original strings
UPDATE usage_records SET raw_model = model WHERE raw_model IS NULL;
--> statement-breakpoint

-- Step 3: Drop the old unique index that uses model
DROP INDEX IF EXISTS idx_usage_unique;
--> statement-breakpoint

-- Step 4: Create new unique index using raw_model instead of model
-- This allows proper deduplication based on the actual model string from providers
CREATE UNIQUE INDEX idx_usage_unique ON usage_records (
  date,
  COALESCE(email, ''),
  tool,
  COALESCE(raw_model, ''),
  COALESCE(tool_record_id, '')
);
--> statement-breakpoint

-- Step 5: Strip (T) and (HT) suffixes from model column
-- The raw_model now preserves the original value with suffix
UPDATE usage_records
SET model = regexp_replace(model, '\s*\((T|HT)\)$', '')
WHERE model LIKE '% (T)' OR model LIKE '% (HT)';
