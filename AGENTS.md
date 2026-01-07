# Agent Instructions

## Authentication & Security

This app uses better-auth with Google OAuth, restricted to the `DOMAIN` environment variable (e.g., `sentry.io`).

### Route Protection (Two Layers)

1. **Proxy (optimistic)**: `src/proxy.ts` checks for session cookie on all routes
2. **API routes (authoritative)**: Each API route MUST call `getSession()` to validate the session

```tsx
import { getSession } from '@/lib/auth';

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // ... rest of handler
}
```

### Public Routes

Only these routes are accessible without authentication:
- `/sign-in` - Login page
- `/api/auth/*` - OAuth flow endpoints
- `/api/cron/*` - Protected by `CRON_SECRET` instead

### Adding New API Routes

When creating new API routes, ALWAYS:

1. **Wrap handlers with Sentry** - Next.js `onRequestError` only captures Server Component errors, NOT Route Handler errors. Use `wrapRouteHandlerWithSentry`:

```tsx
import { NextResponse } from 'next/server';
import { wrapRouteHandlerWithSentry } from '@sentry/nextjs';
import { getSession } from '@/lib/auth';

async function handler(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // ... rest of handler (no try/catch needed, Sentry captures errors)
}

export const GET = wrapRouteHandlerWithSentry(handler, {
  method: 'GET',
  parameterizedRoute: '/api/your-route',
});
```

2. **Add session validation** at the start of each handler (GET, POST, etc.) - except for cron routes which use `CRON_SECRET`

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

Migrations are SQL files in `/drizzle/` named with numeric prefixes (e.g., `0000_initial.sql`, `0001_add_feature.sql`).

Migrations run automatically during `npm run build` (before Next.js build), so they're applied on every Vercel deploy.

```bash
# Run migrations manually
npm run cli db:migrate
```

The CLI tracks applied migrations in a `_migrations` table to avoid re-running them.

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
