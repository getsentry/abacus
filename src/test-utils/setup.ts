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

// Store references for transaction management and db access
let pgliteClient: import('@electric-sql/pglite').PGlite | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pgliteDb: any = null;

// Shared reference for db mock (allows @/lib/db mock to access pgliteDb)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbRef: { current: any } = { current: null };

// Track transaction depth for savepoint-based nested transaction support
// Depth 0 = no transaction, 1 = test transaction, 2+ = nested (uses savepoints)
let transactionDepth = 0;

vi.mock('@vercel/postgres', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const schema = await import('../lib/schema');

  // Create in-memory PGlite instance
  pgliteClient = new PGlite();
  pgliteDb = drizzle(pgliteClient, { schema });
  dbRef.current = pgliteDb;

  // Push schema to in-memory database
  const { pushSchema } = await import('drizzle-kit/api');
  const { apply } = await pushSchema(schema, pgliteDb as never);
  await apply();

  // Helper to handle transaction commands with savepoint support
  const handleTransactionCommand = async (query: string): Promise<{ rows: unknown[] } | null> => {
    const upperQuery = query.trim().toUpperCase();

    if (upperQuery === 'BEGIN' || upperQuery === 'BEGIN TRANSACTION' || upperQuery === 'START TRANSACTION') {
      if (transactionDepth > 0) {
        // Already in a transaction - use savepoint instead
        transactionDepth++;
        await pgliteClient!.query(`SAVEPOINT sp_${transactionDepth}`);
        return { rows: [] };
      }
      transactionDepth = 1;
      await pgliteClient!.query('BEGIN');
      return { rows: [] };
    }

    if (upperQuery === 'COMMIT' || upperQuery === 'END' || upperQuery === 'END TRANSACTION') {
      if (transactionDepth > 1) {
        // Release savepoint for nested transaction
        await pgliteClient!.query(`RELEASE SAVEPOINT sp_${transactionDepth}`);
        transactionDepth--;
        return { rows: [] };
      }
      if (transactionDepth === 1) {
        transactionDepth = 0;
        await pgliteClient!.query('COMMIT');
        return { rows: [] };
      }
      return { rows: [] };
    }

    if (upperQuery === 'ROLLBACK') {
      if (transactionDepth > 1) {
        // Rollback to savepoint for nested transaction
        await pgliteClient!.query(`ROLLBACK TO SAVEPOINT sp_${transactionDepth}`);
        transactionDepth--;
        return { rows: [] };
      }
      if (transactionDepth === 1) {
        transactionDepth = 0;
        await pgliteClient!.query('ROLLBACK');
        return { rows: [] };
      }
      return { rows: [] };
    }

    return null; // Not a transaction command
  };

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

    // Handle transaction commands with savepoint support
    const txResult = await handleTransactionCommand(query);
    if (txResult !== null) return txResult;

    const result = await pgliteClient!.query(query, values as never[]);
    return { rows: result.rows };
  };

  sql.query = async (text: string, params?: unknown[]) => {
    // Handle transaction commands with savepoint support
    const txResult = await handleTransactionCommand(text);
    if (txResult !== null) return txResult;

    const result = await pgliteClient!.query(text, params as never[]);
    return { rows: result.rows };
  };

  return { sql };
});

// Mock @/lib/db to use the PGlite-backed Drizzle instance
// This enables Drizzle query builder methods (db.insert, db.select, etc.) in tests
vi.mock('@/lib/db', async (importOriginal) => {
  const original = await importOriginal<typeof import('../lib/db')>();
  const schema = await import('../lib/schema');
  const drizzleOrm = await import('drizzle-orm');

  return {
    // Proxy db to always use current pgliteDb (handles initialization timing)
    get db() {
      if (!dbRef.current) {
        throw new Error('Database not initialized - ensure @vercel/postgres mock runs first');
      }
      return dbRef.current;
    },
    // Re-export schema
    ...schema,
    // Re-export sql helper from drizzle-orm
    sql: drizzleOrm.sql,
    // Keep vercelSql for backward compatibility (proxies to pgliteDb)
    get vercelSql() {
      return dbRef.current;
    },
  };
});

// Transaction management for test isolation
beforeEach(async () => {
  if (pgliteClient) {
    transactionDepth = 1; // Mark that we're in the test transaction
    await pgliteClient.query('BEGIN');
  }
});

afterEach(async () => {
  if (pgliteClient) {
    transactionDepth = 0; // Reset for next test
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
