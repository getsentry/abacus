---
name: db-migrate
description: Create database migrations using Drizzle Kit. Use when adding/modifying tables, columns, or indexes. Ensures schema.ts and migrations stay in sync.
allowed-tools: Read, Grep, Glob, Edit, Write, Bash
---

# Database Migration Skill

Create schema changes with proper migrations.

## CRITICAL: Never Write Migrations By Hand

**ALWAYS use `drizzle-kit generate` to create migrations. NEVER write SQL migration files manually.**

Why this matters:
- Drizzle tracks schema state via snapshot files in `drizzle/meta/`
- Hand-written migrations don't update snapshots
- This causes `drizzle-kit generate` to fail with confusing prompts about tables being "created or renamed"
- It breaks the entire migration system for future changes

If you're tempted to write SQL by hand (e.g., for data migrations), create a separate script in `scripts/` instead.

## Before Starting

1. Read current schema: `src/lib/schema.ts`
2. Read recent migrations: `drizzle/*.sql` (last 2-3)
3. Understand current state before making changes

## Workflow

### Step 1: Modify Schema First

Edit `src/lib/schema.ts` with your changes:
- Add new tables with `pgTable()`
- Add columns to existing tables
- Add/modify indexes

### Step 2: Generate Migration

Run Drizzle Kit to generate migration SQL:
```bash
pnpm drizzle-kit generate
```

This creates a new file in `drizzle/` like `0011_descriptive_name.sql`.

### Step 3: Review Generated Migration

Read the generated migration and verify:
- [ ] SQL looks correct
- [ ] No destructive changes (DROP without intent)
- [ ] Index names follow convention
- [ ] Column types match schema.ts

### Step 4: Test Locally (Optional - Be Careful!)

**WARNING**: Only test migrations locally if `POSTGRES_URL` points to a LOCAL database.
If it points to production, skip this step - migrations will run automatically on Vercel deploy.

To check your database URL:
```bash
echo $POSTGRES_URL  # Should be localhost or local container
```

If local database is configured:
```bash
pnpm build  # Runs migrations automatically
pnpm cli stats  # Verify queries work
```

### Step 5: Verify in PR

- [ ] Migration SQL looks correct (review diff)
- [ ] schema.ts and migration are in same commit
- [ ] No `IF NOT EXISTS` clauses (signals potential drift)

## Common Patterns

### Adding a Column
```typescript
// schema.ts
export const myTable = pgTable('my_table', {
  // existing columns...
  newColumn: varchar('new_column', { length: 255 }),
});
```

### Adding an Index
```typescript
export const myTable = pgTable('my_table', {
  // columns...
}, (table) => [
  index('idx_my_table_column').on(table.column),
]);
```

### Adding a Table
```typescript
export const newTable = pgTable('new_table', {
  id: serial('id').primaryKey(),
  // columns...
}, (table) => [
  // indexes...
]);
```

## Anti-Patterns (NEVER Do This)

- **Writing migration SQL by hand** - This breaks drizzle's snapshot tracking and causes future `generate` commands to fail. ALWAYS use `drizzle-kit generate`.
- **Using `IF NOT EXISTS` or `IF EXISTS`** - These clauses signal you're writing SQL by hand. Generated migrations never include them.
- Editing schema.ts without running `drizzle-kit generate`
- Modifying existing migrations after they've been applied to prod
- Adding data migrations to schema migration files (use separate scripts)

## Checklist

Before committing:
- [ ] schema.ts changes match generated migration
- [ ] Migration tested locally with `pnpm build` (only if local DB configured)
- [ ] No `IF NOT EXISTS` clauses (clean migration)
- [ ] Both schema.ts and migration in same commit
