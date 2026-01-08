import * as fs from 'fs';
import * as path from 'path';
import { sql } from '@vercel/postgres';

export async function cmdDbMigrate() {
  console.log('🗃️  Running database migrations\n');

  if (!process.env.POSTGRES_URL) {
    console.log('⚠️  POSTGRES_URL not set, skipping migrations');
    return;
  }

  const migrationsDir = path.join(process.cwd(), 'drizzle');

  // Get all .sql files sorted by name
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    console.log('No migration files found in ./drizzle/');
    return;
  }

  console.log(`Found ${files.length} migration file(s)\n`);

  // Create migrations tracking table if it doesn't exist
  await sql`
    CREATE TABLE IF NOT EXISTS "_migrations" (
      "id" SERIAL PRIMARY KEY,
      "name" TEXT NOT NULL UNIQUE,
      "applied_at" TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `;

  // Get already applied migrations
  const applied = await sql`SELECT name FROM "_migrations"`;
  const appliedSet = new Set(applied.rows.map(r => r.name));

  let migrationsRun = 0;

  for (const file of files) {
    if (appliedSet.has(file)) {
      console.log(`✓ ${file} (already applied)`);
      continue;
    }

    console.log(`→ ${file}`);

    const filePath = path.join(migrationsDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');

    // Split by semicolons, strip comment lines, filter empty statements
    const statements = content
      .split(';')
      .map(s => s
        .split('\n')
        .filter(line => !line.trim().startsWith('--'))
        .join('\n')
        .trim()
      )
      .filter(s => s.length > 0);

    for (const stmt of statements) {
      try {
        await sql.query(stmt);
      } catch (err) {
        console.error(`  Error executing statement: ${err}`);
        console.error(`  Statement: ${stmt.slice(0, 100)}...`);
        throw err;
      }
    }

    // Record migration as applied
    await sql`INSERT INTO "_migrations" (name) VALUES (${file})`;
    console.log(`  ✓ Applied`);
    migrationsRun++;
  }

  console.log(`\n✓ Done! ${migrationsRun} migration(s) applied.`);
}
