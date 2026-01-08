import { NextResponse } from 'next/server';
import { wrapRouteHandlerWithSentry } from '@sentry/nextjs';
import { syncGitHubMemberEmails, hasUnattributedCommits } from '@/lib/sync';

/**
 * GitHub Mappings Cron Sync
 *
 * Syncs GitHub org member emails using the GraphQL API.
 * Only runs if there are unattributed commits (commits with author_id but no mapping).
 *
 * Uses `organizationVerifiedDomainEmails` GraphQL field to fetch verified
 * domain emails for org members. Requires GitHub App with `Members: Read-only`.
 */
async function handler(request: Request) {
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
      service: 'github-mappings',
      skipped: true,
      reason: 'GitHub not configured (set GITHUB_APP_* or GITHUB_TOKEN)'
    });
  }

  // Check if there are unattributed commits
  const needsSync = await hasUnattributedCommits();

  if (!needsSync) {
    return NextResponse.json({
      success: true,
      service: 'github-mappings',
      skipped: true,
      reason: 'No unattributed commits'
    });
  }

  const result = await syncGitHubMemberEmails();

  return NextResponse.json({
    success: result.success,
    service: 'github-mappings',
    result: {
      usersFound: result.usersFound,
      mappingsCreated: result.mappingsCreated,
      errors: result.errors.slice(0, 5)
    }
  });
}

export const GET = wrapRouteHandlerWithSentry(handler, {
  method: 'GET',
  parameterizedRoute: '/api/cron/sync-github-mappings',
});

export const POST = wrapRouteHandlerWithSentry(handler, {
  method: 'POST',
  parameterizedRoute: '/api/cron/sync-github-mappings',
});
