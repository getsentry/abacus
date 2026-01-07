import { NextResponse } from 'next/server';
import { wrapRouteHandlerWithSentry } from '@sentry/nextjs';
import { getAdoptionSummary } from '@/lib/queries';
import { getSession } from '@/lib/auth';
import { isValidDateString } from '@/lib/utils';
import { getPreviousPeriodDates } from '@/lib/comparison';

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

  // Fetch comparison data if requested
  if (includeComparison && startDate && endDate) {
    const { prevStartDate, prevEndDate } = getPreviousPeriodDates(startDate, endDate);
    const [summary, prevSummary] = await Promise.all([
      getAdoptionSummary(startDate, endDate),
      getAdoptionSummary(prevStartDate, prevEndDate),
    ]);
    return NextResponse.json({
      ...summary,
      previousPeriod: {
        avgScore: prevSummary.avgScore,
        activeUsers: prevSummary.activeUsers,
        powerUserCount: prevSummary.stages.power_user.count,
      },
    });
  }

  const summary = await getAdoptionSummary(startDate, endDate);
  return NextResponse.json(summary);
}

export const GET = wrapRouteHandlerWithSentry(handler, {
  method: 'GET',
  parameterizedRoute: '/api/adoption',
});
