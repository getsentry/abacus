import { NextResponse } from 'next/server';
import { wrapRouteHandlerWithSentry } from '@sentry/nextjs';
import { getDailyCommitStats, getCommitStats, getCommitStatsWithComparison } from '@/lib/queries';
import { getSession } from '@/lib/auth';
import { isValidDateString } from '@/lib/utils';

async function handler(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const includeComparison = searchParams.get('comparison') === 'true';

  if (!startDate || !endDate) {
    return NextResponse.json(
      { error: 'startDate and endDate are required' },
      { status: 400 }
    );
  }

  if (!isValidDateString(startDate) || !isValidDateString(endDate)) {
    return NextResponse.json(
      { error: 'Invalid date format. Use YYYY-MM-DD.' },
      { status: 400 }
    );
  }

  const [dailyStats, overallStats] = await Promise.all([
    getDailyCommitStats(startDate, endDate),
    includeComparison
      ? getCommitStatsWithComparison(startDate, endDate)
      : getCommitStats(startDate, endDate),
  ]);

  return NextResponse.json({
    daily: dailyStats,
    overall: overallStats,
  });
}

export const GET = wrapRouteHandlerWithSentry(handler, {
  method: 'GET',
  parameterizedRoute: '/api/commits/trends',
});
