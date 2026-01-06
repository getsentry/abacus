import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const AUTH_COOKIE = 'ai_tracker_auth';

function isAuthenticated(request: NextRequest): boolean {
  const adminPassword = process.env.ADMIN_PASSWORD;

  // No password set = no auth required
  if (!adminPassword) {
    return true;
  }

  const authCookie = request.cookies.get(AUTH_COOKIE);
  if (!authCookie?.value) {
    return false;
  }

  // Validate token matches
  const expectedToken = Buffer.from(adminPassword).toString('base64');
  return authCookie.value === expectedToken;
}

export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  // Protected API routes (write operations)
  const protectedApiRoutes = [
    { path: '/api/mappings', methods: ['POST', 'DELETE'] },
    { path: '/api/import', methods: ['POST'] },
    { path: '/api/sync', methods: ['POST'] },
  ];

  // Check if this is a protected API route
  for (const route of protectedApiRoutes) {
    if (pathname === route.path && route.methods.includes(request.method)) {
      if (!isAuthenticated(request)) {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        );
      }
    }
  }

  // Protected pages - redirect to home with auth prompt
  if (pathname === '/settings') {
    if (!isAuthenticated(request)) {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      url.searchParams.set('auth', 'required');
      url.searchParams.set('redirect', '/settings');
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/settings',
    '/api/mappings',
    '/api/import',
    '/api/sync',
  ],
};
