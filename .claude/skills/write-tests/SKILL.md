---
name: write-tests
description: Write tests following project conventions. Use when adding new tests or modifying existing ones. Ensures tests follow flat structure, naming conventions, and safety requirements.
allowed-tools: Read, Grep, Glob, Edit, Write, Bash
---

# Write Tests Skill

Write tests using Vitest following project conventions.

## Test Structure

Flat structure in `tests/`:
```
tests/
├── setup.ts              # Global setup (PGlite, MSW)
├── msw-handlers.ts       # External API mocks
├── utils.test.ts         # Utility function tests
├── queries.test.ts       # Database query tests
├── stats-route.test.ts   # API route tests
└── sign-in-page.test.tsx # Page render tests
```

### Naming Conventions
- Unit tests: `{module}.test.ts`
- API routes: `{route-name}-route.test.ts`
- Pages: `{page-name}-page.test.tsx`

## Database Testing

Uses **PGlite** (in-memory PostgreSQL via WebAssembly). No Docker required.

- Schema is pushed automatically in `setup.ts`
- Each test runs in a transaction that rolls back (fast cleanup)
- Import `insertUsageRecord` from `@/lib/queries` to seed data

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { insertUsageRecord, getOverallStats } from '@/lib/queries';

describe('My Database Tests', () => {
  beforeEach(async () => {
    await insertUsageRecord({
      date: '2025-01-01',
      email: 'user@example.com',
      tool: 'claude_code',
      model: 'sonnet-4',
      rawModel: 'claude-sonnet-4-20250514',
      inputTokens: 1000,
      outputTokens: 500,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
      cost: 0.01,
    });
  });

  it('queries data correctly', async () => {
    const stats = await getOverallStats('2025-01-01', '2025-01-31');
    expect(stats.activeUsers).toBe(1);
  });
});
```

## API Route Tests

Mock auth, use real database:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({
  getSession: vi.fn(),
}));

import { getSession } from '@/lib/auth';
import { GET } from '@/app/api/stats/route';

describe('GET /api/stats', () => {
  it('returns 401 for unauthenticated requests', async () => {
    vi.mocked(getSession).mockResolvedValueOnce(null);
    const response = await GET(new Request('http://localhost/api/stats'));
    expect(response.status).toBe(401);
  });
});
```

## Unit Tests

No database setup needed:

```typescript
import { describe, it, expect } from 'vitest';
import { normalizeModelName } from '@/lib/utils';

describe('normalizeModelName', () => {
  it('normalizes model names', () => {
    expect(normalizeModelName('claude-sonnet-4-20250514')).toBe('sonnet-4');
  });
});
```

## External APIs

Mocked via MSW in `tests/msw-handlers.ts`. Add handlers as needed.

## Running Tests

```bash
pnpm test        # Run all tests
pnpm test:watch  # Watch mode
```

## Key Rules

1. All tests in `tests/` directory (flat structure)
2. vi.mock calls are hoisted - put imports after mocks
3. Use `insertUsageRecord` for seeding, not raw SQL
4. External APIs (Anthropic, Cursor, GitHub) mocked via MSW
5. Mock only `@/lib/auth` for protected routes
