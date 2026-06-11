import { NextResponse } from 'next/server';
import { wrapRouteHandlerWithSentry } from '@sentry/nextjs';
import { checkAuth } from '@/lib/auth';
import { getOpenRouterWorkspaceNames } from '@/lib/openrouter-workspaces';

async function getHandler() {
  const authError = await checkAuth();
  if (authError) return authError;

  return NextResponse.json({ workspaces: getOpenRouterWorkspaceNames() });
}

export const GET = wrapRouteHandlerWithSentry(getHandler, {
  method: 'GET',
  parameterizedRoute: '/api/openrouter/workspaces',
});
