import { NextResponse } from 'next/server';
import { wrapRouteHandlerWithSentry } from '@sentry/nextjs';
import { getAllUsersPivot } from '@/lib/queries';
import { DEFAULT_DAYS } from '@/lib/constants';
import { getSession } from '@/lib/auth';

async function handler(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const sortBy = searchParams.get('sortBy') || 'totalTokens';
  const sortDir = (searchParams.get('sortDir') || 'desc') as 'asc' | 'desc';
  const search = searchParams.get('search') || undefined;
  const days = parseInt(searchParams.get('days') || String(DEFAULT_DAYS), 10) || DEFAULT_DAYS;

  const users = await getAllUsersPivot(sortBy, sortDir, search, days);
  return NextResponse.json(users);
}

export const GET = wrapRouteHandlerWithSentry(handler, {
  method: 'GET',
  parameterizedRoute: '/api/users/pivot',
});
