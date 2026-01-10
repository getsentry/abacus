import { describe, it, expect, beforeEach } from 'vitest';
import { insertUsageRecord } from '@/lib/queries';
import { mockAuthenticated, mockUnauthenticated } from '@/test-utils/auth';
import { GET } from './route';

async function seedTestData() {
  await insertUsageRecord({
    date: '2025-01-01',
    email: 'user1@example.com',
    tool: 'claude_code',
    rawModel: 'claude-sonnet-4-20250514',
    model: 'sonnet-4',
    inputTokens: 10000,
    outputTokens: 5000,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
    cost: 0.15,
  });
  await insertUsageRecord({
    date: '2025-01-01',
    email: 'user2@example.com',
    tool: 'cursor',
    rawModel: 'claude-sonnet-4-20250514',
    model: 'sonnet-4',
    inputTokens: 20000,
    outputTokens: 10000,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
    cost: 0.30,
  });
}

describe('GET /api/users', () => {
  beforeEach(async () => {
    await seedTestData();
  });

  it('returns 401 for unauthenticated requests', async () => {
    await mockUnauthenticated();

    const response = await GET(new Request('http://localhost/api/users'));

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBe('Unauthorized');
  });

  it('returns user summaries for authenticated users', async () => {
    await mockAuthenticated();

    const response = await GET(
      new Request('http://localhost/api/users?startDate=2025-01-01&endDate=2025-01-31')
    );

    expect(response.status).toBe(200);
    const users = await response.json();
    expect(Array.isArray(users)).toBe(true);
  });

  it('supports pagination', async () => {
    await mockAuthenticated();

    const response = await GET(
      new Request('http://localhost/api/users?startDate=2025-01-01&endDate=2025-01-31&limit=1&offset=0')
    );

    expect(response.status).toBe(200);
    const users = await response.json();
    expect(users.length).toBeLessThanOrEqual(1);
  });

  it('supports search filtering', async () => {
    await mockAuthenticated();

    const response = await GET(
      new Request('http://localhost/api/users?startDate=2025-01-01&endDate=2025-01-31&search=user1')
    );

    expect(response.status).toBe(200);
    const users = await response.json();
    for (const user of users) {
      expect(user.email.toLowerCase()).toContain('user1');
    }
  });
});
