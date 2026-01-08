import { NextResponse } from 'next/server';
import { wrapRouteHandlerWithSentry } from '@sentry/nextjs';
import { backfillGitHubUsage, getGitHubBackfillState } from '@/lib/sync/github';

// Target: backfill 90 days of history
const BACKFILL_DAYS = 90;
const BACKFILL_TARGET_DATE = new Date(Date.now() - BACKFILL_DAYS * 24 * 60 * 60 * 1000)
  .toISOString()
  .split('T')[0];

/**
 * GitHub Backfill Cron - runs periodically to gradually backfill commit history
 *
 * - Checks if we've already backfilled to the target date
 * - If not, runs backfill for all repos in the org
 * - Saves progress and aborts on rate limit for next run
 * - No-ops once target date is reached
 */
async function handler(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check if GitHub is configured (either App or personal token)
  const hasGitHubApp = process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY && process.env.GITHUB_APP_INSTALLATION_ID;
  const hasGitHubToken = process.env.GITHUB_TOKEN;
  if (!hasGitHubApp && !hasGitHubToken) {
    return NextResponse.json({
      success: true,
      service: 'github',
      skipped: true,
      reason: 'GitHub not configured (set GITHUB_APP_* or GITHUB_TOKEN)',
    });
  }

  // Check current backfill state
  const { oldestDate, isComplete } = await getGitHubBackfillState();

  // If we've already reached the target or marked complete, nothing to do
  if (isComplete || (oldestDate && oldestDate <= BACKFILL_TARGET_DATE)) {
    return NextResponse.json({
      success: true,
      status: 'complete',
      message: isComplete
        ? `Backfill complete (oldest: ${oldestDate})`
        : `Backfill complete - already reached ${oldestDate}`,
      targetDate: BACKFILL_TARGET_DATE,
      currentOldestDate: oldestDate,
    });
  }

  // Run backfill
  const result = await backfillGitHubUsage(BACKFILL_TARGET_DATE);

  // Get updated state
  const { oldestDate: newOldestDate, isComplete: nowComplete } = await getGitHubBackfillState();

  const status = result.rateLimited
    ? 'rate_limited'
    : nowComplete || (newOldestDate && newOldestDate <= BACKFILL_TARGET_DATE)
      ? 'complete'
      : 'in_progress';

  return NextResponse.json({
    success: result.success,
    status,
    targetDate: BACKFILL_TARGET_DATE,
    previousOldestDate: oldestDate,
    currentOldestDate: newOldestDate,
    result: {
      commitsProcessed: result.commitsProcessed,
      aiAttributedCommits: result.aiAttributedCommits,
      rateLimited: result.rateLimited,
      errors: result.errors.slice(0, 5),
    },
  });
}

export const GET = wrapRouteHandlerWithSentry(handler, {
  method: 'GET',
  parameterizedRoute: '/api/cron/backfill-github',
});

export const POST = wrapRouteHandlerWithSentry(handler, {
  method: 'POST',
  parameterizedRoute: '/api/cron/backfill-github',
});
