import { NextResponse } from 'next/server';
import { backfillAnthropicUsage, getAnthropicBackfillState } from '@/lib/sync/anthropic';
import { syncApiKeyMappingsSmart } from '@/lib/sync/anthropic-mappings';

// Target: backfill to the beginning of 2025
const BACKFILL_TARGET_DATE = '2025-01-01';

/**
 * Anthropic Backfill Cron - runs periodically to gradually backfill history
 *
 * - Checks if we've already backfilled to the target date
 * - If not, runs one batch of backfill (will abort on rate limit)
 * - Saves progress to database for next run
 * - No-ops once target date is reached
 */
export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Check current backfill state (derived from actual usage data)
    const { oldestDate, isComplete } = await getAnthropicBackfillState();

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

    // Sync mappings first (quick operation)
    const mappingsResult = await syncApiKeyMappingsSmart();

    // Run backfill - will abort on rate limit and save progress
    const result = await backfillAnthropicUsage(BACKFILL_TARGET_DATE, new Date().toISOString().split('T')[0]);

    // Get updated state
    const { oldestDate: newOldestDate, isComplete: nowComplete } = await getAnthropicBackfillState();

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
      result: {
        recordsImported: result.recordsImported,
        recordsSkipped: result.recordsSkipped,
        rateLimited: result.rateLimited,
        errors: result.errors.slice(0, 5)
      },
      mappings: {
        created: mappingsResult.mappingsCreated,
        skipped: mappingsResult.mappingsSkipped
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
