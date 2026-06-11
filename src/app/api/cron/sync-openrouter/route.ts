import { NextResponse } from 'next/server';
import { wrapRouteHandlerWithSentry } from '@sentry/nextjs';
import { runOpenRouterSync, getOpenRouterSyncState } from '@/lib/sync';
import { getOpenRouterWorkspaces } from '@/lib/openrouter-workspaces';

/**
 * OpenRouter Cron Sync - runs daily at 00:30 UTC.
 *
 * The OpenRouter /activity endpoint only returns completed UTC days,
 * so running more often than daily yields no new data.
 *
 * Fetches daily usage per provisioned key via the OpenRouter Management API.
 * Each day's data is keyed by provisioned-key hash and mapped to user email
 * via the openrouter_keys table.
 *
 * Only the last 30 days of data are available from the API.
 * This endpoint is safe to call more frequently — it will skip days
 * that are already up-to-date.
 */
async function handler(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check if provider is configured (supports both OPENROUTER_MANAGEMENT_KEY and OPENROUTER_MANAGEMENT_KEYS)
  if (getOpenRouterWorkspaces().length === 0) {
    return NextResponse.json({
      success: true,
      service: 'openrouter',
      skipped: true,
      reason: 'No OpenRouter management keys configured (set OPENROUTER_MANAGEMENT_KEY or OPENROUTER_MANAGEMENT_KEYS)',
    });
  }

  // Get current sync state for logging
  const stateBefore = await getOpenRouterSyncState();

  const result = await runOpenRouterSync();

  return NextResponse.json({
    success: result.success,
    service: 'openrouter',
    previousSyncState: stateBefore.lastSyncedDate,
    result: {
      recordsImported: result.recordsImported,
      recordsSkipped: result.recordsSkipped,
      errors: result.errors.slice(0, 5), // Limit errors in response
    },
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
