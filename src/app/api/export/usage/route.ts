import { wrapRouteHandlerWithSentry } from '@sentry/nextjs';
import { getModelTrends, getToolTrends } from '@/lib/queries';
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
  const view = searchParams.get('view') || 'models';

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

  let csv: string;
  let filename: string;

  if (view === 'tools') {
    const data = await getToolTrends(effectiveStartDate, effectiveEndDate);
    const columns = [
      { key: 'date' as const, label: 'date' },
      { key: 'tool' as const, label: 'tool' },
      { key: 'tokens' as const, label: 'tokens' },
      { key: 'cost' as const, label: 'cost' },
      { key: 'users' as const, label: 'users' },
    ];
    csv = convertToCsv(data, columns);
    filename = generateExportFilename('usage_tools', effectiveStartDate, effectiveEndDate);
  } else {
    const data = await getModelTrends(effectiveStartDate, effectiveEndDate);
    const columns = [
      { key: 'date' as const, label: 'date' },
      { key: 'model' as const, label: 'model' },
      { key: 'tokens' as const, label: 'tokens' },
      { key: 'inputTokens' as const, label: 'input_tokens' },
      { key: 'outputTokens' as const, label: 'output_tokens' },
      { key: 'cost' as const, label: 'cost' },
      { key: 'tool' as const, label: 'tool' },
    ];
    csv = convertToCsv(data, columns);
    filename = generateExportFilename('usage_models', effectiveStartDate, effectiveEndDate);
  }

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
  parameterizedRoute: '/api/export/usage',
});
