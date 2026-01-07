#!/usr/bin/env npx tsx
/**
 * Abacus CLI
 *
 * Usage:
 *   npx tsx scripts/cli.ts <command> [options]
 *
 * Commands:
 *   sync              - Sync recent usage data
 *   backfill          - Backfill historical data
 *   mappings          - List API key mappings
 *   mappings:sync     - Sync API key mappings from Anthropic
 *   mappings:fix      - Interactive fix for unmapped API keys
 *   anthropic:status  - Show Anthropic sync state
 *   cursor:status     - Show Cursor sync state
 *   import:cursor-csv - Import Cursor usage from CSV export
 *   stats             - Show database statistics
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: "https://1180c3a5b9edc0e8cf46287bc96615bb@o1.ingest.us.sentry.io/4510665763848192",
  tracesSampleRate: 0,
  enableLogs: true,
});

import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import { sql } from '@vercel/postgres';
import { syncAnthropicUsage, getAnthropicSyncState, backfillAnthropicUsage } from '../src/lib/sync/anthropic';
import { syncCursorUsage, backfillCursorUsage, getCursorSyncState, getPreviousCompleteHourEnd } from '../src/lib/sync/cursor';
import { syncApiKeyMappingsSmart, syncAnthropicApiKeyMappings } from '../src/lib/sync/anthropic-mappings';
import { getApiKeyMappings, setApiKeyMapping, getUnmappedApiKeys, getKnownEmails, insertUsageRecord } from '../src/lib/queries';
import { normalizeModelName } from '../src/lib/utils';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function prompt(question: string): Promise<string> {
  return new Promise(resolve => {
    rl.question(question, resolve);
  });
}

async function cmdDbMigrate() {
  console.log('🗃️  Running database migrations\n');

  if (!process.env.POSTGRES_URL) {
    console.log('⚠️  POSTGRES_URL not set, skipping migrations');
    return;
  }

  const migrationsDir = path.join(process.cwd(), 'drizzle');

  // Get all .sql files sorted by name
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    console.log('No migration files found in ./drizzle/');
    return;
  }

  console.log(`Found ${files.length} migration file(s)\n`);

  // Create migrations tracking table if it doesn't exist
  await sql`
    CREATE TABLE IF NOT EXISTS "_migrations" (
      "id" SERIAL PRIMARY KEY,
      "name" TEXT NOT NULL UNIQUE,
      "applied_at" TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `;

  // Get already applied migrations
  const applied = await sql`SELECT name FROM "_migrations"`;
  const appliedSet = new Set(applied.rows.map(r => r.name));

  let migrationsRun = 0;

  for (const file of files) {
    if (appliedSet.has(file)) {
      console.log(`✓ ${file} (already applied)`);
      continue;
    }

    console.log(`→ ${file}`);

    const filePath = path.join(migrationsDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');

    // Split by semicolons, filter empty statements
    const statements = content
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    for (const stmt of statements) {
      try {
        await sql.query(stmt);
      } catch (err) {
        console.error(`  Error executing statement: ${err}`);
        console.error(`  Statement: ${stmt.slice(0, 100)}...`);
        throw err;
      }
    }

    // Record migration as applied
    await sql`INSERT INTO "_migrations" (name) VALUES (${file})`;
    console.log(`  ✓ Applied`);
    migrationsRun++;
  }

  console.log(`\n✓ Done! ${migrationsRun} migration(s) applied.`);
}

function printHelp() {
  console.log(`
Abacus CLI

Usage:
  npx tsx scripts/cli.ts <command> [options]

Commands:
  db:migrate            Run pending database migrations
  sync [tool] [--days N] [--skip-mappings]
                        Sync recent usage data (tool: anthropic|cursor, default: both)
  backfill <tool> --from YYYY-MM-DD --to YYYY-MM-DD
                        Backfill historical data for a specific tool
  mappings              List API key mappings
  mappings:sync [--full] Sync API key mappings from Anthropic (--full for all keys)
  mappings:fix          Interactive fix for unmapped API keys
  anthropic:status      Show Anthropic sync state
  cursor:status         Show Cursor sync state
  import:cursor-csv <file>
                        Import Cursor usage from CSV export
  stats                 Show database statistics
  help                  Show this help message

Examples:
  npm run cli sync --days 30
  npm run cli sync cursor --days 7
  npm run cli backfill cursor --from 2024-01-01 --to 2025-01-01
  npm run cli mappings:fix
  npm run cli cursor:status
`);
}

async function cmdStats() {
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

  const mappingsCount = await sql`SELECT COUNT(*) as count FROM api_key_mappings`;
  console.log(`\nAPI key mappings: ${mappingsCount.rows[0].count}`);
}

async function cmdAnthropicStatus() {
  console.log('🔄 Anthropic Sync Status\n');

  const { lastSyncedDate } = await getAnthropicSyncState();

  // Yesterday is the most recent complete day we should have
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  if (lastSyncedDate) {
    console.log(`Last synced date: ${lastSyncedDate}`);
    console.log(`Current complete day: ${yesterdayStr}`);

    if (lastSyncedDate >= yesterdayStr) {
      console.log('\n✓ Up to date');
    } else {
      const lastDate = new Date(lastSyncedDate);
      const daysBehind = Math.floor((yesterday.getTime() - lastDate.getTime()) / (24 * 60 * 60 * 1000));
      console.log(`\n⚠️  ${daysBehind} day(s) behind`);
    }
  } else {
    console.log('Never synced');
    console.log(`Current complete day: ${yesterdayStr}`);
    console.log('\nRun backfill to initialize: npm run cli backfill anthropic --from YYYY-MM-DD --to YYYY-MM-DD');
  }
}

async function cmdCursorStatus() {
  console.log('🔄 Cursor Sync Status\n');

  const { lastSyncedHourEnd } = await getCursorSyncState();
  const currentHourEnd = getPreviousCompleteHourEnd();

  if (lastSyncedHourEnd) {
    const lastSyncDate = new Date(lastSyncedHourEnd);
    console.log(`Last synced hour end: ${lastSyncDate.toISOString()}`);
    console.log(`Current complete hour: ${currentHourEnd.toISOString()}`);

    const hoursBehind = Math.floor((currentHourEnd.getTime() - lastSyncedHourEnd) / (60 * 60 * 1000));
    if (hoursBehind > 0) {
      console.log(`\n⚠️  ${hoursBehind} hour(s) behind`);
    } else {
      console.log('\n✓ Up to date');
    }
  } else {
    console.log('Never synced');
    console.log(`Current complete hour: ${currentHourEnd.toISOString()}`);
    console.log('\nRun backfill to initialize: npm run cli backfill cursor --from YYYY-MM-DD --to YYYY-MM-DD');
  }
}

async function cmdMappings() {
  console.log('🔑 API Key Mappings\n');
  const mappings = await getApiKeyMappings();
  if (mappings.length === 0) {
    console.log('No mappings found. Run `mappings:sync` to sync from Anthropic.');
    return;
  }
  for (const m of mappings) {
    console.log(`  ${m.api_key} → ${m.email}`);
  }
}

async function cmdMappingsSync(full: boolean = false) {
  console.log(`🔄 Syncing API key mappings from Anthropic${full ? ' (full)' : ' (smart)'}...\n`);
  const result = full
    ? await syncAnthropicApiKeyMappings()
    : await syncApiKeyMappingsSmart();
  console.log(`Created: ${result.mappingsCreated}`);
  console.log(`Skipped: ${result.mappingsSkipped}`);
  if (result.errors.length > 0) {
    console.log(`Errors: ${result.errors.slice(0, 5).join(', ')}`);
  }
}

async function cmdMappingsFix() {
  console.log('🔧 Fix Unmapped API Keys\n');

  const unmapped = await getUnmappedApiKeys();
  if (unmapped.length === 0) {
    console.log('No unmapped API keys found!');
    return;
  }

  const knownEmails = await getKnownEmails();
  console.log(`Found ${unmapped.length} unmapped API keys.\n`);
  console.log('Known emails:', knownEmails.join(', '), '\n');

  for (const item of unmapped) {
    console.log(`\nAPI Key: ${item.api_key}`);
    console.log(`Used in: ${item.usage_count} records`);

    const email = await prompt('Enter email (or skip/quit): ');

    if (email.toLowerCase() === 'quit' || email.toLowerCase() === 'q') {
      break;
    }

    if (email.toLowerCase() === 'skip' || email.toLowerCase() === 's' || !email) {
      console.log('Skipped.');
      continue;
    }

    await setApiKeyMapping(item.api_key, email);
    console.log(`✓ Mapped ${item.api_key} → ${email}`);
  }

  console.log('\nDone!');
}

async function cmdSync(days: number = 7, tools: ('anthropic' | 'cursor')[] = ['anthropic', 'cursor'], skipMappings: boolean = false) {
  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  console.log(`🔄 Syncing usage data from ${startDate} to ${endDate}\n`);

  // Sync API key mappings FIRST so usage sync has them available
  if (tools.includes('anthropic') && !skipMappings) {
    console.log('Syncing API key mappings...');
    const mappingsResult = await syncApiKeyMappingsSmart();
    console.log(`  Created: ${mappingsResult.mappingsCreated}, Skipped: ${mappingsResult.mappingsSkipped}`);
    if (mappingsResult.errors.length > 0) {
      console.log(`  Errors: ${mappingsResult.errors.slice(0, 3).join(', ')}`);
    }
    console.log('');
  }

  if (tools.includes('anthropic')) {
    console.log('Syncing Anthropic usage...');
    const anthropicResult = await syncAnthropicUsage(startDate, endDate);
    console.log(`  Imported: ${anthropicResult.recordsImported}, Skipped: ${anthropicResult.recordsSkipped}`);
    if (anthropicResult.errors.length > 0) {
      console.log(`  Errors: ${anthropicResult.errors.slice(0, 3).join(', ')}`);
    }
  }

  if (tools.includes('cursor')) {
    if (tools.includes('anthropic')) console.log('');
    console.log('Syncing Cursor usage...');
    const cursorResult = await syncCursorUsage(startDate, endDate);
    console.log(`  Imported: ${cursorResult.recordsImported}, Skipped: ${cursorResult.recordsSkipped}`);
    if (cursorResult.errors.length > 0) {
      console.log(`  Errors: ${cursorResult.errors.slice(0, 3).join(', ')}`);
    }
  }

  console.log('\n✓ Sync complete!');
}

async function cmdBackfill(tool: 'anthropic' | 'cursor', fromDate: string, toDate: string) {
  console.log(`📥 Backfilling ${tool} from ${fromDate} to ${toDate}\n`);

  if (tool === 'anthropic') {
    // Sync API key mappings first
    console.log('Syncing API key mappings first...');
    const mappingsResult = await syncApiKeyMappingsSmart();
    console.log(`  Created: ${mappingsResult.mappingsCreated}, Skipped: ${mappingsResult.mappingsSkipped}\n`);

    // Use backfillAnthropicUsage which updates sync state
    // Note: backfill works backwards from existing data toward targetDate (fromDate)
    const result = await backfillAnthropicUsage(fromDate, {
      onProgress: (msg: string) => console.log(msg)
    });
    console.log(`\n✓ Backfill complete`);
    console.log(`  Imported: ${result.recordsImported}, Skipped: ${result.recordsSkipped}`);
    if (result.errors.length > 0) {
      console.log(`  Errors: ${result.errors.slice(0, 5).join(', ')}`);
    }
  } else if (tool === 'cursor') {
    // For Cursor, use the proper backfill function with progress
    // Note: backfill works backwards from existing data toward targetDate (fromDate)
    const result = await backfillCursorUsage(fromDate, {
      onProgress: (msg: string) => console.log(msg)
    });
    console.log(`\n✓ Backfill complete`);
    console.log(`  Imported: ${result.recordsImported}, Skipped: ${result.recordsSkipped}`);
    if (result.errors.length > 0) {
      console.log(`  Errors: ${result.errors.slice(0, 5).join(', ')}`);
    }
  }
}

interface CsvRow {
  Date: string;
  User: string;
  Kind: string;
  Model: string;
  'Max Mode': string;
  'Input (w/ Cache Write)': string;
  'Input (w/o Cache Write)': string;
  'Cache Read': string;
  'Output Tokens': string;
  'Total Tokens': string;
  Cost: string;
}

async function cmdImportCursorCsv(filePath: string) {
  console.log(`📥 Importing Cursor CSV: ${filePath}\n`);

  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    return;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const headers = lines[0].split(',').map(h => h.replace(/"/g, ''));

  console.log(`Headers: ${headers.join(', ')}`);
  console.log(`Total rows: ${lines.length - 1}\n`);

  // Parse CSV into rows
  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Parse CSV with quoted fields
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current);

    if (values.length !== headers.length) continue;

    const row: Record<string, string> = {};
    headers.forEach((h, idx) => row[h] = values[idx]);
    rows.push(row as unknown as CsvRow);
  }

  console.log(`Parsed ${rows.length} rows\n`);

  // Aggregate by date/email/model (same as API import)
  interface AggregatedRecord {
    email: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    cacheWriteTokens: number;
    cacheReadTokens: number;
    cost: number;
  }

  const aggregated = new Map<string, AggregatedRecord>();
  let skippedRows = 0;

  for (const row of rows) {
    const timestamp = new Date(row.Date);
    const date = timestamp.toISOString().split('T')[0];
    const email = row.User;
    const model = normalizeModelName(row.Model);

    const inputTokens = parseInt(row['Input (w/o Cache Write)']) || 0;
    const cacheWriteTokens = parseInt(row['Input (w/ Cache Write)']) || 0;
    const cacheReadTokens = parseInt(row['Cache Read']) || 0;
    const outputTokens = parseInt(row['Output Tokens']) || 0;
    const cost = parseFloat(row.Cost) || 0;

    // Skip rows with no tokens
    const totalTokens = inputTokens + outputTokens + cacheWriteTokens + cacheReadTokens;
    if (totalTokens === 0) {
      skippedRows++;
      continue;
    }

    const key = [date, email, model].join('\0');
    const existing = aggregated.get(key);

    if (existing) {
      existing.inputTokens += inputTokens;
      existing.outputTokens += outputTokens;
      existing.cacheWriteTokens += cacheWriteTokens;
      existing.cacheReadTokens += cacheReadTokens;
      existing.cost += cost;
    } else {
      aggregated.set(key, {
        email,
        model,
        inputTokens,
        outputTokens,
        cacheWriteTokens,
        cacheReadTokens,
        cost
      });
    }
  }

  console.log(`Aggregated into ${aggregated.size} records (${skippedRows} empty rows skipped)\n`);

  // Insert records
  let imported = 0;
  let skipped = 0;
  let errors = 0;
  let lastDate = '';

  for (const [key, data] of aggregated) {
    const [date] = key.split('\0');

    if (date !== lastDate) {
      if (lastDate) {
        process.stdout.write('\n');
      }
      process.stdout.write(`  ${date}: `);
      lastDate = date;
    }

    try {
      await insertUsageRecord({
        date,
        email: data.email,
        tool: 'cursor',
        model: data.model,
        inputTokens: data.inputTokens,
        cacheWriteTokens: data.cacheWriteTokens,
        cacheReadTokens: data.cacheReadTokens,
        outputTokens: data.outputTokens,
        cost: data.cost
      });
      imported++;
      process.stdout.write('.');
    } catch (err) {
      if (err instanceof Error && err.message.includes('duplicate')) {
        skipped++;
        process.stdout.write('s');
      } else {
        errors++;
        process.stdout.write('E');
      }
    }
  }

  console.log(`\n\n✓ Import complete!`);
  console.log(`  Imported: ${imported}`);
  console.log(`  Skipped (duplicates): ${skipped}`);
  console.log(`  Errors: ${errors}`);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  try {
    switch (command) {
      case 'db:migrate':
        await cmdDbMigrate();
        break;
      case 'stats':
        await cmdStats();
        break;
      case 'anthropic:status':
        await cmdAnthropicStatus();
        break;
      case 'cursor:status':
        await cmdCursorStatus();
        break;
      case 'mappings':
        await cmdMappings();
        break;
      case 'mappings:sync':
        await cmdMappingsSync(args.includes('--full'));
        break;
      case 'mappings:fix':
        await cmdMappingsFix();
        break;
      case 'sync': {
        const daysIdx = args.indexOf('--days');
        const days = daysIdx >= 0 ? parseInt(args[daysIdx + 1]) : 7;
        const skipMappings = args.includes('--skip-mappings');
        // Parse tool filter: sync [anthropic|cursor] --days N
        const toolArg = args[1];
        let tools: ('anthropic' | 'cursor')[] = ['anthropic', 'cursor'];
        if (toolArg === 'anthropic') {
          tools = ['anthropic'];
        } else if (toolArg === 'cursor') {
          tools = ['cursor'];
        }
        await cmdSync(days, tools, skipMappings);
        break;
      }
      case 'backfill': {
        const tool = args[1] as 'anthropic' | 'cursor';
        if (!tool || !['anthropic', 'cursor'].includes(tool)) {
          console.error('Error: Please specify tool (anthropic or cursor)');
          console.error('Usage: npm run cli backfill <tool> --from YYYY-MM-DD --to YYYY-MM-DD');
          break;
        }
        const fromIdx = args.indexOf('--from');
        const toIdx = args.indexOf('--to');
        if (fromIdx < 0 || toIdx < 0) {
          console.error('Error: Please specify --from and --to dates');
          console.error('Usage: npm run cli backfill <tool> --from YYYY-MM-DD --to YYYY-MM-DD');
          break;
        }
        const fromDate = args[fromIdx + 1];
        const toDate = args[toIdx + 1];
        if (!fromDate || !toDate) {
          console.error('Error: Missing date values');
          break;
        }
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(fromDate) || !dateRegex.test(toDate)) {
          console.error('Error: Dates must be in YYYY-MM-DD format');
          break;
        }
        await cmdBackfill(tool, fromDate, toDate);
        break;
      }
      case 'import:cursor-csv': {
        const filePath = args[1];
        if (!filePath) {
          console.error('Error: Please specify a CSV file path');
          console.error('Usage: npm run cli import:cursor-csv <path-to-csv>');
          break;
        }
        await cmdImportCursorCsv(filePath);
        break;
      }
      case 'help':
      case '--help':
      case '-h':
        printHelp();
        break;
      default:
        if (command) {
          console.log(`Unknown command: ${command}\n`);
        }
        printHelp();
    }
  } finally {
    rl.close();
  }

  await Sentry.flush(2000);
  process.exit(0);
}

main().catch(async (err) => {
  console.error('Error:', err);
  await Sentry.flush(2000);
  process.exit(1);
});
