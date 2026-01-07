import { NextResponse } from 'next/server';
import { wrapRouteHandlerWithSentry } from '@sentry/nextjs';
import { getOverallStats, getOverallStatsWithComparison, getUnattributedStats } from '@/lib/queries';
import { getSession } from '@/lib/auth';
import { isValidDateString } from '@/lib/utils';

async function handler(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get('startDate') || undefined;
  const endDate = searchParams.get('endDate') || undefined;
  const includeComparison = searchParams.get('comparison') === 'true';

  // Validate date parameters
  if (startDate && !isValidDateString(startDate)) {
    return NextResponse.json({ error: 'Invalid startDate format. Use YYYY-MM-DD.' }, { status: 400 });
  }
  if (endDate && !isValidDateString(endDate)) {
    return NextResponse.json({ error: 'Invalid endDate format. Use YYYY-MM-DD.' }, { status: 400 });
  }

  // Use comparison query if requested and both dates are provided
  if (includeComparison && startDate && endDate) {
    const [stats, unattributed] = await Promise.all([
      getOverallStatsWithComparison(startDate, endDate),
      getUnattributedStats()
    ]);
    return NextResponse.json({ ...stats, unattributed });
  }

  const [stats, unattributed] = await Promise.all([
    getOverallStats(startDate, endDate),
    getUnattributedStats()
  ]);
  return NextResponse.json({ ...stats, unattributed });
}

export const GET = wrapRouteHandlerWithSentry(handler, {
  method: 'GET',
  parameterizedRoute: '/api/stats',
});
