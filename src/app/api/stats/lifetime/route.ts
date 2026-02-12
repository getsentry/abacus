import { NextResponse } from 'next/server';
import { wrapRouteHandlerWithSentry } from '@sentry/nextjs';
import { getLifetimeStats } from '@/lib/queries';
import { checkAuth } from '@/lib/auth';

async function handler() {
  const authError = await checkAuth();
  if (authError) return authError;

  const stats = await getLifetimeStats();
  return NextResponse.json(stats);
}

export const GET = wrapRouteHandlerWithSentry(handler, {
  method: 'GET',
  parameterizedRoute: '/api/stats/lifetime',
});
