import { NextResponse } from 'next/server';
import { wrapRouteHandlerWithSentry } from '@sentry/nextjs';
import { syncOpenRouterCron, getOpenRouterSyncState } from '@/lib/sync/openrouter';
import { getOpenRouterKey, NO_OPENROUTER_KEY_ERROR } from '@/lib/sync/provider-keys';

/**
 * OpenRouter Cron Sync - runs every 6 hours
 *
 * OpenRouter's activity API returns daily aggregates for the last 30 days:
 * - First run imports the whole 30-day window
 * - Later runs re-sync from the day before the last synced date through today
 *
 * Re-syncing is idempotent (upsert), so it is safe to call more frequently.
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
