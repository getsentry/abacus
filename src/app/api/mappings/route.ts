import { NextResponse } from 'next/server';
import { wrapRouteHandlerWithSentry } from '@sentry/nextjs';
import { getApiKeyMappings, setApiKeyMapping, deleteApiKeyMapping, getUnmappedApiKeys, getKnownEmails } from '@/lib/queries';
import { getSession } from '@/lib/auth';

async function getHandler() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [mappings, unmapped, knownEmails] = await Promise.all([
    getApiKeyMappings(),
    getUnmappedApiKeys(),
    getKnownEmails()
  ]);

  return NextResponse.json({
    mappings,
    unmapped,
    knownEmails
  });
}

async function postHandler(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { apiKey, email } = await request.json();

  if (!apiKey || !email) {
    return NextResponse.json(
      { error: 'apiKey and email are required' },
      { status: 400 }
    );
  }

  await setApiKeyMapping(apiKey, email);
  return NextResponse.json({ success: true });
}

async function deleteHandler(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { apiKey } = await request.json();

  if (!apiKey) {
    return NextResponse.json({ error: 'apiKey is required' }, { status: 400 });
  }

  await deleteApiKeyMapping(apiKey);
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
