# Agent Instructions

## Package Manager

Use **pnpm** (not npm/yarn): `pnpm install`, `pnpm dev`, `pnpm cli <cmd>`

## Commit Attribution

AI-generated commits MUST include:
```
Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
```

## API Routes

All routes require session validation except `/sign-in`, `/api/auth/*`, `/api/cron/*` (uses `CRON_SECRET`), `/api/webhooks/*` (signature verification).

**Template for new routes:**
```tsx
import { NextResponse } from 'next/server';
import { wrapRouteHandlerWithSentry } from '@sentry/nextjs';
import { getSession } from '@/lib/auth';

async function handler(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // handler logic
}

export const GET = wrapRouteHandlerWithSentry(handler, {
  method: 'GET',
  parameterizedRoute: '/api/your-route',
});
```

## Navigation

Use `<AppLink>` for internal links (preserves `?days=N`). Use `useTimeRange()` hook to access/update time range.

## Database

Migrations in `/drizzle/` run automatically on `pnpm build`. Manual: `pnpm cli db:migrate`

### Schema Changes

Use `db-migrate` skill when modifying database schema. Key rules:
- NEVER edit `src/lib/schema.ts` without generating a corresponding migration
- Use `pnpm drizzle-kit generate` to create migrations from schema changes
- Both schema.ts and migration must be in the same commit

See `.claude/skills/db-migrate/SKILL.md` for the full workflow.

## CLI

```bash
pnpm cli stats                    # DB statistics
pnpm cli sync --days 7            # Sync recent usage
pnpm cli backfill anthropic --from 2024-01-01 --to 2025-01-01
pnpm cli mappings:sync            # Sync API key mappings
```

## Model Names

Normalize at write-time via `normalizeModelName()`: `sonnet-4`, `opus-4.5 (T)`, `haiku-3.5 (HT)`

## Adoption Stages

- Positive framing only (no "Struggling"/"At Risk")
- No gamification (no progress bars, XP, "level up")
- Stages: Exploring → Building Momentum → In the Flow → Power User
- Based on intensity (avg tokens/day), not frequency
- Inactive = 30+ days (hide by default)
- Thresholds: Power User 3M+, In Flow 1M+, Building Momentum 250K+
- See `src/lib/adoption.ts`

## Testing

Tests use Vitest with colocated test files. Use `write-tests` skill when adding tests.

```bash
pnpm test              # Run all tests
pnpm test:watch        # Watch mode
```

**Key rules:**
- Tests colocated next to source: `foo.ts` → `foo.test.ts`
- Every protected route must have an auth test (401 for unauthenticated)
- Mock external APIs via MSW, mock auth via `@/test-utils/auth`
- Uses PGlite for in-memory PostgreSQL (no Docker required)

See `.claude/skills/write-tests/SKILL.md` for full workflow.

## Frontend & UI

Use `ui-design` skill when creating or modifying frontend components. Covers color palette, typography, shared components, and design patterns. See `.claude/skills/ui-design/SKILL.md`

## Tips & Guides

Use `write-tip` skill when editing tips. Key files: `src/lib/tips.ts`, `.claude/skills/write-tip/SKILL.md`

## Documentation

Documentation lives in `docs/` (Astro Starlight, deployed to GitHub Pages).

**Keep docs in sync with code.** When changing these areas, update the corresponding docs:

| Code Change | Update Docs |
|-------------|-------------|
| CLI commands (usage sync) | `docs/src/content/docs/cli/usage-data.mdx` |
| CLI commands (commits) | `docs/src/content/docs/cli/commit-data.mdx` |
| CLI commands (mappings) | `docs/src/content/docs/cli/identity-mappings.mdx` |
| Environment variables | `docs/src/content/docs/getting-started/environment-variables.mdx` |
| Provider setup/behavior | `docs/src/content/docs/providers/*.mdx` |
| Cron schedules / Vercel config | `docs/src/content/docs/deployment/vercel.mdx` |
| Project structure | `docs/src/content/docs/development/architecture.mdx` |

Use `write-docs` skill when creating or updating documentation. See `.claude/skills/write-docs/SKILL.md`
