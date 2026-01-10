import { NextResponse } from 'next/server';
import { wrapRouteHandlerWithSentry } from '@sentry/nextjs';
import { runFullSync, getSyncState, syncMappings } from '@/lib/sync';
import { getSession } from '@/lib/auth';
import { isValidDateString } from '@/lib/utils';

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

  let body: { startDate?: string; endDate?: string; includeMappings?: boolean; mappingsOnly?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const { startDate, endDate, includeMappings, mappingsOnly } = body;

  // Validate date parameters if provided
  if (startDate && !isValidDateString(startDate)) {
    return NextResponse.json({ error: 'Invalid startDate format. Use YYYY-MM-DD.' }, { status: 400 });
  }
  if (endDate && !isValidDateString(endDate)) {
    return NextResponse.json({ error: 'Invalid endDate format. Use YYYY-MM-DD.' }, { status: 400 });
  }

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
