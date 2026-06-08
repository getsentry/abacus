CREATE TABLE "openrouter_keys" (
	"hash" varchar(255) PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_openrouter_keys_email" ON "openrouter_keys" USING btree ("email");