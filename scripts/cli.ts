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
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0,
  enableLogs: true,
});

import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import { sql } from '@vercel/postgres';
import { syncAnthropicUsage, getAnthropicSyncState, backfillAnthropicUsage, resetAnthropicBackfillComplete } from '../src/lib/sync/anthropic';
import { syncCursorUsage, backfillCursorUsage, getCursorSyncState, getPreviousCompleteHourEnd, resetCursorBackfillComplete } from '../src/lib/sync/cursor';
import { syncGitHubRepo, backfillGitHubUsage, getGitHubSyncState, getGitHubBackfillState, resetGitHubBackfillComplete } from '../src/lib/sync/github';
import { syncApiKeyMappingsSmart, syncAnthropicApiKeyMappings } from '../src/lib/sync/anthropic-mappings';
import { getToolIdentityMappings, setToolIdentityMapping, getUnmappedToolRecords, getKnownEmails, insertUsageRecord } from '../src/lib/queries';
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

    // Split by semicolons, strip comment lines, filter empty statements
    const statements = content
      .split(';')
      .map(s => s
        .split('\n')
        .filter(line => !line.trim().startsWith('--'))
        .join('\n')
        .trim()
      )
      .filter(s => s.length > 0);

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
  backfill:complete <tool>
                        Mark backfill as complete for a tool (anthropic|cursor)
  backfill:reset <tool> Reset backfill status for a tool (allows re-backfilling)
  gaps [tool]           Check for gaps in usage data (tool: anthropic|cursor, default: both)
  mappings              List API key mappings
  mappings:sync [--full] Sync API key mappings from Anthropic (--full for all keys)
  mappings:fix          Interactive fix for unmapped API keys
  anthropic:status      Show Anthropic sync state
  cursor:status         Show Cursor sync state
  github:status         Show GitHub commits sync state
  github:sync <repo> [--days N]
                        Sync commits for a specific repo (e.g., getsentry/sentry)
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

  const mappingsCount = await sql`SELECT COUNT(*) as count FROM tool_identity_mappings`;
  console.log(`\nTool identity mappings: ${mappingsCount.rows[0].count}`);
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

async function cmdGitHubStatus() {
  console.log('🔄 GitHub Commits Sync Status\n');

  const { lastSyncedDate } = await getGitHubSyncState();
  const { oldestDate, isComplete } = await getGitHubBackfillState();

  console.log(`Last synced date: ${lastSyncedDate || 'Never'}`);
  console.log(`Oldest commit date: ${oldestDate || 'None'}`);
  console.log(`Backfill complete: ${isComplete}`);

  // Get stats from database
  const stats = await sql`
    SELECT
      COUNT(*)::int as total_commits,
      COUNT(*) FILTER (WHERE ai_tool IS NOT NULL)::int as ai_commits,
      COUNT(DISTINCT repo_id)::int as repos
    FROM commits
  `;

  const row = stats.rows[0];
  console.log(`\nDatabase stats:`);
  console.log(`  Total commits: ${row.total_commits}`);
  console.log(`  AI-attributed: ${row.ai_commits}`);
  if (row.total_commits > 0) {
    const pct = ((row.ai_commits / row.total_commits) * 100).toFixed(1);
    console.log(`  AI percentage: ${pct}%`);
  }
  console.log(`  Repositories: ${row.repos}`);
}

async function cmdGitHubSync(repo: string, days: number = 7) {
  if (!repo) {
    console.error('Error: Please specify a repo (e.g., getsentry/sentry)');
    console.error('Usage: npm run cli github:sync <repo> [--days N]');
    return;
  }

  if (!process.env.GITHUB_TOKEN) {
    console.error('❌ GITHUB_TOKEN not configured');
    return;
  }

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  console.log(`🔄 Syncing ${repo} from ${since}...\n`);

  const result = await syncGitHubRepo(repo, since, undefined, {
    onProgress: (msg) => console.log(msg)
  });

  console.log(`\n✓ Sync complete`);
  console.log(`  Commits processed: ${result.commitsProcessed}`);
  console.log(`  AI-attributed: ${result.aiAttributedCommits}`);
  if (result.errors.length > 0) {
    console.log(`  Errors: ${result.errors.slice(0, 5).join(', ')}`);
  }
}

async function cmdGitHubBackfill(fromDate: string) {
  if (!process.env.GITHUB_TOKEN) {
    console.error('❌ GITHUB_TOKEN not configured');
    return;
  }

  console.log(`📥 Backfilling GitHub commits from ${fromDate}\n`);

  const result = await backfillGitHubUsage(fromDate, {
    onProgress: (msg) => console.log(msg)
  });

  console.log(`\n✓ Backfill complete`);
  console.log(`  Commits processed: ${result.commitsProcessed}`);
  console.log(`  AI-attributed: ${result.aiAttributedCommits}`);
  if (result.rateLimited) {
    console.log(`  ⚠️  Rate limited - will continue on next run`);
  }
  if (result.errors.length > 0) {
    console.log(`  Errors: ${result.errors.slice(0, 5).join(', ')}`);
  }
}

async function cmdMappings() {
  console.log('🔑 Tool Identity Mappings\n');
  const mappings = await getToolIdentityMappings();
  if (mappings.length === 0) {
    console.log('No mappings found. Run `mappings:sync` to sync from Anthropic.');
    return;
  }
  for (const m of mappings) {
    console.log(`  [${m.tool}] ${m.external_id} → ${m.email}`);
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
  console.log('🔧 Fix Unmapped Tool Records\n');

  // Currently only claude_code uses tool_record_id for identity mapping
  const tool = 'claude_code';
  const unmapped = await getUnmappedToolRecords(tool);
  if (unmapped.length === 0) {
    console.log('No unmapped tool records found!');
    return;
  }

  const knownEmails = await getKnownEmails();
  console.log(`Found ${unmapped.length} unmapped ${tool} records.\n`);
  console.log('Known emails:', knownEmails.join(', '), '\n');

  for (const item of unmapped) {
    console.log(`\nTool Record ID: ${item.tool_record_id}`);
    console.log(`Used in: ${item.usage_count} records`);

    const email = await prompt('Enter email (or skip/quit): ');

    if (email.toLowerCase() === 'quit' || email.toLowerCase() === 'q') {
      break;
    }

    if (email.toLowerCase() === 'skip' || email.toLowerCase() === 's' || !email) {
      console.log('Skipped.');
      continue;
    }

    await setToolIdentityMapping(tool, item.tool_record_id, email);
    console.log(`✓ Mapped [${tool}] ${item.tool_record_id} → ${email}`);
  }

  console.log('\nDone!');
}

async function cmdSync(days: number = 7, tools: ('anthropic' | 'cursor')[] = ['anthropic', 'cursor'], skipMappings: boolean = false) {
  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // Filter to only configured providers
  const configuredTools = tools.filter(tool => {
    if (tool === 'anthropic' && !process.env.ANTHROPIC_ADMIN_KEY) {
      console.log('⚠️  Skipping Anthropic: ANTHROPIC_ADMIN_KEY not configured');
      return false;
    }
    if (tool === 'cursor' && !process.env.CURSOR_ADMIN_KEY) {
      console.log('⚠️  Skipping Cursor: CURSOR_ADMIN_KEY not configured');
      return false;
    }
    return true;
  });

  if (configuredTools.length === 0) {
    console.log('\n❌ No providers configured. Set ANTHROPIC_ADMIN_KEY and/or CURSOR_ADMIN_KEY.');
    return;
  }

  console.log(`\n🔄 Syncing usage data from ${startDate} to ${endDate}\n`);

  // Sync API key mappings FIRST so usage sync has them available
  if (configuredTools.includes('anthropic') && !skipMappings) {
    console.log('Syncing API key mappings...');
    const mappingsResult = await syncApiKeyMappingsSmart();
    console.log(`  Created: ${mappingsResult.mappingsCreated}, Skipped: ${mappingsResult.mappingsSkipped}`);
    if (mappingsResult.errors.length > 0) {
      console.log(`  Errors: ${mappingsResult.errors.slice(0, 3).join(', ')}`);
    }
    console.log('');
  }

  if (configuredTools.includes('anthropic')) {
    console.log('Syncing Anthropic usage...');
    const anthropicResult = await syncAnthropicUsage(startDate, endDate);
    console.log(`  Imported: ${anthropicResult.recordsImported}, Skipped: ${anthropicResult.recordsSkipped}`);
    if (anthropicResult.errors.length > 0) {
      console.log(`  Errors: ${anthropicResult.errors.slice(0, 3).join(', ')}`);
    }
  }

  if (configuredTools.includes('cursor')) {
    if (configuredTools.includes('anthropic')) console.log('');
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
  // Check if provider is configured
  if (tool === 'anthropic' && !process.env.ANTHROPIC_ADMIN_KEY) {
    console.error('❌ ANTHROPIC_ADMIN_KEY not configured');
    return;
  }
  if (tool === 'cursor' && !process.env.CURSOR_ADMIN_KEY) {
    console.error('❌ CURSOR_ADMIN_KEY not configured');
    return;
  }

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
        console.error(`\nError inserting ${key}:`, err);
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
      case 'github:status':
        await cmdGitHubStatus();
        break;
      case 'github:sync': {
        const repo = args[1];
        const daysIdx = args.indexOf('--days');
        const days = daysIdx >= 0 ? parseInt(args[daysIdx + 1]) : 7;
        await cmdGitHubSync(repo, days);
        break;
      }
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
        const tool = args[1] as 'anthropic' | 'cursor' | 'github';
        if (!tool || !['anthropic', 'cursor', 'github'].includes(tool)) {
          console.error('Error: Please specify tool (anthropic, cursor, or github)');
          console.error('Usage: npm run cli backfill <tool> --from YYYY-MM-DD [--to YYYY-MM-DD]');
          break;
        }
        const fromIdx = args.indexOf('--from');
        if (fromIdx < 0) {
          console.error('Error: Please specify --from date');
          console.error('Usage: npm run cli backfill <tool> --from YYYY-MM-DD [--to YYYY-MM-DD]');
          break;
        }
        const fromDate = args[fromIdx + 1];
        if (!fromDate) {
          console.error('Error: Missing --from date value');
          break;
        }
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(fromDate)) {
          console.error('Error: --from date must be in YYYY-MM-DD format');
          break;
        }
        // GitHub backfill only needs --from, others need --to as well
        if (tool === 'github') {
          await cmdGitHubBackfill(fromDate);
        } else {
          const toIdx = args.indexOf('--to');
          if (toIdx < 0) {
            console.error('Error: Please specify --to date for anthropic/cursor backfill');
            console.error('Usage: npm run cli backfill <tool> --from YYYY-MM-DD --to YYYY-MM-DD');
            break;
          }
          const toDate = args[toIdx + 1];
          if (!toDate || !dateRegex.test(toDate)) {
            console.error('Error: --to date must be in YYYY-MM-DD format');
            break;
          }
          await cmdBackfill(tool, fromDate, toDate);
        }
        break;
      }
      case 'backfill:complete': {
        const tool = args[1] as 'anthropic' | 'cursor' | 'github';
        if (!tool || !['anthropic', 'cursor', 'github'].includes(tool)) {
          console.error('Error: Please specify tool (anthropic, cursor, or github)');
          console.error('Usage: npm run cli backfill:complete <tool>');
          break;
        }
        console.log(`Marking ${tool} backfill as complete...`);
        await sql`
          INSERT INTO sync_state (id, last_sync_at, backfill_complete)
          VALUES (${tool}, NOW(), true)
          ON CONFLICT (id) DO UPDATE SET
            last_sync_at = NOW(),
            backfill_complete = true
        `;
        console.log(`✓ ${tool} backfill marked as complete`);
        break;
      }
      case 'backfill:reset': {
        const tool = args[1] as 'anthropic' | 'cursor' | 'github';
        if (!tool || !['anthropic', 'cursor', 'github'].includes(tool)) {
          console.error('Error: Please specify tool (anthropic, cursor, or github)');
          console.error('Usage: npm run cli backfill:reset <tool>');
          break;
        }
        console.log(`Resetting ${tool} backfill status...`);
        if (tool === 'anthropic') {
          await resetAnthropicBackfillComplete();
        } else if (tool === 'cursor') {
          await resetCursorBackfillComplete();
        } else {
          await resetGitHubBackfillComplete();
        }
        console.log(`✓ ${tool} backfill status reset (can now re-backfill)`);
        break;
      }
      case 'gaps': {
        const toolArg = args[1];
        const toolsToCheck: string[] = toolArg && ['anthropic', 'cursor', 'claude_code'].includes(toolArg)
          ? [toolArg === 'anthropic' ? 'claude_code' : toolArg]
          : ['claude_code', 'cursor'];

        for (const tool of toolsToCheck) {
          const displayName = tool === 'claude_code' ? 'Claude Code (anthropic)' : 'Cursor';
          console.log(`\n📊 ${displayName} Data Gap Analysis\n`);

          const result = await sql`
            SELECT DISTINCT date::text as date
            FROM usage_records
            WHERE tool = ${tool}
            ORDER BY date ASC
          `;

          const dates = result.rows.map((r) => r.date as string);

          if (dates.length === 0) {
            console.log('No data found.');
            continue;
          }

          console.log(`First date: ${dates[0]}`);
          console.log(`Last date: ${dates[dates.length - 1]}`);
          console.log(`Days with data: ${dates.length}`);

          // Find gaps
          const gaps: { after: string; before: string; missingDays: number }[] = [];
          for (let i = 1; i < dates.length; i++) {
            const prev = new Date(dates[i - 1]);
            const curr = new Date(dates[i]);
            const diffDays = Math.round((curr.getTime() - prev.getTime()) / (24 * 60 * 60 * 1000));
            if (diffDays > 1) {
              gaps.push({
                after: dates[i - 1],
                before: dates[i],
                missingDays: diffDays - 1
              });
            }
          }

          if (gaps.length === 0) {
            console.log('\n✓ No gaps found! Data is continuous.');
          } else {
            console.log(`\n⚠️  Found ${gaps.length} gap(s):`);
            for (const gap of gaps) {
              console.log(`  ${gap.after} → ${gap.before} (${gap.missingDays} days missing)`);
            }
          }

          // Summary
          const firstDate = new Date(dates[0]);
          const lastDate = new Date(dates[dates.length - 1]);
          const expectedDays = Math.round((lastDate.getTime() - firstDate.getTime()) / (24 * 60 * 60 * 1000)) + 1;
          const totalMissing = expectedDays - dates.length;
          if (totalMissing > 0) {
            console.log(`\nTotal missing days: ${totalMissing} out of ${expectedDays} expected`);
          }
        }
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
