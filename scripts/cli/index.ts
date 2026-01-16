#!/usr/bin/env npx tsx
/**
 * Abacus CLI
 *
 * Usage:
 *   npx tsx scripts/cli/index.ts <command> [options]
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

import { closeReadlineInterface } from './utils';
import { cmdDbMigrate } from './db';
import { cmdStats } from './stats';
import { cmdAnthropicStatus } from './anthropic';
import { cmdCursorStatus, cmdImportCursorCsv } from './cursor';
import { cmdGitHubStatus, cmdGitHubSync, cmdGitHubCommits, cmdGitHubUsers, cmdGitHubUsersMap, cmdGitHubUsersSync, cmdGitHubCleanupMerges } from './github';
import { cmdMappings, cmdMappingsSync, cmdMappingsFix } from './mappings';
import { cmdSync, cmdBackfill, cmdGitHubBackfill, cmdBackfillComplete, cmdBackfillReset, cmdGaps } from './sync';
import { cmdFixDuplicates } from './fix-duplicates';

function printHelp() {
  console.log(`
Abacus CLI

Usage:
  npx tsx scripts/cli/index.ts <command> [options]

Commands:
  db:migrate            Run pending database migrations
  sync [tool] [--days N] [--from DATE] [--to DATE] [--skip-mappings]
                        Sync recent usage data (tool: anthropic|cursor, default: both)
                        Use --from/--to for precise date range (YYYY-MM-DD)
  backfill <tool> --from YYYY-MM-DD
                        Backfill historical data backwards to the specified date
  backfill:complete <tool>
                        Mark backfill as complete for a tool (anthropic|cursor|github)
  backfill:reset <tool> Reset backfill status for a tool (allows re-backfilling)
  gaps [tool]           Check for gaps in usage data (tool: anthropic|cursor, default: both)
  mappings              List API key mappings
  mappings:sync [--full] Sync API key mappings from Anthropic (--full for all keys)
  mappings:fix          Interactive fix for unmapped API keys
  anthropic:status      Show Anthropic sync state
  cursor:status         Show Cursor sync state
  github:status         Show GitHub commits sync state
  github:sync [repo] [options]
                        Sync GitHub commits (filters to default branch, skips merge commits)
                        Options:
                          --days N      Sync last N days (default: 90)
                          --from DATE   Sync from date (backfill mode for all repos)
                          --reset       Delete existing commits first (clean slate)
                          --full        Reset and sync from 2024-01-01 (shorthand for --reset --from 2024-01-01)
                          --dry-run     Show what would be synced without writing
  github:commits <repo> [--limit N]
                        Dump commits from database for debugging
  github:users          List GitHub users with commits and their mapping status
  github:users:sync     Sync GitHub org member emails via GraphQL API
  github:users:map <github_id> <email>
                        Map a GitHub user ID to a work email
  import:cursor-csv <file>
                        Import Cursor usage from CSV export
  fix:duplicates [--execute]
                        Fix duplicate usage records (dry-run by default)
  stats                 Show database statistics
  help                  Show this help message

Examples:
  npm run cli sync --days 30
  npm run cli sync cursor --days 7
  npm run cli sync cursor --from 2026-01-09 --to 2026-01-10
  npm run cli backfill cursor --from 2024-01-01
  npm run cli github:sync getsentry/sentry --days 30
  npm run cli github:sync --reset --from 2024-01-01   # Full reset and backfill
  npm run cli mappings:fix
`);
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
        // Parse repo (first non-flag argument after command)
        const repo = args[1] && !args[1].startsWith('--') ? args[1] : undefined;
        const daysIdx = args.indexOf('--days');
        const days = daysIdx >= 0 ? parseInt(args[daysIdx + 1]) : 90;
        const fromIdx = args.indexOf('--from');
        const fromDate = fromIdx >= 0 ? args[fromIdx + 1] : undefined;
        const reset = args.includes('--reset');
        const full = args.includes('--full');
        const dryRun = args.includes('--dry-run');
        const fix = args.includes('--fix');
        const retry = args.includes('--retry');
        await cmdGitHubSync({ repo, days, fromDate, reset, full, dryRun, fix, retry });
        break;
      }
      case 'github:commits': {
        const repo = args[1];
        const limitIdx = args.indexOf('--limit');
        const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1]) : 20;
        await cmdGitHubCommits(repo, limit);
        break;
      }
      case 'github:users':
        await cmdGitHubUsers();
        break;
      case 'github:users:sync':
        await cmdGitHubUsersSync();
        break;
      case 'github:users:map': {
        const githubId = args[1];
        const email = args[2];
        await cmdGitHubUsersMap(githubId, email);
        break;
      }
      case 'github:cleanup-merges': {
        const dryRun = args.includes('--dry-run');
        await cmdGitHubCleanupMerges(dryRun);
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
        const fromIdx = args.indexOf('--from');
        const toIdx = args.indexOf('--to');
        const fromDate = fromIdx >= 0 ? args[fromIdx + 1] : undefined;
        const toDate = toIdx >= 0 ? args[toIdx + 1] : undefined;
        const skipMappings = args.includes('--skip-mappings');
        // Parse tool filter: sync [anthropic|cursor] --days N
        const toolArg = args[1];
        let tools: ('anthropic' | 'cursor')[] = ['anthropic', 'cursor'];
        if (toolArg === 'anthropic') {
          tools = ['anthropic'];
        } else if (toolArg === 'cursor') {
          tools = ['cursor'];
        }
        await cmdSync({ days, fromDate, toDate, tools, skipMappings });
        break;
      }
      case 'backfill': {
        const tool = args[1] as 'anthropic' | 'cursor' | 'github';
        if (!tool || !['anthropic', 'cursor', 'github'].includes(tool)) {
          console.error('Error: Please specify tool (anthropic, cursor, or github)');
          console.error('Usage: npm run cli backfill <tool> --from YYYY-MM-DD');
          break;
        }
        const fromIdx = args.indexOf('--from');
        if (fromIdx < 0) {
          console.error('Error: Please specify --from date');
          console.error('Usage: npm run cli backfill <tool> --from YYYY-MM-DD');
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
        if (tool === 'github') {
          await cmdGitHubBackfill(fromDate);
        } else {
          await cmdBackfill(tool, fromDate);
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
        await cmdBackfillComplete(tool);
        break;
      }
      case 'backfill:reset': {
        const tool = args[1] as 'anthropic' | 'cursor' | 'github';
        if (!tool || !['anthropic', 'cursor', 'github'].includes(tool)) {
          console.error('Error: Please specify tool (anthropic, cursor, or github)');
          console.error('Usage: npm run cli backfill:reset <tool>');
          break;
        }
        await cmdBackfillReset(tool);
        break;
      }
      case 'gaps': {
        const toolArg = args[1];
        await cmdGaps(toolArg);
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
      case 'fix:duplicates': {
        const execute = args.includes('--execute');
        await cmdFixDuplicates(!execute);
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
    closeReadlineInterface();
  }

  await Sentry.flush(2000);
  process.exit(0);
}

main().catch(async (err) => {
  console.error('Error:', err);
  await Sentry.flush(2000);
  process.exit(1);
});
