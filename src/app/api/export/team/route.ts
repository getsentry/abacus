import { wrapRouteHandlerWithSentry } from '@sentry/nextjs';
import { getAllUsersPivot } from '@/lib/queries';
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

  // Fetch all users (high limit for export)
  const { users } = await getAllUsersPivot(
    'totalTokens',
    'desc',
    search,
    effectiveStartDate,
    effectiveEndDate,
    10000,
    0
  );

  // Define columns for CSV export
  const columns = [
    { key: 'email' as const, label: 'email' },
    { key: 'totalTokens' as const, label: 'total_tokens' },
    { key: 'totalCost' as const, label: 'total_cost' },
    { key: 'claudeCodeTokens' as const, label: 'claude_code_tokens' },
    { key: 'cursorTokens' as const, label: 'cursor_tokens' },
    { key: 'inputTokens' as const, label: 'input_tokens' },
    { key: 'outputTokens' as const, label: 'output_tokens' },
    { key: 'cacheReadTokens' as const, label: 'cache_read_tokens' },
    { key: 'firstActive' as const, label: 'first_active' },
    { key: 'lastActive' as const, label: 'last_active' },
    { key: 'daysActive' as const, label: 'days_active' },
    { key: 'avgTokensPerDay' as const, label: 'avg_tokens_per_day' },
    { key: 'toolCount' as const, label: 'tool_count' },
    { key: 'hasThinkingModels' as const, label: 'has_thinking_models' },
  ];

  const csv = convertToCsv(users, columns);
  const filename = generateExportFilename('team', effectiveStartDate, effectiveEndDate);

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
  parameterizedRoute: '/api/export/team',
});
