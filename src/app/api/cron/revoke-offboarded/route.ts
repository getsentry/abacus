import { and, eq, isNull } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { wrapRouteHandlerWithSentry } from '@sentry/nextjs';
import { db, openrouterKeys } from '@/lib/db';
import { updateOpenRouterKey } from '@/lib/openrouter';
import { checkAccountStatus, isGoogleDirectoryConfigured } from '@/lib/google-directory';

export const maxDuration = 300;

const CONCURRENCY_LIMIT = 5;

type JobSummary = {
  checked: number;
  inactive: number;
  keysDisabled: number;
  skipped: number;
  errors: string[];
};

function serializeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

async function getDistinctEmails(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ email: openrouterKeys.email })
    .from(openrouterKeys)
    .where(isNull(openrouterKeys.revokedAt));

  return rows.map((row) => row.email);
}

async function handleEmail(email: string): Promise<JobSummary> {
  const summary: JobSummary = {
    checked: 1,
    inactive: 0,
    keysDisabled: 0,
    skipped: 0,
    errors: [],
  };

  let status: 'active' | 'inactive' | 'unknown';

  try {
    status = await checkAccountStatus(email);
  } catch (error) {
    summary.skipped += 1;
    summary.errors.push(`Could not check directory status for ${email}: ${serializeError(error)}`);
    return summary;
  }

  if (status === 'unknown') {
    summary.skipped += 1;
    return summary;
  }

  if (status !== 'inactive') {
    return summary;
  }

  summary.inactive += 1;

  const keys = await db
    .select({ hash: openrouterKeys.hash })
    .from(openrouterKeys)
    .where(and(eq(openrouterKeys.email, email), isNull(openrouterKeys.revokedAt)));

  for (const { hash } of keys) {
    try {
      // Disable by hash works account-wide; no workspace context needed
      await updateOpenRouterKey(hash, { disabled: true });
      await db
        .update(openrouterKeys)
        .set({ revokedAt: new Date() })
        .where(eq(openrouterKeys.hash, hash));
      summary.keysDisabled += 1;
    } catch (error) {
      summary.errors.push(`Failed to disable key ${hash} for ${email}: ${serializeError(error)}`);
    }
  }

  return summary;
}

async function handler(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isGoogleDirectoryConfigured()) {
    return NextResponse.json({
      success: true,
      service: 'revoke-offboarded',
      skipped: true,
      reason: 'Google Directory not configured',
    });
  }

  const emails = await getDistinctEmails();

  let checked = 0;
  let inactive = 0;
  let keysDisabled = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (let i = 0; i < emails.length; i += CONCURRENCY_LIMIT) {
    const chunk = emails.slice(i, i + CONCURRENCY_LIMIT);
    const chunkSummaries = await Promise.all(chunk.map(handleEmail));

    for (const summary of chunkSummaries) {
      checked += summary.checked;
      inactive += summary.inactive;
      keysDisabled += summary.keysDisabled;
      skipped += summary.skipped;
      errors.push(...summary.errors);
    }
  }

  return NextResponse.json({
    success: true,
    service: 'revoke-offboarded',
    checked,
    inactive,
    keysDisabled,
    skipped,
    errors: errors.slice(0, 5),
  });
}

export const GET = wrapRouteHandlerWithSentry(handler, {
  method: 'GET',
  parameterizedRoute: '/api/cron/revoke-offboarded',
});

export const POST = wrapRouteHandlerWithSentry(handler, {
  method: 'POST',
  parameterizedRoute: '/api/cron/revoke-offboarded',
});
