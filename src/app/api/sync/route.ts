import { NextResponse } from 'next/server';
import { wrapRouteHandlerWithSentry } from '@sentry/nextjs';
import { runFullSync, getSyncState, syncMappings } from '@/lib/sync';
import { getSession } from '@/lib/auth';

// Get sync status
async function getHandler() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const state = await getSyncState('main');
  return NextResponse.json({
    lastSync: state.lastSyncAt,
    anthropicConfigured: !!process.env.ANTHROPIC_ADMIN_KEY,
    cursorConfigured: !!(process.env.CURSOR_TEAM_SLUG && process.env.CURSOR_ADMIN_KEY)
  });
}

// Trigger manual sync
async function postHandler(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { startDate, endDate, includeMappings, mappingsOnly } = body;

  // If only syncing mappings
  if (mappingsOnly) {
    const mappingsResult = await syncMappings();
    return NextResponse.json({
      success: mappingsResult.success,
      result: { mappings: mappingsResult }
    });
  }

  // Full sync with optional mappings
  const result = await runFullSync(startDate, endDate, { includeMappings });

  return NextResponse.json({
    success: true,
    result
  });
}

export const GET = wrapRouteHandlerWithSentry(getHandler, {
  method: 'GET',
  parameterizedRoute: '/api/sync',
});

export const POST = wrapRouteHandlerWithSentry(postHandler, {
  method: 'POST',
  parameterizedRoute: '/api/sync',
});
