import { NextResponse } from 'next/server';
import { wrapRouteHandlerWithSentry } from '@sentry/nextjs';
import { getDailyUsage, getDataCompleteness } from '@/lib/queries';
import { getSession } from '@/lib/auth';
import { isValidDateString } from '@/lib/utils';
import { applyProjections } from '@/lib/projection';
import { today } from '@/lib/dateUtils';

async function handler(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const localHourParam = searchParams.get('localHour');

  if (!startDate || !endDate) {
    return NextResponse.json({ error: 'startDate and endDate are required' }, { status: 400 });
  }

  // Validate date parameters
  if (!isValidDateString(startDate)) {
    return NextResponse.json({ error: 'Invalid startDate format. Use YYYY-MM-DD.' }, { status: 400 });
  }
  if (!isValidDateString(endDate)) {
    return NextResponse.json({ error: 'Invalid endDate format. Use YYYY-MM-DD.' }, { status: 400 });
  }

  // Parse client's local hour for projection calculation (uses server time as fallback)
  let localHour: number | undefined;
  if (localHourParam) {
    localHour = parseFloat(localHourParam);
    if (isNaN(localHour) || localHour < 0 || localHour >= 24) {
      return NextResponse.json({ error: 'Invalid localHour. Must be a number between 0 and 24.' }, { status: 400 });
    }
  }

  const [trends, completeness] = await Promise.all([
    getDailyUsage(startDate, endDate),
    getDataCompleteness(),
  ]);

  const projectedTrends = applyProjections(trends, completeness, today(), localHour);

  return NextResponse.json({
    data: projectedTrends,
    completeness,
  });
}

export const GET = wrapRouteHandlerWithSentry(handler, {
  method: 'GET',
  parameterizedRoute: '/api/trends',
});
