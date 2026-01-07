import { NextResponse } from 'next/server';
import { wrapRouteHandlerWithSentry } from '@sentry/nextjs';
import { getToolIdentityMappings, setToolIdentityMapping, deleteToolIdentityMapping, getUnmappedToolRecords, getKnownEmails } from '@/lib/queries';
import { getSession } from '@/lib/auth';

async function getHandler(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const tool = searchParams.get('tool') || undefined;

  const [mappings, unmapped, knownEmails] = await Promise.all([
    getToolIdentityMappings(tool),
    tool ? getUnmappedToolRecords(tool) : getUnmappedToolRecords('claude_code'),
    getKnownEmails()
  ]);

  return NextResponse.json({
    mappings,
    unmapped,
    knownEmails
  });
}

const VALID_TOOLS = ['claude_code', 'cursor'];

async function postHandler(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { tool, externalId, email } = await request.json();

  if (!tool || !externalId || !email) {
    return NextResponse.json(
      { error: 'tool, externalId, and email are required' },
      { status: 400 }
    );
  }

  if (!VALID_TOOLS.includes(tool)) {
    return NextResponse.json({ error: 'Invalid tool' }, { status: 400 });
  }

  if (!email.includes('@')) {
    return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
  }

  await setToolIdentityMapping(tool, externalId, email);
  return NextResponse.json({ success: true });
}

async function deleteHandler(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { tool, externalId } = await request.json();

  if (!tool || !externalId) {
    return NextResponse.json({ error: 'tool and externalId are required' }, { status: 400 });
  }

  if (!VALID_TOOLS.includes(tool)) {
    return NextResponse.json({ error: 'Invalid tool' }, { status: 400 });
  }

  await deleteToolIdentityMapping(tool, externalId);
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
