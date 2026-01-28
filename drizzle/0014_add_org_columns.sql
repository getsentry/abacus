-- Add organization tracking columns to usage_records for multi-org support

-- organizationId: Anthropic org UUID or derived ID for Cursor teams
ALTER TABLE "usage_records" ADD COLUMN "organization_id" varchar(64);

-- customerType: 'api' or 'subscription' (Anthropic only)
ALTER TABLE "usage_records" ADD COLUMN "customer_type" varchar(32);
