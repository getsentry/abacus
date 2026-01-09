import { NextResponse } from 'next/server';
import { wrapRouteHandlerWithSentry } from '@sentry/nextjs';
import { getUserDetails, getUserDetailsExtended, getUserLifetimeStats, getUserCommitStats, resolveUserEmail } from '@/lib/queries';
import { getSession } from '@/lib/auth';
import { isValidDateString } from '@/lib/utils';
import { getPreviousPeriodDates } from '@/lib/comparison';

async function handler(
  request: Request,
  { params }: { params: Promise<{ email: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { email: usernameOrEmail } = await params;
  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const includeComparison = searchParams.get('comparison') === 'true';

  // Validate date parameters
  if (startDate && !isValidDateString(startDate)) {
    return NextResponse.json({ error: 'Invalid startDate format. Use YYYY-MM-DD.' }, { status: 400 });
  }
  if (endDate && !isValidDateString(endDate)) {
    return NextResponse.json({ error: 'Invalid endDate format. Use YYYY-MM-DD.' }, { status: 400 });
  }

  const decoded = decodeURIComponent(usernameOrEmail);

  // Resolve username to full email if needed
  const email = await resolveUserEmail(decoded);
  if (!email) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  // Fetch comparison data if requested
  if (includeComparison && startDate && endDate) {
    const { prevStartDate, prevEndDate } = getPreviousPeriodDates(startDate, endDate);
    const [details, prevDetails, lifetime, commitStats] = await Promise.all([
      getUserDetailsExtended(email, startDate, endDate),
      getUserDetailsExtended(email, prevStartDate, prevEndDate),
      getUserLifetimeStats(email),
      getUserCommitStats(email, startDate, endDate),
    ]);

    if (!details.summary) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      ...details,
      lifetime,
      commitStats,
      previousPeriod: prevDetails.summary ? {
        totalTokens: Number(prevDetails.summary.totalTokens),
        totalCost: Number(prevDetails.summary.totalCost),
      } : undefined,
    });
  }

  // Use extended query if date parameters are provided, and always fetch lifetime stats
  const [details, lifetime, commitStats] = await Promise.all([
    startDate && endDate
      ? getUserDetailsExtended(email, startDate, endDate)
      : getUserDetails(email),
    getUserLifetimeStats(email),
    getUserCommitStats(email, startDate || undefined, endDate || undefined),
  ]);

  if (!details.summary) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }
  return NextResponse.json({ ...details, lifetime, commitStats });
}

export const GET = wrapRouteHandlerWithSentry(handler, {
  method: 'GET',
  parameterizedRoute: '/api/users/[email]',
});
