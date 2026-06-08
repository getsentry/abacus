import { NextResponse } from 'next/server';
import { wrapRouteHandlerWithSentry } from '@sentry/nextjs';
import { eq } from 'drizzle-orm';
import { checkAuth, getSession } from '@/lib/auth';
import { db, openrouterKeys } from '@/lib/db';
import {
  createOpenRouterKey,
  deleteOpenRouterKey,
  listOpenRouterKeys,
  updateOpenRouterKey,
} from '@/lib/openrouter';

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
  const listResponse = await listOpenRouterKeys({ includeDisabled: true });
  const keys = (listResponse.data || []).filter((key) => dbRowByHash.has(key.hash));

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

  return NextResponse.json(
    keys.map((key) => {
      const row = dbRowByHash.get(key.hash);
      return {
        ...key,
        name: row?.name ?? key.name,
      };
    })
  );
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

  const created = await createOpenRouterKey({
    name: `${userEmail} - ${name}`,
  });

  try {
    await db.insert(openrouterKeys).values({
      hash: created.data.hash,
      email: userEmail,
      name,
      disabled: created.data.disabled,
    });
  } catch (error) {
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
    disabled: created.data.disabled,
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

  const updated = await updateOpenRouterKey(hash, { disabled });
  return NextResponse.json({
    ...updated,
    hash,
  });
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

  await deleteOpenRouterKey(hash);
  await db.delete(openrouterKeys).where(eq(openrouterKeys.hash, hash));

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
