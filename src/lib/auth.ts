import { betterAuth } from 'better-auth';
import { oAuthProxy } from 'better-auth/plugins';
import { Pool } from '@neondatabase/serverless';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { isAuthBypassed } from '@/lib/auth-bypass';

// Create database pool for better-auth
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
});

export const auth = betterAuth({
  database: pool,
  basePath: '/api/auth',

  // Proxy OAuth through production for Vercel preview deployments: Google
  // does not allow wildcard redirect URIs, so only production and localhost
  // callback URLs are registered with the OAuth client. The plugin is a
  // no-op when the request origin matches productionURL. Requires
  // OAUTH_PROXY_SECRET to be set to the SAME value in production and
  // preview environments.
  //
  // Local development does NOT use the proxy — localhost redirect URIs are
  // allowed by Google, so register
  // http://localhost:3000/api/auth/callback/google on the OAuth client and
  // log in directly. (The proxy would also require the deployed production
  // server to already run this plugin, and going direct keeps local login
  // independent of production.)
  plugins:
    process.env.NODE_ENV === 'production'
      ? [
          oAuthProxy({
            productionURL: 'https://abacus.sentry.dev',
            secret: process.env.OAUTH_PROXY_SECRET,
          }),
        ]
      : [],

  // Origins allowed to complete the proxied OAuth flow. Vercel preview
  // deployments are served on both *.vercel.app and the *.sentry.dev
  // custom domain (e.g. abacus-git-<branch>.sentry.dev).
  trustedOrigins: ['http://localhost:3000', 'https://*.vercel.app', 'https://*.sentry.dev'],

  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      // Restrict Google account picker to specified domain
      hd: process.env.NEXT_PUBLIC_DOMAIN,
    },
  },

  session: {
    expiresIn: 60 * 60 * 12, // 12 hours
    updateAge: 60 * 60, // Refresh if older than 1 hour
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // 5 minute cache
    },
  },

  advanced: {
    cookiePrefix: 'ai_tracker',
    useSecureCookies: process.env.NODE_ENV === 'production',
  },

  // Validate domain on user creation (server-side enforcement)
  // The hd parameter only filters Google's UI - this enforces it
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const allowedDomain = process.env.NEXT_PUBLIC_DOMAIN;
          if (!allowedDomain) {
            // NEXT_PUBLIC_DOMAIN not configured - reject all signups for safety
            console.error('NEXT_PUBLIC_DOMAIN env var not set - rejecting signup');
            return false;
          }

          const email = user.email;
          if (!email) {
            return false; // Reject users without email
          }

          const emailDomain = email.split('@')[1];
          if (emailDomain !== allowedDomain) {
            // Reject non-domain users
            return false;
          }
        },
      },
    },
  },
});

// Helper to get session in server components.
// Returns the session object or null if not authenticated.
export async function getSession() {
  if (isAuthBypassed) return null;
  return auth.api.getSession({ headers: await headers() });
}

// Auth guard for API routes.
// Returns null when authorized (session exists or auth bypass is active),
// or a 401 Response when unauthorized.
export async function checkAuth(): Promise<Response | null> {
  if (isAuthBypassed) return null;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return null;
}

// Helper to require session (throws if not authenticated).
// When auth bypass is active, returns null since no real session exists.
export async function requireSession() {
  if (isAuthBypassed) return null;
  const session = await getSession();
  if (!session) throw new Error('Unauthorized');
  return session;
}
