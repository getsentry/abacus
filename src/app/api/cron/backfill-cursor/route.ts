import { NextResponse } from 'next/server';
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
export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Check current backfill state
    const { oldestDate } = await getCursorBackfillState();

    // If we've already reached the target, nothing to do
    if (oldestDate && oldestDate <= BACKFILL_TARGET_DATE) {
      return NextResponse.json({
        success: true,
        status: 'complete',
        message: `Backfill complete - already reached ${oldestDate}`,
        targetDate: BACKFILL_TARGET_DATE,
        currentOldestDate: oldestDate
      });
    }

    // Run backfill - will abort on rate limit and save progress
    // Works backwards from current oldest date (or today if never run)
    const result = await backfillCursorUsage(BACKFILL_TARGET_DATE, new Date().toISOString().split('T')[0]);

    // Get updated state
    const { oldestDate: newOldestDate } = await getCursorBackfillState();

    return NextResponse.json({
      success: result.success,
      status: result.rateLimited ? 'rate_limited' : (newOldestDate && newOldestDate <= BACKFILL_TARGET_DATE ? 'complete' : 'in_progress'),
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
