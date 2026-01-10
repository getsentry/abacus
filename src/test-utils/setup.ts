import { vi, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { server } from './msw-handlers';

// =============================================================================
// Test Environment Variables - Hardcoded defaults for test isolation
// =============================================================================

// Explicitly unset database URLs to ensure PGlite mock is used
delete process.env.POSTGRES_URL;
delete process.env.DATABASE_URL;

// Set test defaults for common env vars (can be overridden with vi.stubEnv)
process.env.CRON_SECRET = 'test-cron-secret';
process.env.GITHUB_WEBHOOK_SECRET = 'test-webhook-secret';
process.env.ANTHROPIC_ADMIN_KEY = 'test-anthropic-key';
process.env.CURSOR_ADMIN_KEY = 'test-cursor-key';

// =============================================================================
// Safety Check - Ensure tests never run against production database
// =============================================================================

const dbUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;
if (dbUrl) {
  try {
    const parsed = new URL(dbUrl);
    const safeHosts = ['localhost', '127.0.0.1', '::1'];
    const isDangerous =
      !safeHosts.includes(parsed.hostname) ||
      parsed.hostname.includes('neon.tech') ||
      parsed.hostname.includes('vercel') ||
      parsed.hostname.includes('supabase') ||
      parsed.hostname.includes('planetscale');

    if (isDangerous) {
      throw new Error(
        `\n\n` +
          `${'='.repeat(70)}\n` +
          `DANGER: Test database URL points to "${parsed.hostname}"\n` +
          `${'='.repeat(70)}\n\n` +
          `Tests must use localhost or leave POSTGRES_URL unset.\n` +
          `The test suite uses PGlite (in-memory) and does not need a real database.\n\n` +
          `If you see this error, you may have loaded .env.local by mistake.\n` +
          `${'='.repeat(70)}\n`
      );
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes('DANGER')) throw e;
    // Invalid URL format - let it pass, will fail elsewhere if actually used
  }
}

// =============================================================================
// PGlite Database Setup - Mock @vercel/postgres with in-memory PGlite
// =============================================================================

// Store references for transaction management
let pgliteClient: import('@electric-sql/pglite').PGlite | null = null;
let pgliteDb: ReturnType<typeof import('drizzle-orm/pglite').drizzle> | null = null;

vi.mock('@vercel/postgres', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const schema = await import('../lib/schema');

  // Create in-memory PGlite instance
  pgliteClient = new PGlite();
  pgliteDb = drizzle(pgliteClient, { schema });

  // Push schema to in-memory database
  const { pushSchema } = await import('drizzle-kit/api');
  const { apply } = await pushSchema(schema, pgliteDb as never);
  await apply();

  // Create sql template function that forwards to PGlite
  // Returns object with .rows to match @vercel/postgres interface
  const sql = async function (strings: TemplateStringsArray, ...values: unknown[]) {
    // Build query string with $1, $2, etc. placeholders
    let query = '';
    strings.forEach((str, i) => {
      query += str;
      if (i < values.length) {
        query += `$${i + 1}`;
      }
    });

    const result = await pgliteClient!.query(query, values as never[]);
    return { rows: result.rows };
  };

  sql.query = async (text: string, params?: unknown[]) => {
    const result = await pgliteClient!.query(text, params as never[]);
    return { rows: result.rows };
  };

  return { sql };
});

// Transaction management for test isolation
beforeEach(async () => {
  if (pgliteClient) {
    await pgliteClient.query('BEGIN');
  }
});

afterEach(async () => {
  if (pgliteClient) {
    await pgliteClient.query('ROLLBACK');
  }
});

afterAll(async () => {
  if (pgliteClient) {
    await pgliteClient.close();
  }
});

// =============================================================================
// Auth Mock - Global mock for @/lib/auth
// =============================================================================

vi.mock('@/lib/auth', () => ({
  getSession: vi.fn().mockResolvedValue(null),
  requireSession: vi.fn().mockRejectedValue(new Error('Unauthorized')),
}));

// =============================================================================
// MSW Setup for External API Mocking
// =============================================================================

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
