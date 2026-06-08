ALTER TABLE "openrouter_keys" ALTER COLUMN "created_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "openrouter_keys" ADD COLUMN "disabled" boolean DEFAULT false;