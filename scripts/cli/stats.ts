import { sql } from '@vercel/postgres';

export async function cmdStats() {
  console.log('📊 Database Statistics\n');

  const totalRecords = await sql`SELECT COUNT(*) as count FROM usage_records`;
  console.log(`Total usage records: ${totalRecords.rows[0].count}`);

  const unknownCount = await sql`SELECT COUNT(*) as count FROM usage_records WHERE email = 'unknown'`;
  console.log(`Unknown user records: ${unknownCount.rows[0].count}`);

  const byTool = await sql`SELECT tool, COUNT(*) as count FROM usage_records GROUP BY tool`;
  console.log('\nBy tool:');
  for (const row of byTool.rows) {
    console.log(`  ${row.tool}: ${row.count}`);
  }

  const byEmail = await sql`SELECT email, COUNT(*) as count, SUM(input_tokens + output_tokens)::int as tokens FROM usage_records GROUP BY email ORDER BY tokens DESC LIMIT 10`;
  console.log('\nTop users by tokens:');
  for (const row of byEmail.rows) {
    console.log(`  ${row.email}: ${row.count} records, ${row.tokens?.toLocaleString()} tokens`);
  }

  const dateRange = await sql`SELECT MIN(date) as min_date, MAX(date) as max_date FROM usage_records`;
  if (dateRange.rows[0].min_date) {
    console.log(`\nDate range: ${dateRange.rows[0].min_date} to ${dateRange.rows[0].max_date}`);
  }

  const mappingsCount = await sql`SELECT COUNT(*) as count FROM identity_mappings`;
  console.log(`\nTool identity mappings: ${mappingsCount.rows[0].count}`);
}
