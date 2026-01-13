import { NextResponse } from 'next/server';
import { wrapRouteHandlerWithSentry } from '@sentry/nextjs';
import { getUserRawUsage, getUserUsageFilters, resolveUserEmail } from '@/lib/queries';
import { getSession } from '@/lib/auth';
import { isValidDateString } from '@/lib/utils';

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
  const parsedPage = parseInt(searchParams.get('page') || '0', 10);
  const parsedLimit = parseInt(searchParams.get('limit') || '50', 10);
  const page = Number.isNaN(parsedPage) ? 0 : Math.max(0, parsedPage);
  const limit = Number.isNaN(parsedLimit) ? 50 : Math.min(Math.max(1, parsedLimit), 100);
  const tool = searchParams.get('tool') || undefined;
  const model = searchParams.get('model') || undefined;

  // Validate required date parameters
  if (!startDate || !endDate) {
    return NextResponse.json({ error: 'startDate and endDate are required' }, { status: 400 });
  }
  if (!isValidDateString(startDate)) {
    return NextResponse.json({ error: 'Invalid startDate format. Use YYYY-MM-DD.' }, { status: 400 });
  }
  if (!isValidDateString(endDate)) {
    return NextResponse.json({ error: 'Invalid endDate format. Use YYYY-MM-DD.' }, { status: 400 });
  }

  const decoded = decodeURIComponent(usernameOrEmail);

  // Resolve username to full email if needed
  const email = await resolveUserEmail(decoded);
  if (!email) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const [rawUsage, filters] = await Promise.all([
    getUserRawUsage(email, startDate, endDate, page, limit, tool, model),
    getUserUsageFilters(email, startDate, endDate),
  ]);

  return NextResponse.json({
    records: rawUsage.records,
    totalCount: rawUsage.totalCount,
    availableTools: filters.tools,
    availableModels: filters.models,
  });
}

export const GET = wrapRouteHandlerWithSentry(handler, {
  method: 'GET',
  parameterizedRoute: '/api/users/[email]/raw-usage',
});
