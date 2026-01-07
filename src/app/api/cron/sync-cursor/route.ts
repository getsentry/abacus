import { NextResponse } from 'next/server';
import { wrapRouteHandlerWithSentry } from '@sentry/nextjs';
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
async function handler(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check if provider is configured
  if (!process.env.CURSOR_ADMIN_KEY) {
    return NextResponse.json({
      success: true,
      service: 'cursor',
      skipped: true,
      reason: 'CURSOR_ADMIN_KEY not configured'
    });
  }

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
}

export const GET = wrapRouteHandlerWithSentry(handler, {
  method: 'GET',
  parameterizedRoute: '/api/cron/sync-cursor',
});

export const POST = wrapRouteHandlerWithSentry(handler, {
  method: 'POST',
  parameterizedRoute: '/api/cron/sync-cursor',
});
