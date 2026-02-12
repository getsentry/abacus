// Dependency-free auth bypass for local development.
// Must stay dependency-free so it can be imported from Edge runtime (proxy.ts).
export const isAuthBypassed =
  process.env.NODE_ENV !== 'production' && process.env.AUTH_BYPASS_LOCAL === 'true';

// Build a fresh mock session each call so dates are never stale in long-running dev servers.
export function createMockSession() {
  const now = new Date();
  return {
    session: {
      id: 'dev-session',
      userId: 'dev-user',
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      createdAt: now,
      updatedAt: now,
      ipAddress: '127.0.0.1',
      userAgent: 'Dev Browser',
      token: 'dev-token',
    },
    user: {
      id: 'dev-user',
      email: `dev@${process.env.NEXT_PUBLIC_DOMAIN || 'localhost'}`,
      name: 'Dev User',
      image: null,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    },
  };
}
