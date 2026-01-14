import { sql } from '@vercel/postgres';

/**
 * Fix duplicate usage records caused by raw_model inconsistency.
 *
 * Some records were synced with raw_model = normalized model name (e.g., "opus-4.5")
 * Then later synced correctly with raw_model = full model name (e.g., "claude-opus-4-5-20251101")
 *
 * Since ON CONFLICT includes raw_model, these weren't deduplicated.
 * This script removes the older, incorrect records.
 *
 * Ranking priority (keeps first, deletes rest):
 * 1. Non-NULL raw_model (has provider data)
 * 2. NULL raw_model (missing data, e.g. old CSV imports)
 * 3. Higher ID as tiebreaker (newer record)
 */
export async function cmdFixDuplicates(dryRun: boolean = true): Promise<void> {
  console.log(`\n${dryRun ? '🔍 DRY RUN - ' : ''}Fixing duplicate usage records\n`);

  // Find duplicates and identify which to delete
  // Keep records with non-NULL raw_model, delete NULL ones
  // If both have same NULL status, keep newer (higher ID)
  const duplicates = await sql`
    WITH ranked AS (
      SELECT
        id,
        date,
        email,
        model,
        raw_model,
        tool,
        cost,
        ROW_NUMBER() OVER (
          PARTITION BY date, email, model, tool, input_tokens, output_tokens, cache_write_tokens
          ORDER BY
            CASE WHEN raw_model IS NULL THEN 1 ELSE 0 END,
            id DESC
        ) as rn
      FROM usage_records
    )
    SELECT id, date::text, email, model, raw_model, cost
    FROM ranked
    WHERE rn > 1
    ORDER BY date DESC, id
  `;

  if (duplicates.rows.length === 0) {
    console.log('✓ No duplicates found!');
    return;
  }

  console.log(`Found ${duplicates.rows.length} duplicate records to remove:`);

  let totalCost = 0;
  for (const row of duplicates.rows) {
    totalCost += Number(row.cost);
    console.log(`  ID ${row.id}: ${row.date} ${row.email || 'NULL'} ${row.model} (raw: ${row.raw_model}) $${Number(row.cost).toFixed(2)}`);
  }

  console.log(`\nTotal extra cost being removed: $${totalCost.toFixed(2)}`);

  if (dryRun) {
    console.log('\n⚠️  DRY RUN - No records deleted. Run with --execute to apply changes.');
    return;
  }

  // Delete the duplicates using a subquery (same logic as the selection)
  const result = await sql`
    WITH ranked AS (
      SELECT
        id,
        ROW_NUMBER() OVER (
          PARTITION BY date, email, model, tool, input_tokens, output_tokens, cache_write_tokens
          ORDER BY
            CASE WHEN raw_model IS NULL THEN 1 ELSE 0 END,
            id DESC
        ) as rn
      FROM usage_records
    )
    DELETE FROM usage_records
    WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
  `;

  console.log(`\n✓ Deleted ${result.rowCount || 0} duplicate records`);
}
