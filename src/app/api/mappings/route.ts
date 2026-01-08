import { NextResponse } from 'next/server';
import { wrapRouteHandlerWithSentry } from '@sentry/nextjs';
import { getIdentityMappings, setIdentityMapping, deleteIdentityMapping, getUnmappedToolRecords, getKnownEmails } from '@/lib/queries';
import { getSession } from '@/lib/auth';

async function getHandler(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const source = searchParams.get('source') || searchParams.get('tool') || undefined;

  const [mappings, unmapped, knownEmails] = await Promise.all([
    getIdentityMappings(source),
    source ? getUnmappedToolRecords(source) : getUnmappedToolRecords('claude_code'),
    getKnownEmails()
  ]);

  return NextResponse.json({
    mappings,
    unmapped,
    knownEmails
  });
}

const VALID_SOURCES = ['claude_code', 'cursor', 'github', 'gitlab'];

async function postHandler(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const source = body.source || body.tool;
  const { externalId, email } = body;

  if (!source || !externalId || !email) {
    return NextResponse.json(
      { error: 'source, externalId, and email are required' },
      { status: 400 }
    );
  }

  if (!VALID_SOURCES.includes(source)) {
    return NextResponse.json({ error: 'Invalid source' }, { status: 400 });
  }

  if (!email.includes('@')) {
    return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
  }

  await setIdentityMapping(source, externalId, email);
  return NextResponse.json({ success: true });
}

async function deleteHandler(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const source = body.source || body.tool;
  const { externalId } = body;

  if (!source || !externalId) {
    return NextResponse.json({ error: 'source and externalId are required' }, { status: 400 });
  }

  if (!VALID_SOURCES.includes(source)) {
    return NextResponse.json({ error: 'Invalid source' }, { status: 400 });
  }

  await deleteIdentityMapping(source, externalId);
  return NextResponse.json({ success: true });
}

export const GET = wrapRouteHandlerWithSentry(getHandler, {
  method: 'GET',
  parameterizedRoute: '/api/mappings',
});

export const POST = wrapRouteHandlerWithSentry(postHandler, {
  method: 'POST',
  parameterizedRoute: '/api/mappings',
});

export const DELETE = wrapRouteHandlerWithSentry(deleteHandler, {
  method: 'DELETE',
  parameterizedRoute: '/api/mappings',
});
