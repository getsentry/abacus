import { NextResponse } from 'next/server';
import { runCursorSync, getCursorSyncState } from '@/lib/sync';

/**
 * Cursor Cron Sync - runs hourly
 *
 * Per Cursor API guidelines:
 * - Poll at most once per hour (data is aggregated hourly)
 * - Always poll for the previous complete hour
 * - Skip if we've already synced the current complete hour
 *
 * This endpoint is safe to call more frequently than hourly -
 * it will simply return early if there's no new data to sync.
 */
export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Get current sync state for logging
    const stateBefore = await getCursorSyncState();

    const result = await runCursorSync();

    // Check if we actually synced anything
    const didSync = result.syncedRange !== undefined;

    return NextResponse.json({
      success: result.success,
      service: 'cursor',
      didSync,
      syncedRange: result.syncedRange ? {
        startMs: result.syncedRange.startMs,
        endMs: result.syncedRange.endMs,
        start: new Date(result.syncedRange.startMs).toISOString(),
        end: new Date(result.syncedRange.endMs).toISOString()
      } : null,
      previousSyncState: stateBefore.lastSyncedHourEnd
        ? new Date(stateBefore.lastSyncedHourEnd).toISOString()
        : null,
      result: {
        recordsImported: result.recordsImported,
        recordsSkipped: result.recordsSkipped,
        errors: result.errors.slice(0, 5) // Limit errors in response
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  return GET(request);
}
