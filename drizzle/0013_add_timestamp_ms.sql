-- Add timestamp_ms column for per-event deduplication (Cursor)
ALTER TABLE "usage_records" ADD COLUMN "timestamp_ms" bigint;

-- Drop old unique index
DROP INDEX IF EXISTS "idx_usage_unique";

-- Create new unique index that includes timestamp_ms for per-event uniqueness
CREATE UNIQUE INDEX "idx_usage_unique" ON "usage_records" (
  "date",
  COALESCE("email", ''),
  "tool",
  COALESCE("raw_model", ''),
  COALESCE("tool_record_id", ''),
  COALESCE("timestamp_ms"::text, '')
);
