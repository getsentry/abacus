import { betterAuth } from 'better-auth';
import { Pool } from '@neondatabase/serverless';
import { headers } from 'next/headers';

// Create database pool for better-auth
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
});

export const auth = betterAuth({
  database: pool,
  basePath: '/api/auth',

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

// Helper to get session in server components
export async function getSession() {
  return auth.api.getSession({
    headers: await headers(),
  });
}

// Helper to require session (throws if not authenticated)
export async function requireSession() {
  const session = await getSession();
  if (!session) {
    throw new Error('Unauthorized');
  }
  return session;
}
