ALTER TABLE "openrouter_keys" ADD COLUMN "workspace" varchar(255);
UPDATE "openrouter_keys" SET "workspace" = 'Coding Agents' WHERE "workspace" IS NULL;
ALTER TABLE "openrouter_keys" ALTER COLUMN "workspace" SET NOT NULL;
UPDATE "usage_records" SET "organization_id" = 'Coding Agents' WHERE "tool" = 'openrouter' AND "organization_id" IS NULL;
