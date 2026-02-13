import { NextResponse } from 'next/server';
import { wrapRouteHandlerWithSentry } from '@sentry/nextjs';
import { getCommitStats, getCommitStatsWithComparison } from '@/lib/queries';
import { checkAuth } from '@/lib/auth';
import { isValidDateString } from '@/lib/utils';

async function handler(request: Request) {
  const authError = await checkAuth();
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const comparison = searchParams.get('comparison') === 'true';

  // Validate date parameters if provided
  if (startDate && !isValidDateString(startDate)) {
    return NextResponse.json({ error: 'Invalid startDate format. Use YYYY-MM-DD.' }, { status: 400 });
  }
  if (endDate && !isValidDateString(endDate)) {
    return NextResponse.json({ error: 'Invalid endDate format. Use YYYY-MM-DD.' }, { status: 400 });
  }

  const stats = comparison && startDate && endDate
    ? await getCommitStatsWithComparison(startDate, endDate)
    : await getCommitStats(startDate || undefined, endDate || undefined);
  return NextResponse.json(stats);
}

export const GET = wrapRouteHandlerWithSentry(handler, {
  method: 'GET',
  parameterizedRoute: '/api/stats/commits',
});
