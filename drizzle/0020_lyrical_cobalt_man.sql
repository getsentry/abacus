CREATE TABLE "openrouter_workspaces" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "openrouter_keys" ADD COLUMN "workspace_id" varchar(64);--> statement-breakpoint
ALTER TABLE "openrouter_keys" DROP COLUMN "workspace";