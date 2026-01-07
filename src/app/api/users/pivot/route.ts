import { NextResponse } from 'next/server';
import { wrapRouteHandlerWithSentry } from '@sentry/nextjs';
import { getAllUsersPivot } from '@/lib/queries';
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
  const startDate = searchParams.get('startDate') || undefined;
  const endDate = searchParams.get('endDate') || undefined;

  const users = await getAllUsersPivot(sortBy, sortDir, search, startDate, endDate);
  return NextResponse.json(users);
}

export const GET = wrapRouteHandlerWithSentry(handler, {
  method: 'GET',
  parameterizedRoute: '/api/users/pivot',
});
