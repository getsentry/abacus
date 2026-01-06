#!/usr/bin/env npx tsx
/**
 * AI Usage Tracker CLI
 *
 * Usage:
 *   npx tsx scripts/cli.ts <command> [options]
 *
 * Commands:
 *   sync              - Sync recent usage data (last 7 days)
 *   backfill          - Backfill all historical data
 *   import <file>     - Import a CSV file (Claude Code or Cursor)
 *   import:dir <dir>  - Import all CSVs from a directory
 *   mappings          - List API key mappings
 *   mappings:sync     - Sync API key mappings from Anthropic
 *   mappings:fix      - Interactive fix for unmapped API keys
 *   debug:anthropic   - Debug Anthropic API response
 *   debug:cursor      - Debug Cursor API response
 *   stats             - Show database statistics
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import { sql } from '@vercel/postgres';
import { syncAnthropicUsage } from '../src/lib/sync/anthropic';
import { syncCursorUsage } from '../src/lib/sync/cursor';
import { syncAnthropicApiKeyMappings } from '../src/lib/sync/anthropic-mappings';
import { getApiKeyMappings, setApiKeyMapping, getUnmappedApiKeys, getKnownEmails } from '../src/lib/queries';
import { importClaudeCodeCsv, isClaudeCodeCsv } from '../src/lib/importers/claude-code';
import { importCursorCsv, isCursorCsv } from '../src/lib/importers/cursor';
import Papa from 'papaparse';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function prompt(question: string): Promise<string> {
  return new Promise(resolve => {
    rl.question(question, resolve);
  });
}

function printHelp() {
  console.log(`
AI Usage Tracker CLI

Usage:
  npx tsx scripts/cli.ts <command> [options]

Commands:
  sync [--days N]       Sync recent usage data (default: last 7 days)
  backfill [--service]  Backfill all historical data
  import <file>         Import a CSV file (auto-detects Claude Code or Cursor)
  import:dir <dir>      Import all CSVs from a directory
  mappings              List API key mappings
  mappings:sync         Sync API key mappings from Anthropic
  mappings:fix          Interactive fix for unmapped API keys
  debug:anthropic       Debug Anthropic API response
  debug:cursor          Debug Cursor API response
  stats                 Show database statistics
  help                  Show this help message

Examples:
  npm run cli -- import ./cache/claude-code-2025-01.csv
  npm run cli -- import:dir ./cache
  npm run cli -- sync --days 30
  npm run cli -- mappings:fix
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

async function cmdMappingsSync() {
  console.log('🔄 Syncing API key mappings from Anthropic...\n');
  const result = await syncAnthropicApiKeyMappings();
  console.log(`Created: ${result.mappingsCreated}`);
  console.log(`Skipped: ${result.mappingsSkipped}`);
  if (result.errors.length > 0) {
    console.log(`Errors: ${result.errors.join(', ')}`);
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

async function cmdSync(days: number = 7) {
  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  console.log(`🔄 Syncing usage data from ${startDate} to ${endDate}\n`);

  console.log('Syncing Anthropic...');
  const anthropicResult = await syncAnthropicUsage(startDate, endDate);
  console.log(`  Imported: ${anthropicResult.recordsImported}, Skipped: ${anthropicResult.recordsSkipped}`);
  if (anthropicResult.errors.length > 0) {
    console.log(`  Errors: ${anthropicResult.errors.slice(0, 3).join(', ')}`);
  }

  console.log('\nSyncing Cursor...');
  const cursorResult = await syncCursorUsage(startDate, endDate);
  console.log(`  Imported: ${cursorResult.recordsImported}, Skipped: ${cursorResult.recordsSkipped}`);
  if (cursorResult.errors.length > 0) {
    console.log(`  Errors: ${cursorResult.errors.slice(0, 3).join(', ')}`);
  }

  console.log('\n✓ Sync complete!');
}

async function cmdDebugAnthropic() {
  console.log('🔍 Debugging Anthropic API\n');

  const adminKey = process.env.ANTHROPIC_ADMIN_KEY;
  if (!adminKey) {
    console.log('Error: ANTHROPIC_ADMIN_KEY not set');
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

  const teamSlug = process.env.CURSOR_TEAM_SLUG;
  const adminKey = process.env.CURSOR_ADMIN_KEY;

  if (!teamSlug || !adminKey) {
    console.log('Error: CURSOR_TEAM_SLUG and CURSOR_ADMIN_KEY not set');
    return;
  }

  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  console.log(`Fetching usage from ${startDate} to ${endDate}\n`);

  const credentials = `${teamSlug}:${adminKey}`;
  const authHeader = `Basic ${Buffer.from(credentials).toString('base64')}`;

  const response = await fetch(
    'https://www.cursor.com/api/dashboard/teams/filtered-usage-events',
    {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ startDate, endDate })
    }
  );

  if (!response.ok) {
    console.log('Error:', response.status);
    const text = await response.text();
    console.log(text.slice(0, 500));
    return;
  }

  const data = await response.json();
  console.log('Events:', data.events?.length || 0);

  if (data.events?.length > 0) {
    const byUser = new Map<string, number>();
    for (const e of data.events) {
      byUser.set(e.user, (byUser.get(e.user) || 0) + 1);
    }
    console.log('\nBy user:');
    for (const [user, count] of Array.from(byUser.entries()).slice(0, 10)) {
      console.log(`  ${user}: ${count} events`);
    }
  }
}

async function cmdImport(filePath: string, dryRun: boolean = false) {
  console.log(`📥 Importing ${filePath}\n`);

  if (!fs.existsSync(filePath)) {
    console.log(`Error: File not found: ${filePath}`);
    return;
  }

  const content = fs.readFileSync(filePath, 'utf-8');

  // Parse first line to detect CSV type
  const firstLine = content.split('\n')[0];
  const headers = firstLine.split(',').map(h => h.trim().replace(/^"|"$/g, ''));

  let csvType: 'claude_code' | 'cursor' | 'unknown' = 'unknown';
  if (isClaudeCodeCsv(headers)) {
    csvType = 'claude_code';
  } else if (isCursorCsv(headers)) {
    csvType = 'cursor';
  }

  console.log(`Detected type: ${csvType}`);

  if (csvType === 'unknown') {
    console.log('Error: Could not detect CSV type. Headers:', headers.slice(0, 5).join(', '));
    return;
  }

  if (dryRun) {
    // Just parse and show stats
    const parsed = Papa.parse(content, { header: true, skipEmptyLines: true });
    console.log(`\nDry run - would import ${parsed.data.length} rows`);
    console.log('Sample row:', JSON.stringify(parsed.data[0], null, 2));
    return;
  }

  const result = csvType === 'claude_code'
    ? await importClaudeCodeCsv(content)
    : await importCursorCsv(content);

  console.log(`\n✓ Import complete`);
  console.log(`  Imported: ${result.recordsImported}`);
  console.log(`  Skipped: ${result.recordsSkipped}`);
  if (result.errors.length > 0) {
    console.log(`  Errors: ${result.errors.slice(0, 5).join(', ')}`);
  }
  if ('unmappedKeys' in result && result.unmappedKeys.length > 0) {
    console.log(`\n  Unmapped API keys: ${result.unmappedKeys.length}`);
    console.log(`  Run 'mappings:fix' to map them to emails`);
  }
}

async function cmdImportDir(dirPath: string, dryRun: boolean = false) {
  console.log(`📂 Importing all CSVs from ${dirPath}\n`);

  if (!fs.existsSync(dirPath)) {
    console.log(`Error: Directory not found: ${dirPath}`);
    return;
  }

  const files = fs.readdirSync(dirPath)
    .filter(f => f.endsWith('.csv'))
    .sort();

  if (files.length === 0) {
    console.log('No CSV files found');
    return;
  }

  console.log(`Found ${files.length} CSV files\n`);

  let totalImported = 0;
  let totalSkipped = 0;

  for (const file of files) {
    const filePath = path.join(dirPath, file);
    console.log(`\n--- ${file} ---`);

    const content = fs.readFileSync(filePath, 'utf-8');
    const firstLine = content.split('\n')[0];
    const headers = firstLine.split(',').map(h => h.trim().replace(/^"|"$/g, ''));

    let csvType: 'claude_code' | 'cursor' | 'unknown' = 'unknown';
    if (isClaudeCodeCsv(headers)) {
      csvType = 'claude_code';
    } else if (isCursorCsv(headers)) {
      csvType = 'cursor';
    }

    if (csvType === 'unknown') {
      console.log('  Skipping - unknown CSV type');
      continue;
    }

    console.log(`  Type: ${csvType}`);

    if (dryRun) {
      const parsed = Papa.parse(content, { header: true, skipEmptyLines: true });
      console.log(`  Would import: ${parsed.data.length} rows`);
      continue;
    }

    const result = csvType === 'claude_code'
      ? await importClaudeCodeCsv(content)
      : await importCursorCsv(content);

    console.log(`  Imported: ${result.recordsImported}, Skipped: ${result.recordsSkipped}`);
    totalImported += result.recordsImported;
    totalSkipped += result.recordsSkipped;
  }

  console.log(`\n✓ Batch import complete`);
  console.log(`  Total imported: ${totalImported}`);
  console.log(`  Total skipped: ${totalSkipped}`);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const dryRun = args.includes('--dry-run');

  try {
    switch (command) {
      case 'stats':
        await cmdStats();
        break;
      case 'mappings':
        await cmdMappings();
        break;
      case 'mappings:sync':
        await cmdMappingsSync();
        break;
      case 'mappings:fix':
        await cmdMappingsFix();
        break;
      case 'sync': {
        const daysIdx = args.indexOf('--days');
        const days = daysIdx >= 0 ? parseInt(args[daysIdx + 1]) : 7;
        await cmdSync(days);
        break;
      }
      case 'import': {
        const filePath = args[1];
        if (!filePath) {
          console.log('Error: Please specify a CSV file path');
          console.log('Usage: npm run cli -- import <file.csv> [--dry-run]');
          break;
        }
        await cmdImport(filePath, dryRun);
        break;
      }
      case 'import:dir': {
        const dirPath = args[1];
        if (!dirPath) {
          console.log('Error: Please specify a directory path');
          console.log('Usage: npm run cli -- import:dir <directory> [--dry-run]');
          break;
        }
        await cmdImportDir(dirPath, dryRun);
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

  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
