#!/usr/bin/env npx tsx
/**
 * AI Usage Tracker CLI
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
 *   debug:anthropic   - Debug Anthropic API response
 *   debug:cursor      - Debug Cursor API response
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
import { getApiKeyMappings, setApiKeyMapping, getUnmappedApiKeys, getKnownEmails } from '../src/lib/queries';

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
AI Usage Tracker CLI

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
  debug:anthropic       Debug Anthropic API response
  debug:cursor          Debug Cursor API response
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

async function cmdDebugAnthropic() {
  console.log('🔍 Debugging Anthropic API\n');

  const adminKey = process.env.ANTHROPIC_ADMIN_KEY;
  if (!adminKey) {
    console.error('Error: ANTHROPIC_ADMIN_KEY not set');
    return;
  }

  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  console.log(`Fetching usage from ${startDate} to ${endDate}\n`);

  const params = new URLSearchParams({
    starting_at: startDate,
    ending_at: endDate,
    bucket_width: '1d',
    'group_by[]': 'api_key_id',
  });
  params.append('group_by[]', 'model');

  const response = await fetch(
    `https://api.anthropic.com/v1/organizations/usage_report/messages?${params}`,
    {
      headers: {
        'X-Api-Key': adminKey,
        'anthropic-version': '2023-06-01'
      }
    }
  );

  if (!response.ok) {
    console.log('Error:', response.status, await response.text());
    return;
  }

  const data = await response.json();
  console.log('has_more:', data.has_more);
  console.log('Buckets:', data.data?.length);

  let totalResults = 0;
  for (const bucket of data.data || []) {
    totalResults += bucket.results?.length || 0;
    if (bucket.results?.length > 0) {
      console.log(`\n${bucket.starting_at.split('T')[0]}: ${bucket.results.length} records`);
      for (const r of bucket.results.slice(0, 3)) {
        console.log(`  ${r.api_key_id || 'no-key'} | ${r.model} | out:${r.output_tokens}`);
      }
      if (bucket.results.length > 3) {
        console.log(`  ... and ${bucket.results.length - 3} more`);
      }
    }
  }
  console.log(`\nTotal results: ${totalResults}`);
}

async function cmdDebugCursor() {
  console.log('🔍 Debugging Cursor API\n');

  const adminKey = process.env.CURSOR_ADMIN_KEY;

  if (!adminKey) {
    console.error('Error: CURSOR_ADMIN_KEY not set');
    return;
  }

  // Use epoch milliseconds
  const endMs = Date.now();
  const startMs = endMs - 30 * 24 * 60 * 60 * 1000;

  console.log(`Fetching usage from ${new Date(startMs).toISOString().split('T')[0]} to ${new Date(endMs).toISOString().split('T')[0]}\n`);

  // Cursor API uses Basic auth with API key as username, empty password
  const credentials = `${adminKey}:`;
  const authHeader = `Basic ${Buffer.from(credentials).toString('base64')}`;

  const response = await fetch(
    'https://api.cursor.com/teams/filtered-usage-events',
    {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        startDate: startMs,
        endDate: endMs,
        page: 1,
        pageSize: 10
      })
    }
  );

  if (!response.ok) {
    console.log('Error:', response.status);
    const text = await response.text();
    console.log(text.slice(0, 500));
    return;
  }

  const data = await response.json();
  console.log('Response keys:', Object.keys(data));
  console.log('Total events:', data.totalUsageEventsCount || 0);
  console.log('usageEvents:', data.usageEvents?.length || 0);
  console.log('Pagination:', JSON.stringify(data.pagination || {}));

  if (data.usageEvents?.length > 0) {
    console.log('\nSample event:', JSON.stringify(data.usageEvents[0], null, 2));

    const byEmail = new Map<string, number>();
    for (const e of data.usageEvents) {
      byEmail.set(e.userEmail, (byEmail.get(e.userEmail) || 0) + 1);
    }
    console.log('\nBy email:');
    for (const [email, count] of Array.from(byEmail.entries()).slice(0, 10)) {
      console.log(`  ${email}: ${count} events`);
    }
  }
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
      case 'debug:anthropic':
        await cmdDebugAnthropic();
        break;
      case 'debug:cursor':
        await cmdDebugCursor();
        break;
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
