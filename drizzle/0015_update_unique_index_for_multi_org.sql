-- Update unique index to include organization_id for multi-org support
-- This prevents records from different organizations from overwriting each other

-- Drop the old index
DROP INDEX IF EXISTS "idx_usage_unique";

-- Create the new index including organization_id
CREATE UNIQUE INDEX "idx_usage_unique" ON "usage_records" (
  "date",
  COALESCE("email", ''),
  "tool",
  COALESCE("raw_model", ''),
  COALESCE("tool_record_id", ''),
  COALESCE("timestamp_ms"::text, ''),
  COALESCE("organization_id", '')
);
