-- Normalize model names to canonical format
-- Handles patterns like "4-sonnet" → "sonnet-4", "4-sonnet (T)" → "sonnet-4 (T)"

-- First, normalize models with suffixes like "(T)" or "(Thinking)"
-- Pattern: "4-sonnet (T)" → "sonnet-4 (T)"
UPDATE usage_records
SET model = regexp_replace(model, '^(\d+(?:\.\d+)?)-([a-zA-Z]+)\s*\(([^)]+)\)$', '\2-\1 (\3)')
WHERE model ~ '^\d+(?:\.\d+)?-[a-zA-Z]+\s*\([^)]+\)$';
--> statement-breakpoint

-- Normalize "(Thinking)" to "(T)" for consistency
UPDATE usage_records
SET model = regexp_replace(model, '\s*\(Thinking\)\s*$', ' (T)')
WHERE model LIKE '%(Thinking)%';
--> statement-breakpoint

-- Then normalize models without suffixes
-- Pattern: "4-sonnet" → "sonnet-4"
UPDATE usage_records
SET model = regexp_replace(model, '^(\d+(?:\.\d+)?)-([a-zA-Z]+)$', '\2-\1')
WHERE model ~ '^\d+(?:\.\d+)?-[a-zA-Z]+$';
--> statement-breakpoint

-- Lowercase the model family names for consistency
-- e.g., "Sonnet-4" → "sonnet-4"
UPDATE usage_records
SET model = lower(substring(model from 1 for position('-' in model))) || substring(model from position('-' in model) + 1)
WHERE model ~ '^[A-Z][a-z]+-\d';
