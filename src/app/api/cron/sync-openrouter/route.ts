import { NextResponse } from 'next/server';
import { wrapRouteHandlerWithSentry } from '@sentry/nextjs';
import { syncOpenRouterCron, getOpenRouterSyncState } from '@/lib/sync/openrouter';
import { getOpenRouterKey, NO_OPENROUTER_KEY_ERROR } from '@/lib/sync/provider-keys';

/**
 * OpenRouter Cron Sync - runs at 00:15, 06:15, 12:15 and 18:15 UTC
 *
 * OpenRouter's activity API returns daily aggregates for the last 30
 * *completed* UTC days; today's usage is not available until the day ends.
 * - First run imports the whole 30-day window
 * - Later runs re-sync from the day before the last synced date through yesterday
 *
 * The 00:15 run picks up the day that just finished; the later runs are cheap
 * retries in case OpenRouter publishes late or a run fails. Re-syncing is
 * idempotent (upsert), so running more often is safe but gains nothing.
 */
async function handler(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check if provider is configured
  if (!getOpenRouterKey()) {
    return NextResponse.json({
      success: true,
      service: 'openrouter',
      skipped: true,
      reason: NO_OPENROUTER_KEY_ERROR
    });
  }

  const stateBefore = await getOpenRouterSyncState();
  const result = await syncOpenRouterCron();

  return NextResponse.json({
    success: result.success,
    service: 'openrouter',
    syncedRange: result.syncedRange ?? null,
    previousSyncState: stateBefore.lastSyncedDate,
    result: {
      recordsImported: result.recordsImported,
      recordsSkipped: result.recordsSkipped,
      errors: result.errors.slice(0, 5) // Limit errors in response
    }
  });
}

export const GET = wrapRouteHandlerWithSentry(handler, {
  method: 'GET',
  parameterizedRoute: '/api/cron/sync-openrouter',
});

export const POST = wrapRouteHandlerWithSentry(handler, {
  method: 'POST',
  parameterizedRoute: '/api/cron/sync-openrouter',
});
