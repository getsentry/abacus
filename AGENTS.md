# Agent Instructions

## Internal Navigation

Use `<AppLink>` for all internal links to automatically preserve the time range (days) parameter across navigation.

```tsx
import { AppLink } from '@/components/AppLink';

// Automatically adds ?days=N to the href
<AppLink href="/users">All Users</AppLink>

// Skip days param for certain links (e.g., external or auth)
<AppLink href="/status" skipDays>Status</AppLink>
```

The time range is managed via `TimeRangeContext`. Pages can access or update it:

```tsx
import { useTimeRange } from '@/contexts/TimeRangeContext';

function MyComponent() {
  const { days, setDays } = useTimeRange();
  // ...
}
```

## Database Migrations

Drizzle migrations are in `/drizzle/`. The migration system has issues with the remote Vercel Postgres database, so run SQL directly:

```bash
# Run SQL via CLI script
npx tsx -e "
import { config } from 'dotenv';
config({ path: '.env.local' });
import { sql } from '@vercel/postgres';

async function run() {
  const result = await sql\`YOUR SQL HERE\`;
  console.log('Rows affected:', result.rowCount);
}
run().then(() => process.exit(0));
"
```

## CLI Commands

```bash
npm run cli stats              # Database statistics
npm run cli sync --days 7      # Sync recent usage
npm run cli backfill anthropic --from 2024-01-01 --to 2025-01-01
npm run cli mappings:sync      # Sync API key mappings
```

## Model Name Normalization

All model names should be normalized at write-time to: `{family}-{version}[ (T|HT)]`

Examples: `sonnet-4`, `haiku-3.5`, `opus-4.5 (T)`, `sonnet-4 (HT)`

Use `normalizeModelName()` from `@/lib/utils` when inserting records.
