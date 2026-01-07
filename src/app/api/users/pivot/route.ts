import { NextResponse } from 'next/server';
import { wrapRouteHandlerWithSentry } from '@sentry/nextjs';
import { getAllUsersPivot } from '@/lib/queries';
import { getSession } from '@/lib/auth';
import { isValidDateString } from '@/lib/utils';

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
  const limit = Math.min(parseInt(searchParams.get('limit') || '500', 10), 1000);
  const offset = parseInt(searchParams.get('offset') || '0', 10);

  // Validate date parameters
  if (startDate && !isValidDateString(startDate)) {
    return NextResponse.json({ error: 'Invalid startDate format. Use YYYY-MM-DD.' }, { status: 400 });
  }
  if (endDate && !isValidDateString(endDate)) {
    return NextResponse.json({ error: 'Invalid endDate format. Use YYYY-MM-DD.' }, { status: 400 });
  }

  const result = await getAllUsersPivot(sortBy, sortDir, search, startDate, endDate, limit, offset);
  return NextResponse.json(result);
}

export const GET = wrapRouteHandlerWithSentry(handler, {
  method: 'GET',
  parameterizedRoute: '/api/users/pivot',
});
