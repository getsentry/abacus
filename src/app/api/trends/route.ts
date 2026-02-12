import { NextResponse } from 'next/server';
import { wrapRouteHandlerWithSentry } from '@sentry/nextjs';
import { getDailyUsage, getDataCompleteness } from '@/lib/queries';
import { checkAuth } from '@/lib/auth';
import { isValidDateString } from '@/lib/utils';
import { applyProjections } from '@/lib/projection';
import { today } from '@/lib/dateUtils';

async function handler(request: Request) {
  const authError = await checkAuth();
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');

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

  const [trends, completeness] = await Promise.all([
    getDailyUsage(startDate, endDate),
    getDataCompleteness(),
  ]);

  const projectedTrends = applyProjections(trends, completeness, today());

  return NextResponse.json({
    data: projectedTrends,
    completeness,
  });
}

export const GET = wrapRouteHandlerWithSentry(handler, {
  method: 'GET',
  parameterizedRoute: '/api/trends',
});
