---
name: write-tests
description: Write tests following project conventions. Use when adding new tests or modifying existing ones.
allowed-tools: Read, Grep, Glob, Edit, Write, Bash
---

# Write Tests Skill

Write tests using Vitest. Tests are **colocated** next to source files.

## Structure

```
src/lib/utils.ts
src/lib/utils.test.ts        # colocated
src/lib/queries.ts
src/lib/queries.test.ts      # colocated
src/app/api/stats/route.ts
src/app/api/stats/route.test.ts  # colocated
src/test-utils/
├── setup.ts                 # global setup (PGlite, MSW)
└── msw-handlers.ts          # external API mocks
```

## Database Testing

Uses **PGlite** (in-memory PostgreSQL). No Docker required.

- Schema pushed automatically on boot
- Each test runs in a transaction that rolls back
- Import `insertUsageRecord` from `@/lib/queries` to seed data

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { insertUsageRecord, getOverallStats } from '@/lib/queries';

describe('getOverallStats', () => {
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

  it('returns stats', async () => {
    const stats = await getOverallStats('2025-01-01', '2025-01-31');
    expect(stats.activeUsers).toBe(1);
  });
});
```

## API Route Tests

Mock auth, use real database:

```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/auth', () => ({ getSession: vi.fn() }));

import { getSession } from '@/lib/auth';
import { GET } from './route';

describe('GET /api/stats', () => {
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getSession).mockResolvedValueOnce(null);
    const response = await GET(new Request('http://localhost/api/stats'));
    expect(response.status).toBe(401);
  });
});
```

## Running Tests

```bash
pnpm test        # run all
pnpm test:watch  # watch mode
```

## Key Rules

1. Colocate tests next to source (`foo.ts` → `foo.test.ts`)
2. vi.mock calls hoist - put imports after mocks
3. Use `insertUsageRecord` for seeding
4. External APIs mocked via MSW in `src/test-utils/msw-handlers.ts`
