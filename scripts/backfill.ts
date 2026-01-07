/**
 * Historical data backfill script
 *
 * Backfills ALL history by going month-by-month backwards until no data is returned.
 * Processes one service at a time, serially.
 *
 * Usage:
 *   npm run backfill                    # Backfill all history
 *   npm run backfill -- --service anthropic  # Only backfill Anthropic
 *   npm run backfill -- --service cursor     # Only backfill Cursor
 *   npm run backfill -- --start-month 2024-06  # Start from specific month
 *
 * Required env vars:
 *   POSTGRES_URL - Database connection string
 *   ANTHROPIC_ADMIN_KEY - Anthropic Admin API key (for Anthropic sync)
 *   CURSOR_TEAM_SLUG - Cursor team slug (for Cursor sync)
 *   CURSOR_ADMIN_KEY - Cursor admin API key (for Cursor sync)
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { syncAnthropicUsage } from '../src/lib/sync/anthropic';
import { syncCursorUsage } from '../src/lib/sync/cursor';
import { syncAnthropicApiKeyMappings } from '../src/lib/sync/anthropic-mappings';

type Service = 'anthropic' | 'cursor';

interface BackfillOptions {
  services: Service[];
  startMonth?: string; // YYYY-MM format
}

function parseArgs(): BackfillOptions {
  const args = process.argv.slice(2);
  let services: Service[] = ['anthropic', 'cursor'];
  let startMonth: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--service' && args[i + 1]) {
      const service = args[i + 1].toLowerCase() as Service;
      if (service === 'anthropic' || service === 'cursor') {
        services = [service];
      }
      i++;
    } else if (args[i] === '--start-month' && args[i + 1]) {
      startMonth = args[i + 1];
      i++;
    }
  }

  return { services, startMonth };
}

function getMonthRange(yearMonth: string): { start: string; end: string } {
  const [year, month] = yearMonth.split('-').map(Number);
  const start = `${year}-${String(month).padStart(2, '0')}-01`;

  // Get last day of month
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  return { start, end };
}

function getPreviousMonth(yearMonth: string): string {
  const [year, month] = yearMonth.split('-').map(Number);
  if (month === 1) {
    return `${year - 1}-12`;
  }
  return `${year}-${String(month - 1).padStart(2, '0')}`;
}

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

async function backfillService(
  service: Service,
  startMonth: string
): Promise<{ totalRecords: number; monthsProcessed: number; oldestMonth: string }> {
  let currentMonth = startMonth;
  let totalRecords = 0;
  let monthsProcessed = 0;
  let consecutiveEmptyMonths = 0;
  const maxEmptyMonths = 3; // Stop after 3 consecutive months with no data
  let oldestMonth = currentMonth;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Backfilling ${service.toUpperCase()}`);
  console.log(`Starting from: ${currentMonth}`);
  console.log('='.repeat(60));

  while (consecutiveEmptyMonths < maxEmptyMonths) {
    const { start, end } = getMonthRange(currentMonth);

    process.stdout.write(`  ${currentMonth}: `);

    try {
      const result = service === 'anthropic'
        ? await syncAnthropicUsage(start, end)
        : await syncCursorUsage(start, end);

      if (!result.success) {
        console.log(`ERROR - ${result.errors[0] || 'Unknown error'}`);
        // Don't count config errors as empty months
        if (result.errors[0]?.includes('not configured')) {
          console.log(`  Skipping ${service} - not configured`);
          return { totalRecords: 0, monthsProcessed: 0, oldestMonth: currentMonth };
        }
        consecutiveEmptyMonths++;
      } else if (result.recordsImported === 0) {
        console.log(`0 records (skipped: ${result.recordsSkipped})`);
        consecutiveEmptyMonths++;
      } else {
        console.log(`${result.recordsImported} records imported`);
        totalRecords += result.recordsImported;
        consecutiveEmptyMonths = 0; // Reset counter on successful import
        oldestMonth = currentMonth;
      }

      monthsProcessed++;
    } catch (err) {
      console.log(`EXCEPTION - ${err instanceof Error ? err.message : 'Unknown'}`);
      consecutiveEmptyMonths++;
    }

    // Move to previous month
    currentMonth = getPreviousMonth(currentMonth);

    // Safety: don't go back further than 2020
    if (currentMonth < '2020-01') {
      console.log(`  Reached 2020, stopping.`);
      break;
    }

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  if (consecutiveEmptyMonths >= maxEmptyMonths) {
    console.log(`  Stopped after ${maxEmptyMonths} consecutive months with no data.`);
  }

  return { totalRecords, monthsProcessed, oldestMonth };
}

async function main() {
  const options = parseArgs();

  console.log('='.repeat(60));
  console.log('Abacus - Full Historical Backfill');
  console.log('='.repeat(60));
  console.log(`Services: ${options.services.join(', ')}`);
  console.log(`Start month: ${options.startMonth || getCurrentMonth()} (current)`);
  console.log('');

  // Check configuration
  console.log('Configuration:');
  console.log(`  POSTGRES_URL: ${process.env.POSTGRES_URL ? '✓' : '✗'}`);
  console.log(`  ANTHROPIC_ADMIN_KEY: ${process.env.ANTHROPIC_ADMIN_KEY ? '✓' : '✗'}`);
  console.log(`  CURSOR_TEAM_SLUG: ${process.env.CURSOR_TEAM_SLUG ? '✓' : '✗'}`);
  console.log(`  CURSOR_ADMIN_KEY: ${process.env.CURSOR_ADMIN_KEY ? '✓' : '✗'}`);

  if (!process.env.POSTGRES_URL) {
    console.error('\nError: POSTGRES_URL is required');
    process.exit(1);
  }

  const startMonth = options.startMonth || getCurrentMonth();
  const results: Record<Service, { totalRecords: number; monthsProcessed: number; oldestMonth: string }> = {
    anthropic: { totalRecords: 0, monthsProcessed: 0, oldestMonth: '' },
    cursor: { totalRecords: 0, monthsProcessed: 0, oldestMonth: '' }
  };

  // Process each service serially
  for (const service of options.services) {
    results[service] = await backfillService(service, startMonth);
  }

  // Sync API key mappings if we processed Anthropic
  if (options.services.includes('anthropic') && process.env.ANTHROPIC_ADMIN_KEY) {
    console.log(`\n${'='.repeat(60)}`);
    console.log('Syncing Anthropic API key mappings...');
    try {
      const mappingsResult = await syncAnthropicApiKeyMappings();
      console.log(`  Mappings synced: ${mappingsResult.mappingsCreated} created, ${mappingsResult.mappingsSkipped} skipped`);
    } catch (err) {
      console.log(`  Error syncing mappings: ${err instanceof Error ? err.message : 'Unknown'}`);
    }
  }

  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('SUMMARY');
  console.log('='.repeat(60));

  let grandTotal = 0;
  for (const service of options.services) {
    const r = results[service];
    console.log(`\n${service.toUpperCase()}:`);
    console.log(`  Total records: ${r.totalRecords.toLocaleString()}`);
    console.log(`  Months processed: ${r.monthsProcessed}`);
    if (r.oldestMonth) {
      console.log(`  Oldest data: ${r.oldestMonth}`);
    }
    grandTotal += r.totalRecords;
  }

  console.log(`\nGrand total: ${grandTotal.toLocaleString()} records`);
  console.log('');

  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
