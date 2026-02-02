-- Update unique index to include organization_id for multi-org support
-- Note: organization_id and customer_type columns were added in 0014_add_org_columns.sql

DROP INDEX "idx_usage_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "idx_usage_unique" ON "usage_records" USING btree ("date",COALESCE("email", ''),"tool",COALESCE("raw_model", ''),COALESCE("tool_record_id", ''),COALESCE("timestamp_ms"::text, ''),COALESCE("organization_id", ''));
