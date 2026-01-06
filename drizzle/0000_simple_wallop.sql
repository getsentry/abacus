CREATE TABLE "api_key_mappings" (
	"api_key" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sync_state" (
	"id" text PRIMARY KEY NOT NULL,
	"last_sync_at" timestamp,
	"last_cursor" text
);
--> statement-breakpoint
CREATE TABLE "usage_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"email" text NOT NULL,
	"tool" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0,
	"cache_write_tokens" integer DEFAULT 0,
	"cache_read_tokens" integer DEFAULT 0,
	"output_tokens" integer DEFAULT 0,
	"cost" real DEFAULT 0,
	"raw_api_key" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "idx_usage_date" ON "usage_records" USING btree ("date");--> statement-breakpoint
CREATE INDEX "idx_usage_email" ON "usage_records" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_usage_tool" ON "usage_records" USING btree ("tool");--> statement-breakpoint
CREATE INDEX "idx_usage_model" ON "usage_records" USING btree ("model");--> statement-breakpoint
CREATE INDEX "idx_usage_date_email" ON "usage_records" USING btree ("date","email");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_usage_unique" ON "usage_records" USING btree ("date","email","tool","model",COALESCE("raw_api_key", ''));