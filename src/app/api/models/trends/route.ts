import { NextResponse } from 'next/server';
import { wrapRouteHandlerWithSentry } from '@sentry/nextjs';
import { getModelTrends, getToolTrends } from '@/lib/queries';
import { getSession } from '@/lib/auth';
import { isValidDateString } from '@/lib/utils';
import { DEFAULT_DAYS } from '@/lib/constants';

async function handler(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const view = searchParams.get('view') || 'models'; // 'models' or 'tools'

  // Calculate default dates
  const today = new Date();
  const defaultEndDate = today.toISOString().split('T')[0];
  const defaultStartDate = new Date(today.getTime() - DEFAULT_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  const effectiveStartDate = startDate || defaultStartDate;
  const effectiveEndDate = endDate || defaultEndDate;

  if (startDate && !isValidDateString(startDate)) {
    return NextResponse.json({ error: 'Invalid startDate format' }, { status: 400 });
  }
  if (endDate && !isValidDateString(endDate)) {
    return NextResponse.json({ error: 'Invalid endDate format' }, { status: 400 });
  }

  if (view === 'tools') {
    const data = await getToolTrends(effectiveStartDate, effectiveEndDate);
    return NextResponse.json({ trends: data });
  }

  const data = await getModelTrends(effectiveStartDate, effectiveEndDate);
  return NextResponse.json({ trends: data });
}

export const GET = wrapRouteHandlerWithSentry(handler, {
  method: 'GET',
  parameterizedRoute: '/api/models/trends',
});
