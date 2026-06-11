import { NextResponse } from 'next/server';
import { wrapRouteHandlerWithSentry } from '@sentry/nextjs';
import { eq } from 'drizzle-orm';
import { checkAuth, getSession } from '@/lib/auth';
import { db, openrouterKeys, openrouterWorkspaces } from '@/lib/db';
import {
  OpenRouterError,
  createOpenRouterKey,
  deleteOpenRouterKey,
  listOpenRouterKeys,
  updateOpenRouterKey,
} from '@/lib/openrouter';

const NO_OPENROUTER_KEY_ERROR = 'OPENROUTER_MANAGEMENT_KEY is not set';

function isAdmin(email: string): boolean {
  return (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}

function normalizeEmail(email: string | undefined | null): string | null {
  if (!email) return null;
  return email.trim().toLowerCase();
}

function normalizeName(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function extractOpenRouterErrorStatus(error: unknown): number | null {
  if (error instanceof OpenRouterError) {
    return error.statusCode;
  }

  if (error && typeof error === 'object' && 'statusCode' in error) {
    const statusCode = (error as { statusCode?: unknown }).statusCode;
    return typeof statusCode === 'number' ? statusCode : null;
  }

  return null;
}

function mapOpenRouterError(error: unknown): NextResponse<{ error: string }> {
  const statusCode = extractOpenRouterErrorStatus(error);

  if (statusCode === 429) {
    return NextResponse.json({ error: 'OpenRouter rate limit exceeded. Please retry shortly.' }, { status: 503 });
  }

  if (typeof statusCode === 'number' && statusCode >= 500 && statusCode <= 599) {
    return NextResponse.json({ error: 'OpenRouter service is temporarily unavailable.' }, { status: 502 });
  }

  if (error instanceof Error && error.message === NO_OPENROUTER_KEY_ERROR) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (error instanceof Error) {
    return NextResponse.json({ error: error.message || 'OpenRouter request failed.' }, { status: 502 });
  }

  return NextResponse.json({ error: 'OpenRouter request failed.' }, { status: 502 });
}

function normalizeListItem(item: {
  createdAt?: string | null;
  hash: string;
  name: string;
  disabled: boolean;
  label: string;
  usage?: number;
  usageDaily?: number;
  usageWeekly?: number;
  usageMonthly?: number;
}) {
  const { createdAt, usage, usageDaily, usageWeekly, usageMonthly, ...rest } = item;
  return {
    ...rest,
    created_at: createdAt ?? null,
    // OpenRouter credit spend in USD, as reported live by the keys API
    usage: usage ?? 0,
    usage_daily: usageDaily ?? 0,
    usage_weekly: usageWeekly ?? 0,
    usage_monthly: usageMonthly ?? 0,
  };
}

async function getHandler(request: Request) {
  const authError = await checkAuth();
  if (authError) return authError;

  const session = await getSession();
  const userEmail = normalizeEmail(session?.user?.email);
  if (!userEmail) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const adminView = searchParams.get('admin') === 'true';

  if (adminView && !isAdmin(userEmail)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const dbRows = adminView
    ? await db.select().from(openrouterKeys)
    : await db.select().from(openrouterKeys).where(eq(openrouterKeys.email, userEmail));

  if (!dbRows.length) {
    return NextResponse.json(adminView ? {} : []);
  }

  const dbRowByHash = new Map(dbRows.map((row) => [row.hash, row]));

  // Keys live in different OpenRouter workspaces; list() only returns one
  // workspace per call (no filter = account default workspace). Iterate the
  // default workspace plus every workspace referenced by our DB rows.
  const workspaceIds = new Set<string | null>([null]);
  for (const row of dbRows) {
    workspaceIds.add(row.workspaceId);
  }

  const enabledWorkspaces = await db.select().from(openrouterWorkspaces);
  const workspaceNameById = new Map(enabledWorkspaces.map((ws) => [ws.id, ws.name]));

  // Collect keys from all relevant workspaces; one failure must not abort the others
  const allItems: Array<ReturnType<typeof normalizeListItem> & { workspace: string | null }> = [];
  let lastError: unknown = null;
  let successCount = 0;
  const workspaceErrors: Array<{ workspace: string; message: string }> = [];

  for (const wsId of workspaceIds) {
    try {
      const listResponse = await listOpenRouterKeys({
        includeDisabled: true,
        ...(wsId ? { workspaceId: wsId } : {}),
      });
      const workspaceName = wsId ? workspaceNameById.get(wsId) ?? wsId : null;
      for (const item of listResponse.data) {
        allItems.push({ ...normalizeListItem(item), workspace: workspaceName });
      }
      successCount++;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : 'Unknown error';
      workspaceErrors.push({ workspace: wsId ? workspaceNameById.get(wsId) ?? wsId : 'default', message });
    }
  }

  if (successCount === 0) {
    return mapOpenRouterError(lastError);
  }

  const keys = allItems.filter((key) => dbRowByHash.has(key.hash));

  if (adminView) {
    const grouped: Record<string, Array<(typeof keys)[number] & { name: string }>> = {};

    for (const key of keys) {
      const row = dbRowByHash.get(key.hash);
      if (!row) continue;

      const email = row.email;
      if (!grouped[email]) {
        grouped[email] = [];
      }

      grouped[email].push({
        ...key,
        name: row.name,
      });
    }

    return NextResponse.json(grouped);
  }

  const result = keys.map((key) => {
    const row = dbRowByHash.get(key.hash);
    return {
      ...key,
      name: row?.name ?? key.name,
    };
  });

  if (workspaceErrors.length > 0) {
    return NextResponse.json({ keys: result, workspaceErrors });
  }

  return NextResponse.json(result);
}

async function postHandler(request: Request) {
  const authError = await checkAuth();
  if (authError) return authError;

  const session = await getSession();
  const userEmail = normalizeEmail(session?.user?.email);
  if (!userEmail) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const name = normalizeName(body.name);
  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  // Resolve the target workspace from the admin-enabled set.
  // No enabled workspaces -> keys go to the account default workspace.
  // Exactly one enabled -> auto-select it. Multiple -> workspaceId required.
  const enabledWorkspaces = await db.select().from(openrouterWorkspaces);
  let workspaceId: string | null = null;
  let workspaceName: string | null = null;

  if (body.workspaceId) {
    const match = enabledWorkspaces.find((ws) => ws.id === body.workspaceId);
    if (!match) {
      const valid = enabledWorkspaces.map((ws) => ws.name).join(', ') || 'none';
      return NextResponse.json(
        { error: `Invalid workspace. Valid workspaces: ${valid}` },
        { status: 400 }
      );
    }
    workspaceId = match.id;
    workspaceName = match.name;
  } else if (enabledWorkspaces.length === 1) {
    workspaceId = enabledWorkspaces[0].id;
    workspaceName = enabledWorkspaces[0].name;
  } else if (enabledWorkspaces.length > 1) {
    return NextResponse.json(
      { error: `workspaceId is required. Valid workspaces: ${enabledWorkspaces.map((ws) => ws.name).join(', ')}` },
      { status: 400 }
    );
  }

  let created: Awaited<ReturnType<typeof createOpenRouterKey>>;

  try {
    created = await createOpenRouterKey({
      name: `${userEmail} - ${name}`,
      ...(workspaceId ? { workspaceId } : {}),
    });
  } catch (error) {
    return mapOpenRouterError(error);
  }

  try {
    await db.insert(openrouterKeys).values({
      hash: created.data.hash,
      email: userEmail,
      name,
      workspaceId,
    });
  } catch {
    try {
      await deleteOpenRouterKey(created.data.hash);
    } catch (cleanupError) {
      console.error('Failed to cleanup OpenRouter key after DB insert failure', {
        hash: created.data.hash,
        cleanupError,
      });
    }

    return NextResponse.json(
      {
        error: 'Failed to store key mapping',
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    key: created.key,
    hash: created.data.hash,
    name,
    workspace: workspaceName,
    disabled: created.data.disabled,
    created_at: created.data.createdAt,
  });
}

async function patchHandler(request: Request) {
  const authError = await checkAuth();
  if (authError) return authError;

  const session = await getSession();
  const userEmail = normalizeEmail(session?.user?.email);
  if (!userEmail) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const hash = normalizeName(body.hash);
  const disabled = body.disabled;

  if (!hash) {
    return NextResponse.json({ error: 'hash is required' }, { status: 400 });
  }

  if (typeof disabled !== 'boolean') {
    return NextResponse.json({ error: 'disabled must be boolean' }, { status: 400 });
  }

  const [row] = await db.select().from(openrouterKeys).where(eq(openrouterKeys.hash, hash));

  if (!row) {
    if (isAdmin(userEmail)) {
      return NextResponse.json({ error: 'Key not found' }, { status: 404 });
    }

    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!isAdmin(userEmail) && normalizeEmail(row.email) !== userEmail) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let updated: Awaited<ReturnType<typeof updateOpenRouterKey>>;
  try {
    // Update by hash works account-wide; no workspace context needed
    updated = await updateOpenRouterKey(hash, { disabled });
  } catch (error) {
    return mapOpenRouterError(error);
  }

  return NextResponse.json(normalizeListItem(updated.data));
}

async function deleteHandler(request: Request) {
  const authError = await checkAuth();
  if (authError) return authError;

  const session = await getSession();
  const userEmail = normalizeEmail(session?.user?.email);
  if (!userEmail) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isAdmin(userEmail)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const hash = normalizeName(body.hash);
  if (!hash) {
    return NextResponse.json({ error: 'hash is required' }, { status: 400 });
  }

  const [row] = await db.select().from(openrouterKeys).where(eq(openrouterKeys.hash, hash));
  if (!row) {
    return NextResponse.json({ error: 'Key not found' }, { status: 404 });
  }

  try {
    // Delete by hash works account-wide; no workspace context needed
    await deleteOpenRouterKey(hash);
  } catch (error) {
    return mapOpenRouterError(error);
  }

  try {
    await db.delete(openrouterKeys).where(eq(openrouterKeys.hash, hash));
  } catch {
    return NextResponse.json({ error: 'Failed to remove key mapping' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export const GET = wrapRouteHandlerWithSentry(getHandler, {
  method: 'GET',
  parameterizedRoute: '/api/openrouter/keys',
});

export const POST = wrapRouteHandlerWithSentry(postHandler, {
  method: 'POST',
  parameterizedRoute: '/api/openrouter/keys',
});

export const PATCH = wrapRouteHandlerWithSentry(patchHandler, {
  method: 'PATCH',
  parameterizedRoute: '/api/openrouter/keys',
});

export const DELETE = wrapRouteHandlerWithSentry(deleteHandler, {
  method: 'DELETE',
  parameterizedRoute: '/api/openrouter/keys',
});
