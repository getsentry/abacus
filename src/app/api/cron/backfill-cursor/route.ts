import { NextResponse } from 'next/server';
import { wrapRouteHandlerWithSentry } from '@sentry/nextjs';
import { backfillCursorUsage, getCursorBackfillState } from '@/lib/sync/cursor';

// Target: backfill to the beginning of 2025
const BACKFILL_TARGET_DATE = '2025-01-01';

/**
 * Cursor Backfill Cron - runs periodically to gradually backfill history
 *
 * - Checks if we've already backfilled to the target date
 * - If not, runs one batch of backfill (will abort on rate limit)
 * - Saves progress to database for next run
 * - No-ops once target date is reached or no more historical data
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

  // Check current backfill state (derived from actual usage data)
  const { oldestDate, isComplete } = await getCursorBackfillState();

  // If we've already reached the target or marked complete, nothing to do
  if (isComplete || (oldestDate && oldestDate <= BACKFILL_TARGET_DATE)) {
    return NextResponse.json({
      success: true,
      status: 'complete',
      message: isComplete
        ? `Backfill complete - no more historical data available (oldest: ${oldestDate})`
        : `Backfill complete - already reached ${oldestDate}`,
      targetDate: BACKFILL_TARGET_DATE,
      currentOldestDate: oldestDate
    });
  }

  // Run backfill - will abort on rate limit and save progress
  // Works backwards from current oldest date (or today if never run)
  const result = await backfillCursorUsage(BACKFILL_TARGET_DATE);

  // Get updated state
  const { oldestDate: newOldestDate, isComplete: nowComplete } = await getCursorBackfillState();

  const status = result.rateLimited
    ? 'rate_limited'
    : (nowComplete || (newOldestDate && newOldestDate <= BACKFILL_TARGET_DATE))
      ? 'complete'
      : 'in_progress';

  return NextResponse.json({
    success: result.success,
    status,
    targetDate: BACKFILL_TARGET_DATE,
    previousOldestDate: oldestDate,
    currentOldestDate: newOldestDate,
    lastProcessedDate: result.lastProcessedDate,
    result: {
      recordsImported: result.recordsImported,
      recordsSkipped: result.recordsSkipped,
      rateLimited: result.rateLimited,
      errors: result.errors.slice(0, 5)
    }
  });
}

export const GET = wrapRouteHandlerWithSentry(handler, {
  method: 'GET',
  parameterizedRoute: '/api/cron/backfill-cursor',
});

export const POST = wrapRouteHandlerWithSentry(handler, {
  method: 'POST',
  parameterizedRoute: '/api/cron/backfill-cursor',
});
