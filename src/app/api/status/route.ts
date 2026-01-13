import { NextResponse } from 'next/server';
import { wrapRouteHandlerWithSentry } from '@sentry/nextjs';
import { getAnthropicSyncState, getAnthropicBackfillState } from '@/lib/sync/anthropic';
import { getCursorSyncState, getCursorBackfillState } from '@/lib/sync/cursor';
import { getGitHubBackfillState } from '@/lib/sync/github';
import { getUnmappedGitHubUsers } from '@/lib/sync/github-mappings';
import { getUnattributedStats, getLifetimeStats, getUnmappedToolRecords } from '@/lib/queries';
import { getSession } from '@/lib/auth';

type SyncStatus = 'up_to_date' | 'behind' | 'never_synced';
type BackfillStatus = 'complete' | 'in_progress' | 'not_started';

function getForwardSyncStatus(lastSyncedDate: string | null, isHourly: boolean = false): SyncStatus {
  if (!lastSyncedDate) return 'never_synced';

  const now = new Date();
  const lastSync = new Date(lastSyncedDate);

  if (isHourly) {
    // For Cursor: consider up to date if synced within last 2 hours
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    return lastSync >= twoHoursAgo ? 'up_to_date' : 'behind';
  } else {
    // For Anthropic: consider up to date if synced yesterday or today
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    return lastSyncedDate >= yesterdayStr ? 'up_to_date' : 'behind';
  }
}

function getBackfillStatus(oldestDate: string | null, isComplete: boolean): BackfillStatus {
  if (!oldestDate) return 'not_started';
  if (isComplete) return 'complete';
  return 'in_progress';
}

async function handler() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check which providers are configured
  const anthropicConfigured = !!process.env.ANTHROPIC_ADMIN_KEY;
  const cursorConfigured = !!process.env.CURSOR_ADMIN_KEY;

  const providers: Record<string, unknown> = {};
  const crons: { path: string; schedule: string; type: string }[] = [];

  // Anthropic/Claude Code
  if (anthropicConfigured) {
    const [anthropicSync, anthropicBackfill] = await Promise.all([
      getAnthropicSyncState(),
      getAnthropicBackfillState()
    ]);

    providers.anthropic = {
      id: 'anthropic',
      name: 'Claude Code',
      color: 'amber',
      configured: true,
      forwardSync: {
        lastSyncedDate: anthropicSync.lastSyncAt,  // Show actual sync timestamp
        status: getForwardSyncStatus(anthropicSync.lastSyncAt, true)  // Hourly freshness check
      },
      backfill: {
        oldestDate: anthropicBackfill.oldestDate,
        status: getBackfillStatus(anthropicBackfill.oldestDate, anthropicBackfill.isComplete)
      }
    };

    crons.push(
      { path: '/api/cron/sync-anthropic', schedule: 'Every 6 hours', type: 'forward' },
      { path: '/api/cron/backfill-anthropic', schedule: 'Every 6 hours', type: 'backfill' }
    );
  }

  // Cursor
  if (cursorConfigured) {
    const [cursorSync, cursorBackfill] = await Promise.all([
      getCursorSyncState(),
      getCursorBackfillState()
    ]);

    const cursorLastSyncedDate = cursorSync.lastSyncedHourEnd
      ? new Date(cursorSync.lastSyncedHourEnd).toISOString()
      : null;

    providers.cursor = {
      id: 'cursor',
      name: 'Cursor',
      color: 'cyan',
      configured: true,
      forwardSync: {
        lastSyncedDate: cursorLastSyncedDate,
        status: getForwardSyncStatus(cursorLastSyncedDate, true)
      },
      backfill: {
        oldestDate: cursorBackfill.oldestDate,
        status: getBackfillStatus(cursorBackfill.oldestDate, cursorBackfill.isComplete)
      }
    };

    crons.push(
      { path: '/api/cron/sync-cursor', schedule: 'Hourly', type: 'forward' },
      { path: '/api/cron/backfill-cursor', schedule: 'Every 6 hours', type: 'backfill' }
    );
  }

  // GitHub
  const githubConfigured = !!(process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY && process.env.GITHUB_APP_INSTALLATION_ID) || !!process.env.GITHUB_TOKEN;
  if (githubConfigured) {
    const githubBackfill = await getGitHubBackfillState();

    providers.github = {
      id: 'github',
      name: 'GitHub Commits',
      color: 'cyan',
      configured: true,
      syncType: 'webhook',  // Commits come via webhooks, not polling
      backfill: {
        oldestDate: githubBackfill.oldestDate,
        status: getBackfillStatus(githubBackfill.oldestDate, githubBackfill.isComplete)
      }
    };

    crons.push(
      { path: '/api/cron/sync-github-mappings', schedule: 'Hourly', type: 'mappings' },
      { path: '/api/cron/backfill-github', schedule: 'Every 6 hours', type: 'backfill' }
    );
  }

  // Get unattributed usage stats, lifetime stats, and mapping health data in parallel
  const [unattributed, lifetimeStats, unmappedGitHubUsers, unmappedApiKeys] = await Promise.all([
    getUnattributedStats(),
    getLifetimeStats(),
    githubConfigured ? getUnmappedGitHubUsers() : Promise.resolve([]),
    anthropicConfigured ? getUnmappedToolRecords('claude_code') : Promise.resolve([]),
  ]);

  const githubMappings = githubConfigured ? {
    unmappedUserCount: unmappedGitHubUsers.length,
    unmappedCommitCount: unmappedGitHubUsers.reduce((sum, u) => sum + u.commitCount, 0),
    unmappedUsers: unmappedGitHubUsers.slice(0, 50),
  } : null;

  const anthropicMappings = anthropicConfigured ? {
    unmappedKeyCount: unmappedApiKeys.length,
    unmappedUsageCount: unmappedApiKeys.reduce((sum, k) => sum + k.usage_count, 0),
    unmappedKeys: unmappedApiKeys.slice(0, 50),
  } : null;

  return NextResponse.json({
    providers,
    crons,
    unattributed,
    lifetimeStats,
    githubMappings,
    anthropicMappings,
    // For backwards compatibility, also include at top level
    anthropic: providers.anthropic || null,
    cursor: providers.cursor || null
  });
}

export const GET = wrapRouteHandlerWithSentry(handler, {
  method: 'GET',
  parameterizedRoute: '/api/status',
});
