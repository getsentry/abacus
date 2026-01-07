import { NextResponse } from 'next/server';
import { wrapRouteHandlerWithSentry } from '@sentry/nextjs';
import { getUserSummaries } from '@/lib/queries';
import { getSession } from '@/lib/auth';
import { isValidDateString } from '@/lib/utils';

async function handler(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limitParsed = parseInt(searchParams.get('limit') || '50', 10);
  const limit = Number.isNaN(limitParsed) ? 50 : Math.min(limitParsed, 100);
  const offsetParsed = parseInt(searchParams.get('offset') || '0', 10);
  const offset = Number.isNaN(offsetParsed) ? 0 : offsetParsed;
  const search = searchParams.get('search') || undefined;
  const startDate = searchParams.get('startDate') || undefined;
  const endDate = searchParams.get('endDate') || undefined;

  // Validate date parameters
  if (startDate && !isValidDateString(startDate)) {
    return NextResponse.json({ error: 'Invalid startDate format. Use YYYY-MM-DD.' }, { status: 400 });
  }
  if (endDate && !isValidDateString(endDate)) {
    return NextResponse.json({ error: 'Invalid endDate format. Use YYYY-MM-DD.' }, { status: 400 });
  }

  const users = await getUserSummaries(limit, offset, search, startDate, endDate);
  return NextResponse.json(users);
}

export const GET = wrapRouteHandlerWithSentry(handler, {
  method: 'GET',
  parameterizedRoute: '/api/users',
});
