import { sql } from '@vercel/postgres';
import { syncAnthropicUsage, backfillAnthropicUsage, resetAnthropicBackfillComplete } from '../../src/lib/sync/anthropic';
import { syncCursorUsage, backfillCursorUsage, resetCursorBackfillComplete } from '../../src/lib/sync/cursor';
import { backfillGitHubUsage, resetGitHubBackfillComplete } from '../../src/lib/sync/github';
import { syncApiKeyMappingsSmart } from '../../src/lib/sync/anthropic-mappings';
import { getAnthropicKeys, getCursorKeys } from '../../src/lib/sync/provider-keys';

interface SyncOptions {
  days?: number;
  fromDate?: string;
  toDate?: string;
  tools?: ('anthropic' | 'cursor')[];
  skipMappings?: boolean;
  orgName?: string;  // Filter to specific org/team by name
}

export async function cmdSync(options: SyncOptions = {}) {
  const { days = 7, fromDate, toDate, tools = ['anthropic', 'cursor'], skipMappings = false, orgName } = options;

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
    console.log(`Syncing Anthropic usage${orgName ? ` (org: ${orgName})` : ''}...`);
    const anthropicResult = await syncAnthropicUsage(startDate, endDate, { orgName });
    console.log(`  Imported: ${anthropicResult.recordsImported}, Skipped: ${anthropicResult.recordsSkipped}`);
    if (anthropicResult.errors.length > 0) {
      console.log(`  Errors: ${anthropicResult.errors.slice(0, 3).join(', ')}`);
    }
  }

  if (configuredTools.includes('cursor')) {
    if (configuredTools.includes('anthropic')) console.log('');
    console.log(`Syncing Cursor usage${orgName ? ` (team: ${orgName})` : ''}...`);
    const cursorResult = await syncCursorUsage(startDate, endDate, { orgName });
    console.log(`  Imported: ${cursorResult.recordsImported}, Skipped: ${cursorResult.recordsSkipped}`);
    if (cursorResult.errors.length > 0) {
      console.log(`  Errors: ${cursorResult.errors.slice(0, 3).join(', ')}`);
    }
  }

  console.log('\n✓ Sync complete!');
}

export async function cmdBackfill(tool: 'anthropic' | 'cursor', fromDate: string) {
  // Check if provider is configured
  if (tool === 'anthropic' && !process.env.ANTHROPIC_ADMIN_KEY && !process.env.ANTHROPIC_ADMIN_KEYS) {
    console.error('❌ ANTHROPIC_ADMIN_KEY or ANTHROPIC_ADMIN_KEYS not configured');
    return;
  }
  if (tool === 'cursor' && !process.env.CURSOR_ADMIN_KEY && !process.env.CURSOR_ADMIN_KEYS) {
    console.error('❌ CURSOR_ADMIN_KEY or CURSOR_ADMIN_KEYS not configured');
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
      onProgress: (msg: string) => console.log(msg),
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
      onProgress: (msg: string) => console.log(msg),
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

/**
 * Fetch the organization ID for an Anthropic admin key by querying the API.
 * Returns null if no data is available or API call fails.
 */
async function fetchAnthropicOrgIdForKey(adminKey: string): Promise<string | null> {
  // Fetch yesterday's data (most likely to have records)
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const date = yesterday.toISOString().split('T')[0];

  const response = await fetch(
    `https://api.anthropic.com/v1/organizations/usage_report/claude_code?starting_at=${date}&limit=1`,
    {
      headers: {
        'X-Api-Key': adminKey,
        'anthropic-version': '2023-06-01'
      }
    }
  );

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  if (data.data && data.data.length > 0) {
    return data.data[0].organization_id;
  }

  return null;
}

/**
 * Derive Cursor organization ID from team name (matches sync logic).
 */
function deriveCursorOrgId(teamName: string): string | null {
  return teamName !== 'default' ? `cursor:${teamName}` : null;
}

/**
 * Backfill organization IDs for legacy usage records.
 *
 * This should be run BEFORE switching from single-key to multi-key configuration.
 * It updates records that have NULL organization_id with the appropriate org ID.
 *
 * For Anthropic: Fetches org UUID from API
 * For Cursor: Derives org ID from team name (cursor:TeamName)
 *
 * @param tool - 'anthropic' or 'cursor'
 * @param orgName - For multi-key configs, specify which org/team owned the legacy data
 */
export async function cmdBackfillOrgIds(tool: 'anthropic' | 'cursor', orgName?: string) {
  if (tool === 'anthropic') {
    await backfillAnthropicOrgIds(orgName);
  } else if (tool === 'cursor') {
    await backfillCursorOrgIds(orgName);
  } else {
    console.error('❌ Please specify tool: anthropic or cursor');
  }
}

async function backfillAnthropicOrgIds(orgName?: string) {
  const keys = getAnthropicKeys();

  if (keys.length === 0) {
    console.error('❌ No Anthropic keys configured');
    return;
  }

  // First, check if there are any NULL records to update
  const nullCount = await sql`
    SELECT COUNT(*) as count
    FROM usage_records
    WHERE organization_id IS NULL AND tool = 'claude_code'
  `;
  const recordsToUpdate = parseInt(nullCount.rows[0].count);

  if (recordsToUpdate === 0) {
    console.log('✓ No legacy Anthropic records to update (all records already have organization_id)');
    return;
  }

  console.log(`Found ${recordsToUpdate} legacy Anthropic records with NULL organization_id\n`);

  // Fetch org IDs for all configured keys
  console.log('Fetching organization IDs from Anthropic API...');
  const orgsWithIds: { name: string; orgId: string | null }[] = [];
  for (const key of keys) {
    const orgId = await fetchAnthropicOrgIdForKey(key.key);
    orgsWithIds.push({ name: key.name, orgId });
    if (orgId) {
      console.log(`  ${key.name}: ${orgId}`);
    } else {
      console.log(`  ${key.name}: (no data found)`);
    }
  }
  console.log('');

  // Filter to orgs that have valid IDs
  const validOrgs = orgsWithIds.filter(o => o.orgId !== null);
  if (validOrgs.length === 0) {
    console.error('❌ Could not fetch organization ID from any configured key.');
    console.error('   Make sure you have usage data in the Anthropic API.');
    return;
  }

  let targetOrg: { name: string; orgId: string };

  if (keys.length === 1) {
    // Single key - use it
    if (!validOrgs[0].orgId) {
      console.error('❌ Could not fetch organization ID from API');
      return;
    }
    targetOrg = { name: validOrgs[0].name, orgId: validOrgs[0].orgId };
  } else if (orgName) {
    // Multi-key with --org specified
    const found = validOrgs.find(o => o.name === orgName);
    if (!found) {
      console.error(`❌ Org '${orgName}' not found or has no data`);
      console.error('Available orgs with data:');
      validOrgs.forEach(o => console.error(`  ${o.name}`));
      return;
    }
    targetOrg = { name: found.name, orgId: found.orgId! };
  } else {
    // Multi-key, no --org specified - show options and exit
    console.log('Multiple orgs configured. Specify which org owned the legacy data:\n');
    validOrgs.forEach(o => console.log(`  ${o.name} (${o.orgId})`));
    console.log('\nRun: pnpm cli migrate:backfill-org-ids anthropic --org "Org Name"');
    return;
  }

  console.log(`Updating ${recordsToUpdate} records with organization_id = ${targetOrg.orgId} (${targetOrg.name})...`);

  const result = await sql`
    UPDATE usage_records
    SET organization_id = ${targetOrg.orgId}
    WHERE organization_id IS NULL AND tool = 'claude_code'
  `;

  console.log(`\n✓ Updated ${result.rowCount} records`);
}

async function backfillCursorOrgIds(orgName?: string) {
  const keys = getCursorKeys();

  if (keys.length === 0) {
    console.error('❌ No Cursor keys configured');
    return;
  }

  // First, check if there are any NULL records to update
  const nullCount = await sql`
    SELECT COUNT(*) as count
    FROM usage_records
    WHERE organization_id IS NULL AND tool = 'cursor'
  `;
  const recordsToUpdate = parseInt(nullCount.rows[0].count);

  if (recordsToUpdate === 0) {
    console.log('✓ No legacy Cursor records to update (all records already have organization_id)');
    return;
  }

  console.log(`Found ${recordsToUpdate} legacy Cursor records with NULL organization_id\n`);

  // For Cursor, org ID is derived from team name, not fetched from API
  const teamsWithIds = keys.map(k => ({
    name: k.name,
    orgId: deriveCursorOrgId(k.name)
  }));

  console.log('Configured teams:');
  teamsWithIds.forEach(t => {
    if (t.orgId) {
      console.log(`  ${t.name}: ${t.orgId}`);
    } else {
      console.log(`  ${t.name}: (default - uses NULL)`);
    }
  });
  console.log('');

  if (keys.length === 1 && keys[0].name === 'default') {
    // Single key with 'default' name - legacy records should stay NULL
    console.log('Single-key config with default name. Legacy records should remain NULL.');
    console.log('No action needed - records will match on re-sync.');
    return;
  }

  if (keys.length === 1) {
    // Single key with custom name - use it
    const targetOrg = teamsWithIds[0];
    if (!targetOrg.orgId) {
      console.log('Single-key config with default name. No update needed.');
      return;
    }

    console.log(`Updating ${recordsToUpdate} records with organization_id = ${targetOrg.orgId} (${targetOrg.name})...`);

    const result = await sql`
      UPDATE usage_records
      SET organization_id = ${targetOrg.orgId}
      WHERE organization_id IS NULL AND tool = 'cursor'
    `;

    console.log(`\n✓ Updated ${result.rowCount} records`);
    return;
  }

  // Multi-key config
  if (!orgName) {
    console.log('Multiple teams configured. Specify which team owned the legacy data:\n');
    teamsWithIds.forEach(t => console.log(`  ${t.name}${t.orgId ? ` (${t.orgId})` : ' (default)'}`));
    console.log('\nRun: pnpm cli migrate:backfill-org-ids cursor --org "Team Name"');
    return;
  }

  const targetTeam = teamsWithIds.find(t => t.name === orgName);
  if (!targetTeam) {
    console.error(`❌ Team '${orgName}' not found in configured keys`);
    console.error('Available teams:');
    teamsWithIds.forEach(t => console.error(`  ${t.name}`));
    return;
  }

  if (!targetTeam.orgId) {
    console.log(`Team '${orgName}' uses default (NULL) organization_id.`);
    console.log('No update needed - legacy records already have NULL.');
    return;
  }

  console.log(`Updating ${recordsToUpdate} records with organization_id = ${targetTeam.orgId} (${targetTeam.name})...`);

  const result = await sql`
    UPDATE usage_records
    SET organization_id = ${targetTeam.orgId}
    WHERE organization_id IS NULL AND tool = 'cursor'
  `;

  console.log(`\n✓ Updated ${result.rowCount} records`);
}
