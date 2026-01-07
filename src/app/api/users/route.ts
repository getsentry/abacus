import { NextResponse } from 'next/server';
import { wrapRouteHandlerWithSentry } from '@sentry/nextjs';
import { getUserSummaries } from '@/lib/queries';
import { DEFAULT_DAYS } from '@/lib/constants';
import { getSession } from '@/lib/auth';

async function handler(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '50', 10);
  const offset = parseInt(searchParams.get('offset') || '0', 10);
  const search = searchParams.get('search') || undefined;
  const days = parseInt(searchParams.get('days') || String(DEFAULT_DAYS), 10) || DEFAULT_DAYS;

  const users = await getUserSummaries(limit, offset, search, days);
  return NextResponse.json(users);
}

export const GET = wrapRouteHandlerWithSentry(handler, {
  method: 'GET',
  parameterizedRoute: '/api/users',
});
