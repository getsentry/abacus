import { NextResponse } from 'next/server';
import { wrapRouteHandlerWithSentry } from '@sentry/nextjs';
import {
  getRepositoryByFullName,
  getRepositoryDetails,
  getRepositoryDetailsWithComparison,
  getRepositoryCommits,
  getRepositoryAuthors,
  getRepositoryDailyStats,
} from '@/lib/queries';
import { getSession } from '@/lib/auth';
import { isValidDateString } from '@/lib/utils';

async function handler(
  request: Request,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { slug } = await params;

  // Expect slug like ['github', 'getsentry', 'sentry'] or ['github', 'getsentry/sentry']
  if (!slug || slug.length < 2) {
    return NextResponse.json({ error: 'Invalid repository path' }, { status: 400 });
  }

  const source = slug[0];
  const fullName = slug.slice(1).join('/');

  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const commitsLimit = parseInt(searchParams.get('commitsLimit') || '50');
  const commitsOffset = parseInt(searchParams.get('commitsOffset') || '0');
  const aiFilter = (searchParams.get('aiFilter') || 'all') as 'all' | 'ai' | 'human';
  const includeComparison = searchParams.get('comparison') === 'true';

  if (startDate && !isValidDateString(startDate)) {
    return NextResponse.json({ error: 'Invalid startDate format. Use YYYY-MM-DD.' }, { status: 400 });
  }
  if (endDate && !isValidDateString(endDate)) {
    return NextResponse.json({ error: 'Invalid endDate format. Use YYYY-MM-DD.' }, { status: 400 });
  }

  // Find the repository
  const repo = await getRepositoryByFullName(source, fullName);
  if (!repo) {
    return NextResponse.json({ error: 'Repository not found' }, { status: 404 });
  }

  // Fetch all data in parallel
  const [details, commitsData, authors, dailyStats] = await Promise.all([
    includeComparison && startDate && endDate
      ? getRepositoryDetailsWithComparison(repo.id, startDate, endDate)
      : getRepositoryDetails(repo.id, startDate || undefined, endDate || undefined),
    getRepositoryCommits(repo.id, startDate || undefined, endDate || undefined, commitsLimit, commitsOffset, aiFilter),
    getRepositoryAuthors(repo.id, startDate || undefined, endDate || undefined),
    startDate && endDate
      ? getRepositoryDailyStats(repo.id, startDate, endDate)
      : Promise.resolve([]),
  ]);

  if (!details) {
    return NextResponse.json({ error: 'Repository not found' }, { status: 404 });
  }

  return NextResponse.json({
    details,
    commits: commitsData.commits,
    totalCommits: commitsData.totalCount,
    authors,
    dailyStats,
  });
}

export const GET = wrapRouteHandlerWithSentry(handler, {
  method: 'GET',
  parameterizedRoute: '/api/repositories/[...slug]',
});
