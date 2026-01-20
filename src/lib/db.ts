import { drizzle } from 'drizzle-orm/vercel-postgres';
import { sql as vercelSql } from '@vercel/postgres';
import { sql } from 'drizzle-orm';
import * as schema from './schema';

// Create Drizzle client
export const db = drizzle(vercelSql, { schema });

// Re-export schema for convenience
export * from './schema';

// Re-export sql for raw queries
export { sql };

// Legacy sql template tag for backward compatibility with existing queries
// This allows gradual migration from raw SQL to Drizzle
export { sql as vercelSql } from '@vercel/postgres';
