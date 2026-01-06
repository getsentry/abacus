/**
 * Historical data backfill script
 *
 * Usage:
 *   npx tsx scripts/backfill.ts --from 2024-01-01 --to 2025-01-06
 *   npx tsx scripts/backfill.ts --from 2024-01-01  # defaults to today
 *   npx tsx scripts/backfill.ts --days 30          # last 30 days
 *
 * Required env vars:
 *   POSTGRES_URL - Vercel Postgres connection string
 *   ANTHROPIC_ADMIN_KEY - Anthropic Admin API key
 *   CURSOR_TEAM_SLUG - Cursor team slug
 *   CURSOR_ADMIN_KEY - Cursor admin API key
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { syncAnthropicUsage } from '../src/lib/sync/anthropic';
import { syncCursorUsage } from '../src/lib/sync/cursor';

function parseArgs(): { from: string; to: string } {
  const args = process.argv.slice(2);
  let from: string | undefined;
  let to: string | undefined;
  let days: number | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--from' && args[i + 1]) {
      from = args[i + 1];
      i++;
    } else if (args[i] === '--to' && args[i + 1]) {
      to = args[i + 1];
      i++;
    } else if (args[i] === '--days' && args[i + 1]) {
      days = parseInt(args[i + 1], 10);
      i++;
    }
  }

  // Default end date is today
  const endDate = to || new Date().toISOString().split('T')[0];

  // Calculate start date
  let startDate: string;
  if (from) {
    startDate = from;
  } else if (days) {
    startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  } else {
    // Default to 30 days ago
    startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  }

  return { from: startDate, to: endDate };
}

async function main() {
  const { from, to } = parseArgs();

  console.log('='.repeat(60));
  console.log('AI Usage Tracker - Historical Backfill');
  console.log('='.repeat(60));
  console.log(`Date range: ${from} to ${to}`);
  console.log('');

  // Check configuration
  console.log('Configuration check:');
  console.log(`  POSTGRES_URL: ${process.env.POSTGRES_URL ? '✓ Set' : '✗ Missing'}`);
  console.log(`  ANTHROPIC_ADMIN_KEY: ${process.env.ANTHROPIC_ADMIN_KEY ? '✓ Set' : '✗ Missing'}`);
  console.log(`  CURSOR_TEAM_SLUG: ${process.env.CURSOR_TEAM_SLUG ? '✓ Set' : '✗ Missing'}`);
  console.log(`  CURSOR_ADMIN_KEY: ${process.env.CURSOR_ADMIN_KEY ? '✓ Set' : '✗ Missing'}`);
  console.log('');

  if (!process.env.POSTGRES_URL) {
    console.error('Error: POSTGRES_URL is required');
    process.exit(1);
  }

  // Sync Anthropic
  console.log('Syncing Anthropic (Claude Code) data...');
  const anthropicStart = Date.now();
  const anthropicResult = await syncAnthropicUsage(from, to);
  const anthropicDuration = ((Date.now() - anthropicStart) / 1000).toFixed(1);

  console.log(`  Status: ${anthropicResult.success ? '✓ Success' : '✗ Failed'}`);
  console.log(`  Records imported: ${anthropicResult.recordsImported}`);
  console.log(`  Records skipped: ${anthropicResult.recordsSkipped}`);
  console.log(`  Duration: ${anthropicDuration}s`);
  if (anthropicResult.errors.length > 0) {
    console.log(`  Errors: ${anthropicResult.errors.slice(0, 5).join(', ')}`);
  }
  console.log('');

  // Sync Cursor
  console.log('Syncing Cursor data...');
  const cursorStart = Date.now();
  const cursorResult = await syncCursorUsage(from, to);
  const cursorDuration = ((Date.now() - cursorStart) / 1000).toFixed(1);

  console.log(`  Status: ${cursorResult.success ? '✓ Success' : '✗ Failed'}`);
  console.log(`  Records imported: ${cursorResult.recordsImported}`);
  console.log(`  Records skipped: ${cursorResult.recordsSkipped}`);
  console.log(`  Duration: ${cursorDuration}s`);
  if (cursorResult.errors.length > 0) {
    console.log(`  Errors: ${cursorResult.errors.slice(0, 5).join(', ')}`);
  }
  console.log('');

  // Summary
  console.log('='.repeat(60));
  console.log('Summary');
  console.log('='.repeat(60));
  console.log(`Total records imported: ${anthropicResult.recordsImported + cursorResult.recordsImported}`);
  console.log(`Total records skipped: ${anthropicResult.recordsSkipped + cursorResult.recordsSkipped}`);
  console.log(`Total errors: ${anthropicResult.errors.length + cursorResult.errors.length}`);

  const success = anthropicResult.success && cursorResult.success;
  process.exit(success ? 0 : 1);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
