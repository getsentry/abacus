import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';

// Auth bypass for local development (set AUTH_BYPASS_LOCAL=true in .env.local)
const isAuthBypassed =
  process.env.NODE_ENV !== 'production' && process.env.AUTH_BYPASS_LOCAL === 'true';

/**
 * Next.js 16 Proxy (formerly Middleware)
 *
 * In Next.js 16, middleware.ts was renamed to proxy.ts to clarify its role
 * as a network boundary layer. This file must be named proxy.ts and export
 * a function named `proxy`.
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/proxy
 */
export function proxy(request: NextRequest) {
  // Skip all auth checks when bypass is enabled
  if (isAuthBypassed) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  // Public routes that don't require authentication
  const publicPaths = [
    '/api/auth', // Better-auth endpoints (login, callback, logout, etc.)
    '/api/cron', // Cron jobs use CRON_SECRET for auth
    '/api/webhooks', // Webhooks use their own signature verification
    '/sign-in', // Sign-in page
  ];

  // Check if path starts with any public path
  const isPublicPath = publicPaths.some((path) => pathname.startsWith(path));

  if (isPublicPath) {
    return NextResponse.next();
  }

  // For all other routes, check for session cookie
  const sessionCookie = getSessionCookie(request, {
    cookiePrefix: 'ai_tracker',
  });

  if (!sessionCookie) {
    // For API routes, return 401
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // For pages, redirect to sign-in
    const signInUrl = new URL('/sign-in', request.url);
    signInUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(signInUrl);
  }

  // Cookie exists - allow request
  // Full session validation happens in server components/API routes
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all routes except static files and Next.js internals
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
