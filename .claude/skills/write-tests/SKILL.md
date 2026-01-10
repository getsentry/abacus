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
src/app/api/stats/route.ts
src/app/api/stats/route.test.ts
src/test-utils/
├── setup.ts        # global setup (PGlite, MSW, auth mock)
├── msw-handlers.ts # external API mocks
└── auth.ts         # auth test helpers
```

## Auth Testing

Auth is **globally mocked**. Use helpers to control auth state:

```typescript
import { mockAuthenticated, mockUnauthenticated } from '@/test-utils/auth';

it('returns 401 when unauthenticated', async () => {
  await mockUnauthenticated();
  const response = await GET(new Request('http://localhost/api/foo'));
  expect(response.status).toBe(401);
});

it('returns data when authenticated', async () => {
  await mockAuthenticated(); // uses default test user
  // or with overrides:
  await mockAuthenticated({ email: 'custom@example.com' });

  const response = await GET(new Request('http://localhost/api/foo'));
  expect(response.status).toBe(200);
});
```

Default test user: `test@example.com` / `Test User`

## Database Testing

Uses **PGlite** (in-memory PostgreSQL). No Docker required.

- Schema pushed automatically on boot
- Each test runs in a transaction that rolls back
- Use `insertUsageRecord` from `@/lib/queries` to seed data

```typescript
import { insertUsageRecord, getOverallStats } from '@/lib/queries';

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
```

## Running Tests

```bash
pnpm test        # run all
pnpm test:watch  # watch mode
```

## Key Rules

1. Colocate tests next to source (`foo.ts` → `foo.test.ts`)
2. Use `mockAuthenticated()`/`mockUnauthenticated()` for auth
3. Use `insertUsageRecord` for seeding database
4. External APIs mocked via MSW in `src/test-utils/msw-handlers.ts`

## CRITICAL: Auth Tests Required

**Every protected route MUST have an auth test.** This is non-negotiable.

### Session-Authenticated Routes

Routes using `getSession()` must verify 401 on unauthenticated requests:

```typescript
it('returns 401 for unauthenticated requests', async () => {
  await mockUnauthenticated();
  const response = await GET(new Request('http://localhost/api/your-route'));
  expect(response.status).toBe(401);
});
```

### Cron Routes

Routes using `CRON_SECRET` must verify auth:

```typescript
beforeEach(() => {
  vi.stubEnv('CRON_SECRET', 'test-secret');
});

it('returns 401 without authorization header', async () => {
  const response = await GET(new Request('http://localhost/api/cron/your-route'));
  expect(response.status).toBe(401);
});

it('returns 401 with invalid authorization', async () => {
  const response = await GET(
    new Request('http://localhost/api/cron/your-route', {
      headers: { Authorization: 'Bearer wrong-secret' },
    })
  );
  expect(response.status).toBe(401);
});
```

### Webhook Routes

Routes with signature verification must test invalid signatures:

```typescript
it('returns 401 without signature', async () => {
  const response = await POST(
    new Request('http://localhost/api/webhooks/github', {
      method: 'POST',
      body: '{}',
    })
  );
  expect(response.status).toBe(401);
});

it('returns 401 with invalid signature', async () => {
  const response = await POST(
    new Request('http://localhost/api/webhooks/github', {
      method: 'POST',
      body: '{}',
      headers: { 'x-hub-signature-256': 'sha256=invalid' },
    })
  );
  expect(response.status).toBe(401);
});
```

**When adding a new route, always ask: "What auth does this route require?" and add the corresponding auth test.**
