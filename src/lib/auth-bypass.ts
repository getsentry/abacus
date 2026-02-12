// Dependency-free auth bypass for local development.
// Must stay dependency-free so it can be imported from Edge runtime (proxy.ts).
export const isAuthBypassed =
  process.env.NODE_ENV !== 'production' && process.env.AUTH_BYPASS_LOCAL === 'true';
