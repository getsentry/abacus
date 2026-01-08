import { wrapRouteHandlerWithSentry } from '@sentry/nextjs';
import { getRepositoryPivot } from '@/lib/queries';
import { getSession } from '@/lib/auth';
import { isValidDateString } from '@/lib/utils';
import { convertToCsv, generateExportFilename } from '@/lib/csv';
import { DEFAULT_DAYS } from '@/lib/constants';

async function handler(request: Request) {
  const session = await getSession();
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const search = searchParams.get('search') || undefined;

  // Calculate default dates
  const today = new Date();
  const defaultEndDate = today.toISOString().split('T')[0];
  const defaultStartDate = new Date(today.getTime() - DEFAULT_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  const effectiveStartDate = startDate || defaultStartDate;
  const effectiveEndDate = endDate || defaultEndDate;

  if (startDate && !isValidDateString(startDate)) {
    return new Response(JSON.stringify({ error: 'Invalid startDate format' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (endDate && !isValidDateString(endDate)) {
    return new Response(JSON.stringify({ error: 'Invalid endDate format' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Fetch all repositories (high limit for export)
  const { repositories } = await getRepositoryPivot(
    'totalCommits',
    'desc',
    search,
    effectiveStartDate,
    effectiveEndDate,
    10000,
    0
  );

  // Define columns for CSV export
  const columns = [
    { key: 'fullName' as const, label: 'repository' },
    { key: 'source' as const, label: 'source' },
    { key: 'totalCommits' as const, label: 'total_commits' },
    { key: 'aiAssistedCommits' as const, label: 'ai_assisted_commits' },
    { key: 'aiAssistanceRate' as const, label: 'ai_assistance_rate' },
    { key: 'totalAdditions' as const, label: 'total_additions' },
    { key: 'totalDeletions' as const, label: 'total_deletions' },
    { key: 'uniqueAuthors' as const, label: 'unique_authors' },
    { key: 'firstCommit' as const, label: 'first_commit' },
    { key: 'lastCommit' as const, label: 'last_commit' },
    { key: 'claudeCodeCommits' as const, label: 'claude_code_commits' },
    { key: 'cursorCommits' as const, label: 'cursor_commits' },
    { key: 'copilotCommits' as const, label: 'copilot_commits' },
  ];

  const csv = convertToCsv(repositories, columns);
  const filename = generateExportFilename('commits', effectiveStartDate, effectiveEndDate);

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}

export const GET = wrapRouteHandlerWithSentry(handler, {
  method: 'GET',
  parameterizedRoute: '/api/export/commits',
});
