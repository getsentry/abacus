import { NextResponse } from 'next/server';
import { wrapRouteHandlerWithSentry } from '@sentry/nextjs';
import { getAnthropicSyncState, getAnthropicBackfillState } from '@/lib/sync/anthropic';
import { getCursorSyncState, getCursorBackfillState } from '@/lib/sync/cursor';
import { getSession } from '@/lib/auth';

const BACKFILL_TARGET_DATE = '2025-01-01';

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
  if (oldestDate <= BACKFILL_TARGET_DATE || isComplete) return 'complete';
  return 'in_progress';
}

function calculateBackfillProgress(oldestDate: string | null, newestDate: string): number {
  if (!oldestDate) return 0;

  const target = new Date(BACKFILL_TARGET_DATE).getTime();
  const oldest = new Date(oldestDate).getTime();
  const newest = new Date(newestDate).getTime();

  if (oldest <= target) return 100;

  const totalRange = newest - target;
  const completedRange = newest - oldest;

  return Math.round((completedRange / totalRange) * 100);
}

async function handler() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check which providers are configured
  const anthropicConfigured = !!process.env.ANTHROPIC_ADMIN_KEY;
  const cursorConfigured = !!process.env.CURSOR_ADMIN_KEY;

  const today = new Date().toISOString().split('T')[0];
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
        lastSyncedDate: anthropicSync.lastSyncedDate,
        status: getForwardSyncStatus(anthropicSync.lastSyncedDate, false)
      },
      backfill: {
        oldestDate: anthropicBackfill.oldestDate,
        targetDate: BACKFILL_TARGET_DATE,
        status: getBackfillStatus(anthropicBackfill.oldestDate, anthropicBackfill.isComplete),
        progress: calculateBackfillProgress(anthropicBackfill.oldestDate, today)
      }
    };

    crons.push(
      { path: '/api/cron/sync-anthropic', schedule: 'Daily at 6 AM UTC', type: 'forward' },
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
        targetDate: BACKFILL_TARGET_DATE,
        status: getBackfillStatus(cursorBackfill.oldestDate, cursorBackfill.isComplete),
        progress: calculateBackfillProgress(cursorBackfill.oldestDate, today)
      }
    };

    crons.push(
      { path: '/api/cron/sync-cursor', schedule: 'Hourly', type: 'forward' },
      { path: '/api/cron/backfill-cursor', schedule: 'Every 6 hours', type: 'backfill' }
    );
  }

  return NextResponse.json({
    providers,
    crons,
    // For backwards compatibility, also include at top level
    anthropic: providers.anthropic || null,
    cursor: providers.cursor || null
  });
}

export const GET = wrapRouteHandlerWithSentry(handler, {
  method: 'GET',
  parameterizedRoute: '/api/status',
});
