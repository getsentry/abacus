import { NextResponse } from 'next/server';
import { wrapRouteHandlerWithSentry } from '@sentry/nextjs';
import { runOpenAISync, getOpenAISyncState } from '@/lib/sync';

/**
 * OpenAI Cron Sync - runs daily at 7 AM UTC (staggered from Anthropic at 6 AM)
 *
 * Uses state tracking to efficiently sync only new data:
 * - Tracks last synced date in sync_state table
 * - Syncs from (last_synced_date - 1 day) to yesterday
 * - Skips if already synced yesterday's data
 *
 * This endpoint is safe to call more frequently than daily -
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
  if (!process.env.OPENAI_ADMIN_KEY) {
    return NextResponse.json({
      success: true,
      service: 'openai',
      skipped: true,
      reason: 'OPENAI_ADMIN_KEY not configured'
    });
  }

  // Get current sync state for logging
  const stateBefore = await getOpenAISyncState();

  const result = await runOpenAISync({ includeMappings: true });

  // Check if we actually synced anything
  const didSync = result.openai.syncedRange !== undefined;

  return NextResponse.json({
    success: result.openai.success,
    service: 'openai',
    didSync,
    syncedRange: result.openai.syncedRange || null,
    previousSyncState: stateBefore.lastSyncedDate,
    result: {
      openai: {
        recordsImported: result.openai.recordsImported,
        recordsSkipped: result.openai.recordsSkipped,
        errors: result.openai.errors.slice(0, 5) // Limit errors in response
      },
      mappings: result.mappings ? {
        mappingsCreated: result.mappings.mappingsCreated,
        mappingsSkipped: result.mappings.mappingsSkipped
      } : null
    }
  });
}

export const GET = wrapRouteHandlerWithSentry(handler, {
  method: 'GET',
  parameterizedRoute: '/api/cron/sync-openai',
});

export const POST = wrapRouteHandlerWithSentry(handler, {
  method: 'POST',
  parameterizedRoute: '/api/cron/sync-openai',
});
