import { vi, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { server } from './msw-handlers';

/**
 * Global Test Setup
 *
 * Uses PGlite for in-memory PostgreSQL testing:
 * - No Docker required
 * - Fast (WebAssembly PostgreSQL)
 * - Real PostgreSQL behavior
 * - Automatic schema push
 * - Transaction isolation per test
 */

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
// MSW Setup for External API Mocking
// =============================================================================

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
