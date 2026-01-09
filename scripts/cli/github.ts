import { sql } from '@vercel/postgres';
import { syncGitHubRepo, backfillGitHubUsage, getGitHubSyncState, getGitHubBackfillState, detectAiAttribution, cleanupMergeCommits } from '../../src/lib/sync/github';
import { getGitHubUsersWithMappingStatus, mapGitHubUser, getGitHubUser, syncGitHubMemberEmails, hasUnattributedCommits } from '../../src/lib/sync/github-mappings';

/**
 * Automatically sync email mappings if there are unattributed commits.
 * Called after commit sync operations to ensure users with noreply emails get mapped.
 */
async function syncMappingsIfNeeded(): Promise<void> {
  try {
    const needsMapping = await hasUnattributedCommits();
    if (!needsMapping) {
      return;
    }

    console.log('\n📧 Found commits with unmapped authors, syncing email mappings...');

    const result = await syncGitHubMemberEmails({
      onProgress: (msg) => console.log(`  ${msg}`)
    });

    if (result.mappingsCreated > 0) {
      console.log(`  ✓ Created ${result.mappingsCreated} new mappings`);
    } else if (result.usersFound > 0) {
      console.log(`  ℹ No new mappings needed (${result.usersFound} users checked)`);
    }

    if (result.errors.length > 0) {
      console.log(`  ⚠ Errors: ${result.errors.slice(0, 3).join(', ')}`);
    }
  } catch (err) {
    // Don't fail the main sync if mapping sync fails
    console.log(`\n⚠ Could not sync email mappings: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }
}

export async function cmdGitHubStatus() {
  console.log('🔄 GitHub Commits Sync Status\n');

  // Check if GitHub is configured
  const hasGitHubApp = process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY && process.env.GITHUB_APP_INSTALLATION_ID;
  const hasGitHubToken = process.env.GITHUB_TOKEN;
  if (!hasGitHubApp && !hasGitHubToken) {
    console.log('⚠️  GitHub not configured');
    console.log('\nSet either:');
    console.log('  - GITHUB_TOKEN (fine-grained personal access token)');
    console.log('  - GITHUB_APP_ID + GITHUB_APP_PRIVATE_KEY + GITHUB_APP_INSTALLATION_ID');
    return;
  }

  console.log(`Auth: ${hasGitHubApp ? 'GitHub App' : 'Personal Token'}`);

  // Check if tables exist
  try {
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
    console.log(`  AI Attributed: ${row.ai_commits}`);
    if (row.total_commits > 0) {
      const pct = ((row.ai_commits / row.total_commits) * 100).toFixed(1);
      console.log(`  AI percentage: ${pct}%`);
    }
    console.log(`  Repositories: ${row.repos}`);
  } catch (err) {
    if (err instanceof Error && err.message.includes('does not exist')) {
      console.log('\n⚠️  Database tables not found. Run migration first:');
      console.log('   npm run cli db:migrate');
    } else {
      throw err;
    }
  }
}

export interface GitHubSyncOptions {
  repo?: string;
  days?: number;
  fromDate?: string;
  reset?: boolean;
  full?: boolean;
  dryRun?: boolean;
  org?: string;
  fix?: boolean;
  retry?: boolean;
}

// Default start date for --full sync (captures most relevant history)
const FULL_SYNC_START_DATE = '2024-01-01';

export async function cmdGitHubSync(options: GitHubSyncOptions) {
  const { repo, days = 90, fromDate, reset = false, full = false, dryRun = false, fix = false, retry = false, org = 'getsentry' } = options;

  // --full implies --reset and uses FULL_SYNC_START_DATE
  const effectiveReset = reset || full;
  const effectiveFromDate = full ? FULL_SYNC_START_DATE : fromDate;

  // Check for either GitHub App or personal token
  const hasGitHubApp = process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY && process.env.GITHUB_APP_INSTALLATION_ID;
  const token = process.env.GITHUB_TOKEN;
  if (!hasGitHubApp && !token) {
    console.error('❌ GitHub not configured');
    console.error('\nTo set up a fine-grained token (recommended for local dev):');
    console.error('1. Go to GitHub → Settings → Developer settings → Fine-grained tokens');
    console.error('2. Create token with "Contents" read-only permission');
    console.error('3. Set GITHUB_TOKEN in .env.local');
    return;
  }

  // Determine date range
  const since = effectiveFromDate || new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const isBackfill = !!effectiveFromDate;

  // Dry-run mode: just show what would be detected
  if (dryRun) {
    if (!token) {
      console.error('❌ --dry-run requires GITHUB_TOKEN (personal access token)');
      return;
    }
    if (!repo) {
      console.error('❌ --dry-run requires a specific repo');
      return;
    }

    console.log(`🔍 Dry run: Scanning ${repo} for AI Attributed commits (since ${since})\n`);
    console.log('This does NOT write to the database - just shows what would be detected.\n');

    const url = `https://api.github.com/repos/${repo}/commits?since=${since}&per_page=100`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`❌ GitHub API error: ${response.status} ${response.statusText}`);
      console.error(error);
      return;
    }

    interface CommitItem {
      sha: string;
      commit: {
        message: string;
        author: { name: string; email: string; date: string };
      };
      author: { login: string } | null;
      parents: Array<{ sha: string }>;
    }

    const commits: CommitItem[] = await response.json();
    const nonMergeCommits = commits.filter(c => c.parents.length <= 1);
    console.log(`Found ${commits.length} commits (${commits.length - nonMergeCommits.length} merge commits skipped)\n`);

    let aiCount = 0;
    const aiCommits: Array<{ sha: string; date: string; author: string; tool: string; model?: string; message: string }> = [];

    for (const commit of nonMergeCommits) {
      const attribution = detectAiAttribution(
        commit.commit.message,
        commit.commit.author.name,
        commit.commit.author.email
      );

      if (attribution) {
        aiCount++;
        aiCommits.push({
          sha: commit.sha.slice(0, 7),
          date: commit.commit.author.date.split('T')[0],
          author: commit.author?.login || commit.commit.author.email,
          tool: attribution.tool,
          model: attribution.model,
          message: commit.commit.message.split('\n')[0].slice(0, 60),
        });
      }
    }

    if (aiCommits.length === 0) {
      console.log('No AI Attributed commits found.');
    } else {
      console.log(`Found ${aiCount} AI Attributed commit(s):\n`);
      for (const c of aiCommits) {
        console.log(`  ${c.sha} ${c.date} [${c.tool}${c.model ? `:${c.model}` : ''}]`);
        console.log(`    by ${c.author}: ${c.message}`);
      }

      const byTool = aiCommits.reduce((acc, c) => {
        acc[c.tool] = (acc[c.tool] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      console.log('\nSummary:');
      console.log(`  Total commits: ${nonMergeCommits.length}`);
      console.log(`  AI Attributed: ${aiCount} (${((aiCount / nonMergeCommits.length) * 100).toFixed(1)}%)`);
      console.log('  By tool:');
      for (const [tool, count] of Object.entries(byTool)) {
        console.log(`    ${tool}: ${count}`);
      }
    }

    console.log('\n✓ Dry run complete (no data written)');
    return;
  }

  // Fix mode: find repos with bad commits (e.g., null message), reset and resync them
  if (fix) {
    console.log('🔧 Fix mode: Finding repos with bad commits...\n');

    // Query repos that have commits with NULL message (indicator of bad data)
    const badRepos = await sql`
      SELECT DISTINCT r.id, r.full_name,
        COUNT(*) FILTER (WHERE c.message IS NULL) as null_message_count,
        COUNT(*) as total_commits
      FROM repositories r
      JOIN commits c ON c.repo_id = r.id
      GROUP BY r.id, r.full_name
      HAVING COUNT(*) FILTER (WHERE c.message IS NULL) > 0
      ORDER BY r.full_name
    `;

    if (badRepos.rows.length === 0) {
      console.log('✓ No repos with bad commits found. All clean!');
      return;
    }

    console.log(`Found ${badRepos.rows.length} repo(s) with bad commits:\n`);
    for (const r of badRepos.rows) {
      console.log(`  ${r.full_name}: ${r.null_message_count}/${r.total_commits} commits missing message`);
    }
    console.log('');

    // Calculate the 90-day since date for resync
    const fixSince = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Process each bad repo: reset and resync
    for (const r of badRepos.rows) {
      const repoName = r.full_name as string;
      const repoId = r.id as number;

      console.log(`🔄 Fixing ${repoName}...`);

      // Reset: delete all commits for this repo
      await sql`DELETE FROM commits WHERE repo_id = ${repoId}`;
      console.log(`  Deleted existing commits`);

      // Resync with 90 days of history
      const result = await syncGitHubRepo(repoName, fixSince, undefined, {
        onProgress: (msg) => console.log(`  ${msg}`)
      });

      console.log(`  ✓ Synced: ${result.commitsProcessed} commits, ${result.aiAttributedCommits} AI attributed`);
      if (result.errors.length > 0) {
        console.log(`  Errors: ${result.errors.slice(0, 3).join(', ')}`);
      }
      console.log('');
    }

    console.log(`✓ Fixed ${badRepos.rows.length} repo(s)`);

    // Sync email mappings if needed
    await syncMappingsIfNeeded();
    return;
  }

  // Retry mode: find repos with incomplete data and intelligently fill gaps
  if (retry) {
    console.log('🔄 Retry mode: Finding repos with incomplete data...\n');

    const targetSince = since;
    const targetSinceDate = new Date(targetSince);

    // Query all repos with their oldest commit date
    const allRepos = await sql`
      SELECT r.id, r.full_name,
        COUNT(c.id)::int as commit_count,
        MIN(c.committed_at) as oldest_commit
      FROM repositories r
      LEFT JOIN commits c ON c.repo_id = r.id
      GROUP BY r.id, r.full_name
      ORDER BY r.full_name
    `;

    // Filter to repos that need syncing:
    // 1. 0 commits (completely failed)
    // 2. Oldest commit is after our target since date (missing historical data)
    const incompleteRepos = allRepos.rows.filter(r => {
      if (r.commit_count === 0) return true;
      if (!r.oldest_commit) return true;
      // If oldest commit is after our target start date, we have a gap
      return new Date(r.oldest_commit) > targetSinceDate;
    });

    if (incompleteRepos.length === 0) {
      console.log(`✓ All repos have data back to ${targetSince}. Nothing to sync!`);
      return;
    }

    console.log(`Target: sync commits from ${targetSince}\n`);
    console.log(`Found ${incompleteRepos.length} repo(s) needing data:\n`);

    for (const r of incompleteRepos) {
      if (r.commit_count === 0) {
        console.log(`  ${r.full_name} (0 commits - full sync needed)`);
      } else {
        const oldestDate = r.oldest_commit.toISOString().split('T')[0];
        console.log(`  ${r.full_name} (oldest: ${oldestDate} - gap from ${targetSince})`);
      }
    }
    console.log('');

    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;

    // Process each incomplete repo with smart date ranges
    for (const r of incompleteRepos) {
      const repoName = r.full_name as string;

      let syncFrom = targetSince;
      let syncUntil: string | undefined;

      if (r.commit_count > 0 && r.oldest_commit) {
        // We have some commits - only fetch the gap
        // Fetch from target date up to the day before our oldest commit
        const oldestDate = new Date(r.oldest_commit);
        syncUntil = oldestDate.toISOString();
        console.log(`🔄 Filling gap for ${repoName} (${targetSince} to ${syncUntil.split('T')[0]})...`);
      } else {
        // No commits - full sync needed
        console.log(`🔄 Full sync for ${repoName} (from ${targetSince})...`);
      }

      const result = await syncGitHubRepo(repoName, syncFrom, syncUntil, {
        onProgress: (msg) => console.log(`  ${msg}`)
      });

      if (result.errors.length > 0) {
        console.log(`  ⚠️  ${result.errors[0]}`);
        errorCount++;
      } else if (result.commitsProcessed === 0 && r.commit_count > 0) {
        console.log(`  ○ No commits in gap period`);
        skippedCount++;
      } else {
        console.log(`  ✓ Synced: ${result.commitsProcessed} commits, ${result.aiAttributedCommits} AI attributed`);
        successCount++;
      }
      console.log('');
    }

    console.log(`✓ Retry complete: ${successCount} synced, ${skippedCount} no gap data, ${errorCount} failed`);
    if (errorCount > 0) {
      console.log(`  Run with --retry again after rate limit resets to continue`);
    }

    // Sync email mappings if needed
    await syncMappingsIfNeeded();
    return;
  }

  // Reset mode: delete existing commits before syncing
  if (effectiveReset) {
    if (repo) {
      console.log(`🗑️  Resetting commits for ${repo}...`);
      const repoResult = await sql`
        SELECT id FROM repositories WHERE full_name = ${repo}
      `;
      if (repoResult.rows.length > 0) {
        const repoId = repoResult.rows[0].id;
        // Delete attributions first (or rely on CASCADE)
        await sql`DELETE FROM commits WHERE repo_id = ${repoId}`;
        console.log(`  Deleted existing commits for ${repo}`);
      }
    } else {
      console.log(`🗑️  Resetting ALL GitHub commits...`);
      // Delete all commits (CASCADE will handle commit_attributions)
      await sql`DELETE FROM commits`;
      // Reset backfill state
      await sql`
        UPDATE sync_state
        SET backfill_complete = false, last_synced_hour_end = NULL
        WHERE id = 'github'
      `;
      console.log(`  Deleted all commits and reset backfill state`);
    }
    console.log('');
  }

  // Single repo sync
  if (repo) {
    console.log(`🔄 Syncing ${repo} from ${since}...${effectiveReset ? ' (after reset)' : ''}\n`);

    const result = await syncGitHubRepo(repo, since, undefined, {
      onProgress: (msg) => console.log(msg)
    });

    console.log(`\n✓ Sync complete`);
    console.log(`  Commits processed: ${result.commitsProcessed}`);
    console.log(`  AI Attributed: ${result.aiAttributedCommits}`);
    if (result.errors.length > 0) {
      console.log(`  Errors: ${result.errors.slice(0, 5).join(', ')}`);
    }

    // Sync email mappings if needed
    await syncMappingsIfNeeded();
    return;
  }

  // Full org sync (backfill mode)
  if (isBackfill) {
    console.log(`📥 ${effectiveReset ? 'Reset and backfilling' : 'Backfilling'} all ${org} repos from ${since}\n`);

    const result = await backfillGitHubUsage(since, {
      org,
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

    // Sync email mappings if needed (unless rate limited, to avoid hitting limits)
    if (!result.rateLimited) {
      await syncMappingsIfNeeded();
    }
    return;
  }

  // No repo and no --from: show help
  console.error('Usage: npm run cli github:sync [repo] [options]');
  console.error('');
  console.error('Options:');
  console.error('  --days N       Sync last N days (default: 90)');
  console.error('  --from DATE    Sync from specific date (enables backfill mode for all repos)');
  console.error('  --reset        Delete existing commits before syncing (clean slate)');
  console.error('  --fix          Find repos with bad commits (null message), reset and resync them');
  console.error('  --retry        Retry repos with incomplete data (respects --from/--days)');
  console.error('  --dry-run      Show what would be synced without writing to DB');
  console.error('');
  console.error('Examples:');
  console.error('  npm run cli github:sync getsentry/sentry --days 30');
  console.error('  npm run cli github:sync getsentry/sentry --reset --from 2024-01-01');
  console.error('  npm run cli github:sync --reset --from 2024-01-01  # Reset ALL and backfill');
  console.error('  npm run cli github:sync --fix                      # Fix repos with bad data');
  console.error('  npm run cli github:sync --retry                    # Retry incomplete repos (last 90 days)');
  console.error('  npm run cli github:sync --retry --from 2024-01-01  # Retry incomplete repos from date');
}

export async function cmdGitHubCommits(repo: string, limit: number = 20) {
  if (!repo) {
    console.error('Error: Please specify a repo (e.g., getsentry/sentry-mcp)');
    console.error('Usage: npm run cli github:commits <repo> [--limit N]');
    return;
  }

  console.log(`📋 Commits for ${repo} (limit ${limit})\n`);

  const result = await sql`
    SELECT
      c.commit_id,
      c.author_email,
      c.ai_tool,
      c.ai_model,
      c.committed_at::date as date
    FROM commits c
    JOIN repositories r ON c.repo_id = r.id
    WHERE r.full_name = ${repo}
    ORDER BY c.committed_at DESC
    LIMIT ${limit}
  `;

  if (result.rows.length === 0) {
    console.log('No commits found for this repo.');
    return;
  }

  // Summary stats
  const stats = await sql`
    SELECT
      COUNT(*)::int as total,
      COUNT(*) FILTER (WHERE ai_tool IS NOT NULL)::int as ai_count
    FROM commits c
    JOIN repositories r ON c.repo_id = r.id
    WHERE r.full_name = ${repo}
  `;
  const s = stats.rows[0];
  console.log(`Total: ${s.total} commits, ${s.ai_count} AI-attributed (${Math.round((s.ai_count / s.total) * 100)}%)\n`);

  // Print commits
  for (const row of result.rows) {
    const sha = row.commit_id.slice(0, 7);
    const tool = row.ai_tool ? `[${row.ai_tool}${row.ai_model ? ':' + row.ai_model : ''}]` : '[no-ai]';
    console.log(`  ${sha} ${row.date.toISOString().split('T')[0]} ${tool.padEnd(20)} ${row.author_email}`);
  }
}

export async function cmdGitHubUsers() {
  console.log('👥 GitHub Users with Commits\n');

  const users = await getGitHubUsersWithMappingStatus('getsentry');

  if (users.length === 0) {
    console.log('No GitHub users found with commits. Run github:sync first.');
    return;
  }

  console.log('ID'.padEnd(12) + 'Login'.padEnd(20) + 'Email'.padEnd(35) + 'Commits'.padEnd(10) + 'Status');
  console.log('-'.repeat(85));

  for (const user of users) {
    const id = user.authorId.padEnd(12);
    const login = (user.login || '-').padEnd(20);
    const email = (user.email || '-').padEnd(35);
    const commits = user.commitCount.toString().padEnd(10);
    const status = user.isMapped ? '✓ mapped' : '○ unmapped';
    console.log(`${id}${login}${email}${commits}${status}`);
  }

  const unmappedCount = users.filter(u => !u.isMapped).length;
  console.log(`\nTotal: ${users.length} users (${unmappedCount} unmapped)`);

  if (unmappedCount > 0) {
    console.log('\nTo map a user: npm run cli github:users:map <github_id> <email>');
  }
}

export async function cmdGitHubUsersMap(githubId: string, email: string) {
  if (!githubId || !email) {
    console.error('Error: Both GitHub user ID and email are required');
    console.error('Usage: npm run cli github:users:map <github_id> <email>');
    return;
  }

  if (!email.includes('@')) {
    console.error('Error: Invalid email format');
    return;
  }

  // Try to get the user's login for display
  const userInfo = await getGitHubUser(githubId);
  const displayName = userInfo ? `${userInfo.login} (${githubId})` : githubId;

  console.log(`Mapping GitHub user ${displayName} → ${email}...`);

  await mapGitHubUser(githubId, email);

  console.log(`✓ Mapped ${displayName} → ${email}`);
  console.log('  Existing commits from this user have been updated.');
}

export async function cmdGitHubUsersSync() {
  console.log('🔄 Syncing GitHub org member emails via GraphQL API\n');

  const hasGitHubApp = process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY && process.env.GITHUB_APP_INSTALLATION_ID;
  const hasGitHubToken = process.env.GITHUB_TOKEN;
  if (!hasGitHubApp && !hasGitHubToken) {
    console.error('❌ GitHub not configured');
    console.error('\nSet GITHUB_APP_ID + GITHUB_APP_PRIVATE_KEY + GITHUB_APP_INSTALLATION_ID');
    console.error('or GITHUB_TOKEN (with org:read scope)');
    return;
  }

  const result = await syncGitHubMemberEmails({
    onProgress: (msg) => console.log(`  ${msg}`)
  });

  console.log(`\n✓ Sync complete`);
  console.log(`  Users found: ${result.usersFound}`);
  console.log(`  Mappings created: ${result.mappingsCreated}`);
  if (result.errors.length > 0) {
    console.log(`  Errors: ${result.errors.slice(0, 5).join(', ')}`);
  }
}

export async function cmdGitHubCleanupMerges(dryRun: boolean = false) {
  console.log(`🧹 Cleaning up merge commits from database${dryRun ? ' (DRY RUN)' : ''}\n`);

  const hasGitHubApp = process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY && process.env.GITHUB_APP_INSTALLATION_ID;
  const hasGitHubToken = process.env.GITHUB_TOKEN;
  if (!hasGitHubApp && !hasGitHubToken) {
    console.error('❌ GitHub not configured');
    console.error('\nSet GITHUB_APP_ID + GITHUB_APP_PRIVATE_KEY + GITHUB_APP_INSTALLATION_ID');
    console.error('or GITHUB_TOKEN');
    return;
  }

  const result = await cleanupMergeCommits({
    dryRun,
    onProgress: (msg) => console.log(msg)
  });

  console.log(`\n✓ Cleanup complete`);
  console.log(`  Commits checked: ${result.checked}`);
  console.log(`  Merge commits ${dryRun ? 'found' : 'deleted'}: ${result.deleted}`);
  if (result.errors.length > 0) {
    console.log(`  Errors: ${result.errors.length}`);
    result.errors.slice(0, 5).forEach(e => console.log(`    - ${e}`));
  }
}
