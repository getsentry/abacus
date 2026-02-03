DROP INDEX "idx_usage_unique";--> statement-breakpoint
ALTER TABLE "usage_records" ADD COLUMN "organization_id" varchar(64);--> statement-breakpoint
ALTER TABLE "usage_records" ADD COLUMN "customer_type" varchar(32);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_usage_unique" ON "usage_records" USING btree ("date",COALESCE("email", ''),"tool",COALESCE("raw_model", ''),COALESCE("tool_record_id", ''),COALESCE("timestamp_ms"::text, ''),COALESCE("organization_id", ''));