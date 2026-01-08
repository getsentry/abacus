-- Make additions/deletions nullable since webhooks don't include line stats
-- null = unknown, 0 = no lines changed
ALTER TABLE commits ALTER COLUMN additions DROP DEFAULT;
ALTER TABLE commits ALTER COLUMN deletions DROP DEFAULT;
