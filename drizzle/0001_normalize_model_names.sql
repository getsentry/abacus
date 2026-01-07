-- Normalize model names to canonical format
-- Target format: "{family}-{version}" e.g., "sonnet-4", "haiku-3.5", "opus-4.5"
-- With optional suffix: "sonnet-4 (T)" for thinking mode

-- Step 1: Handle full Anthropic model names with dates
-- "claude-3-5-haiku-20241022" → "haiku-3.5"
-- "claude-sonnet-4-20250514" → "sonnet-4"
-- "claude-opus-4-5-20251101" → "opus-4.5"
UPDATE usage_records
SET model = CASE
  -- claude-X-Y-{family}-{date} pattern (e.g., claude-3-5-haiku-20241022)
  WHEN model ~ '^claude-(\d+)-(\d+)-([a-z]+)-\d{8}$' THEN
    regexp_replace(model, '^claude-(\d+)-(\d+)-([a-z]+)-\d{8}$', '\3-\1.\2')
  -- claude-{family}-X-{date} pattern (e.g., claude-sonnet-4-20250514)
  WHEN model ~ '^claude-([a-z]+)-(\d+)-\d{8}$' THEN
    regexp_replace(model, '^claude-([a-z]+)-(\d+)-\d{8}$', '\1-\2')
  -- claude-{family}-X-Y-{date} pattern (e.g., claude-opus-4-5-20251101)
  WHEN model ~ '^claude-([a-z]+)-(\d+)-(\d+)-\d{8}$' THEN
    regexp_replace(model, '^claude-([a-z]+)-(\d+)-(\d+)-\d{8}$', '\1-\2.\3')
  ELSE model
END
WHERE model ~ '^claude-.*-\d{8}$';
--> statement-breakpoint

-- Step 2: Handle model names without claude- prefix but with dates
-- "3-5-haiku-20241022" → "haiku-3.5"
UPDATE usage_records
SET model = CASE
  WHEN model ~ '^(\d+)-(\d+)-([a-z]+)-\d{8}$' THEN
    regexp_replace(model, '^(\d+)-(\d+)-([a-z]+)-\d{8}$', '\3-\1.\2')
  WHEN model ~ '^([a-z]+)-(\d+)-\d{8}$' THEN
    regexp_replace(model, '^([a-z]+)-(\d+)-\d{8}$', '\1-\2')
  WHEN model ~ '^([a-z]+)-(\d+)-(\d+)-\d{8}$' THEN
    regexp_replace(model, '^([a-z]+)-(\d+)-(\d+)-\d{8}$', '\1-\2.\3')
  ELSE model
END
WHERE model ~ '^\d+-\d+-[a-z]+-\d{8}$' OR model ~ '^[a-z]+-\d+-\d{8}$';
--> statement-breakpoint

-- Step 3: Handle reversed short forms with suffixes
-- "4-sonnet (T)" → "sonnet-4 (T)"
UPDATE usage_records
SET model = regexp_replace(model, '^(\d+(?:\.\d+)?)-([a-zA-Z]+)\s*(\([^)]+\))$', '\2-\1 \3')
WHERE model ~ '^\d+(\.\d+)?-[a-zA-Z]+\s*\([^)]+\)$';
--> statement-breakpoint

-- Step 4: Handle reversed short forms without suffixes
-- "4-sonnet" → "sonnet-4"
UPDATE usage_records
SET model = regexp_replace(model, '^(\d+(?:\.\d+)?)-([a-zA-Z]+)$', '\2-\1')
WHERE model ~ '^\d+(\.\d+)?-[a-zA-Z]+$';
--> statement-breakpoint

-- Step 5: Normalize "(Thinking)" to "(T)" for consistency
UPDATE usage_records
SET model = regexp_replace(model, '\s*\(Thinking\)\s*$', ' (T)')
WHERE model LIKE '%(Thinking)%';
--> statement-breakpoint

-- Step 6: Lowercase model family names for consistency
-- "Sonnet-4" → "sonnet-4"
UPDATE usage_records
SET model = lower(model)
WHERE model ~ '^[A-Z]';
--> statement-breakpoint

-- Step 7: Handle standalone version numbers (Cursor sometimes sends just "4")
-- "4" → "sonnet-4" (standalone 4 typically means Claude Sonnet 4)
UPDATE usage_records
SET model = 'sonnet-' || model
WHERE model ~ '^\d+(\.\d+)?$' AND tool = 'cursor';
--> statement-breakpoint

-- Step 8: Handle claude-X-family-high-thinking patterns
-- "claude-4.5-opus-high-thinking" → "opus-4.5 (HT)"
UPDATE usage_records
SET model = regexp_replace(model, '^claude-(\d+(?:\.\d+)?)-([a-z]+)-high-thinking$', '\2-\1 (HT)')
WHERE model ~ '^claude-\d+(\.\d+)?-[a-z]+-high-thinking$';
--> statement-breakpoint

-- Step 9: Handle claude-X-family-thinking patterns
-- "claude-4-sonnet-thinking" → "sonnet-4 (T)"
UPDATE usage_records
SET model = regexp_replace(model, '^claude-(\d+(?:\.\d+)?)-([a-z]+)-thinking$', '\2-\1 (T)')
WHERE model ~ '^claude-\d+(\.\d+)?-[a-z]+-thinking$';
--> statement-breakpoint

-- Step 10: Handle claude-X-family patterns (version before family)
-- "claude-4-sonnet" → "sonnet-4"
UPDATE usage_records
SET model = regexp_replace(model, '^claude-(\d+(?:\.\d+)?)-([a-z]+)$', '\2-\1')
WHERE model ~ '^claude-\d+(\.\d+)?-[a-z]+$';
--> statement-breakpoint

-- Step 11: Normalize default/auto/unknown to magic string
UPDATE usage_records
SET model = '(default)'
WHERE lower(model) IN ('default', 'auto', 'unknown', '');
