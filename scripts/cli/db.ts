import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import * as path from 'path';
import * as fs from 'fs';

export async function cmdDbMigrate() {
  console.log('🗃️  Running database migrations\n');

  // Prefer the direct (non-pooled) endpoint for DDL — Neon recommends running
  // migrations outside PgBouncer. POSTGRES_URL_NON_POOLING is injected by the
  // Neon Vercel integration; POSTGRES_URL remains the fallback (e.g. local dev).
  const connectionString = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
  if (!connectionString) {
    console.log('⚠️  POSTGRES_URL not set, skipping migrations');
    return;
  }

  const migrationClient = postgres(connectionString, { max: 1 });
  const db = drizzle(migrationClient);

  try {
    const migrationsFolder = path.join(process.cwd(), 'drizzle');

    // Read journal to check what migrations exist
    const journalPath = path.join(migrationsFolder, 'meta', '_journal.json');
    const journal = JSON.parse(fs.readFileSync(journalPath, 'utf-8'));

    // Check what's already applied in the database
    // On fresh installs, the migrations table doesn't exist yet - that's fine,
    // migrate() will create it. We just treat it as 0 applied migrations.
    let applied: { hash: string }[] = [];
    try {
      applied = await migrationClient`SELECT hash FROM drizzle.__drizzle_migrations` as { hash: string }[];
    } catch {
      // Table doesn't exist yet - fresh install
      console.log('Fresh database detected, will run all migrations\n');
    }
    const appliedSet = new Set(applied.map(r => r.hash));

    // Find pending migrations
    const pending = journal.entries.filter((e: { tag: string }) => !appliedSet.has(e.tag));

    if (pending.length === 0) {
      console.log(`✓ All ${applied.length} migrations already applied`);
      return;
    }

    console.log(`Found ${pending.length} pending migration(s):`);
    pending.forEach((p: { tag: string }) => console.log(`  → ${p.tag}`));
    console.log();

    await migrate(db, { migrationsFolder });

    console.log('✓ Migrations complete!');
  } catch (error) {
    console.error('Migration error:', error);
    throw error;
  } finally {
    await migrationClient.end();
  }
}
