import { NextResponse } from 'next/server';
import { wrapRouteHandlerWithSentry } from '@sentry/nextjs';
import { checkAuth, getSession } from '@/lib/auth';
import { db, openrouterWorkspaces } from '@/lib/db';
import { listOpenRouterWorkspaces } from '@/lib/openrouter';

function isAdmin(email: string): boolean {
  return (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}

/**
 * GET /api/openrouter/workspaces
 * Returns the admin-enabled workspaces users may create keys in.
 *
 * GET /api/openrouter/workspaces?admin=true (admin only)
 * Returns all live OpenRouter workspaces with their enabled state,
 * for the admin management UI.
 */
async function getHandler(request: Request) {
  const authError = await checkAuth();
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const adminView = searchParams.get('admin') === 'true';

  if (adminView) {
    const session = await getSession();
    const email = session?.user?.email;
    if (!email || !isAdmin(email)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    let live;
    try {
      live = await listOpenRouterWorkspaces();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to list OpenRouter workspaces';
      return NextResponse.json({ error: message }, { status: 502 });
    }

    const enabled = await db.select().from(openrouterWorkspaces);
    const enabledIds = new Set(enabled.map((row) => row.id));

    return NextResponse.json({
      workspaces: live.map((ws) => ({
        id: ws.id,
        name: ws.name,
        enabled: enabledIds.has(ws.id),
      })),
    });
  }

  const enabled = await db.select().from(openrouterWorkspaces);
  return NextResponse.json({
    workspaces: enabled.map((row) => ({ id: row.id, name: row.name })),
  });
}

/**
 * PUT /api/openrouter/workspaces (admin only)
 * Replaces the set of enabled workspaces. Body: { ids: string[] }.
 * IDs are validated against live OpenRouter workspaces; names are cached.
 */
async function putHandler(request: Request) {
  const authError = await checkAuth();
  if (authError) return authError;

  const session = await getSession();
  const email = session?.user?.email;
  if (!email || !isAdmin(email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  if (!Array.isArray(body.ids) || body.ids.some((id: unknown) => typeof id !== 'string' || !id)) {
    return NextResponse.json({ error: 'ids must be an array of workspace ID strings' }, { status: 400 });
  }
  const ids: string[] = body.ids;

  let live;
  try {
    live = await listOpenRouterWorkspaces();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list OpenRouter workspaces';
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const liveById = new Map(live.map((ws) => [ws.id, ws]));
  const unknown = ids.filter((id) => !liveById.has(id));
  if (unknown.length > 0) {
    return NextResponse.json(
      { error: `Unknown workspace IDs: ${unknown.join(', ')}` },
      { status: 400 }
    );
  }

  // Replace the enabled set; cache current names from the live response
  await db.delete(openrouterWorkspaces);
  if (ids.length > 0) {
    await db.insert(openrouterWorkspaces).values(
      ids.map((id) => ({ id, name: liveById.get(id)!.name }))
    );
  }

  return NextResponse.json({
    workspaces: ids.map((id) => ({ id, name: liveById.get(id)!.name })),
  });
}

export const GET = wrapRouteHandlerWithSentry(getHandler, {
  method: 'GET',
  parameterizedRoute: '/api/openrouter/workspaces',
});

export const PUT = wrapRouteHandlerWithSentry(putHandler, {
  method: 'PUT',
  parameterizedRoute: '/api/openrouter/workspaces',
});
