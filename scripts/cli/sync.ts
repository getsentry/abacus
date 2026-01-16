import { sql } from '@vercel/postgres';
import { syncAnthropicUsage, backfillAnthropicUsage, resetAnthropicBackfillComplete } from '../../src/lib/sync/anthropic';
import { syncCursorUsage, backfillCursorUsage, resetCursorBackfillComplete } from '../../src/lib/sync/cursor';
import { backfillGitHubUsage, resetGitHubBackfillComplete } from '../../src/lib/sync/github';
import { syncApiKeyMappingsSmart } from '../../src/lib/sync/anthropic-mappings';

interface SyncOptions {
  days?: number;
  fromDate?: string;
  toDate?: string;
  tools?: ('anthropic' | 'cursor')[];
  skipMappings?: boolean;
}

export async function cmdSync(options: SyncOptions = {}) {
  const { days = 7, fromDate, toDate, tools = ['anthropic', 'cursor'], skipMappings = false } = options;

  // Use explicit dates if provided, otherwise calculate from days
  const endDate = toDate || new Date().toISOString().split('T')[0];
  const startDate = fromDate || new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

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

export async function cmdBackfill(tool: 'anthropic' | 'cursor', fromDate: string) {
  // Check if provider is configured
  if (tool === 'anthropic' && !process.env.ANTHROPIC_ADMIN_KEY) {
    console.error('❌ ANTHROPIC_ADMIN_KEY not configured');
    return;
  }
  if (tool === 'cursor' && !process.env.CURSOR_ADMIN_KEY) {
    console.error('❌ CURSOR_ADMIN_KEY not configured');
    return;
  }

  console.log(`📥 Backfilling ${tool} backwards to ${fromDate}\n`);

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

export async function cmdGitHubBackfill(fromDate: string) {
  const hasGitHubApp = process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY && process.env.GITHUB_APP_INSTALLATION_ID;
  const hasGitHubToken = process.env.GITHUB_TOKEN;
  if (!hasGitHubApp && !hasGitHubToken) {
    console.error('❌ GitHub not configured');
    return;
  }

  console.log(`📥 Backfilling GitHub commits from ${fromDate}\n`);

  const result = await backfillGitHubUsage(fromDate, {
    onProgress: (msg) => console.log(msg)
  });

  console.log(`\n✓ Backfill complete`);
  console.log(`  Commits processed: ${result.commitsProcessed}`);
  console.log(`  AI Attributed: ${result.aiAttributedCommits}`);
  if (result.rateLimited) {
    console.log(`  ⚠️  Rate limited - will continue on next run`);
  }
  if (result.errors.length > 0) {
    console.log(`  Errors: ${result.errors.slice(0, 5).join(', ')}`);
  }
}

export async function cmdBackfillComplete(tool: 'anthropic' | 'cursor' | 'github') {
  console.log(`Marking ${tool} backfill as complete...`);
  await sql`
    INSERT INTO sync_state (id, last_sync_at, backfill_complete)
    VALUES (${tool}, NOW(), true)
    ON CONFLICT (id) DO UPDATE SET
      last_sync_at = NOW(),
      backfill_complete = true
  `;
  console.log(`✓ ${tool} backfill marked as complete`);
}

export async function cmdBackfillReset(tool: 'anthropic' | 'cursor' | 'github') {
  console.log(`Resetting ${tool} backfill status...`);
  if (tool === 'anthropic') {
    await resetAnthropicBackfillComplete();
  } else if (tool === 'cursor') {
    await resetCursorBackfillComplete();
  } else {
    await resetGitHubBackfillComplete();
  }
  console.log(`✓ ${tool} backfill status reset (can now re-backfill)`);
}

export async function cmdGaps(toolArg?: string) {
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
}
