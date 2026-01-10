# Agent Instructions

## Package Manager

Use **pnpm**: `pnpm install`, `pnpm dev`, `pnpm cli <cmd>`

## Commit Attribution

AI commits MUST include:
```
Co-Authored-By: <model-name> <noreply@anthropic.com>
```
Use your actual model name (e.g., `Claude Sonnet 4`, `Claude Opus 4.5`).

## API Routes

Routes require session validation except `/sign-in`, `/api/auth/*`, `/api/cron/*`, `/api/webhooks/*`.

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

- Use `<AppLink>` for internal links (preserves `?days=N`)
- Use `useTimeRange()` hook to access/update time range

## Database

Use `db-migrate` skill for schema changes. See `.claude/skills/db-migrate/SKILL.md`

## CLI

| Command | Description |
|---------|-------------|
| `pnpm cli stats` | DB statistics |
| `pnpm cli sync --days 7` | Sync recent usage |
| `pnpm cli backfill anthropic --from YYYY-MM-DD --to YYYY-MM-DD` | Backfill provider data |
| `pnpm cli mappings:sync` | Sync API key mappings |

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

Use `write-tests` skill. See `.claude/skills/write-tests/SKILL.md`

```bash
pnpm test              # Run all tests
pnpm test:watch        # Watch mode
```

## Frontend & UI

Use `ui-design` skill. See `.claude/skills/ui-design/SKILL.md`

## Tips & Guides

Use `write-tip` skill. See `.claude/skills/write-tip/SKILL.md`

## Documentation

Use `write-docs` skill. See `.claude/skills/write-docs/SKILL.md`

| Code Change | Update Docs |
|-------------|-------------|
| CLI commands | `docs/src/content/docs/cli/*.mdx` |
| Environment variables | `docs/src/content/docs/getting-started/environment-variables.mdx` |
| Provider setup/behavior | `docs/src/content/docs/providers/*.mdx` |
| Vercel config | `docs/src/content/docs/deployment/vercel.mdx` |
| Project structure | `docs/src/content/docs/development/architecture.mdx` |
