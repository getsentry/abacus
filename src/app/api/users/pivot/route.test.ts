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

describe('GET /api/users/pivot', () => {
  beforeEach(async () => {
    await seedTestData();
  });

  it('returns 401 for unauthenticated requests', async () => {
    await mockUnauthenticated();

    const response = await GET(new Request('http://localhost/api/users/pivot'));

    expect(response.status).toBe(401);
  });

  it('returns 400 for invalid date format', async () => {
    await mockAuthenticated();

    const response = await GET(new Request('http://localhost/api/users/pivot?startDate=bad'));

    expect(response.status).toBe(400);
  });

  it('returns user pivot data for authenticated users', async () => {
    await mockAuthenticated();

    const response = await GET(
      new Request('http://localhost/api/users/pivot?startDate=2025-01-01&endDate=2025-01-31')
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.users).toBeDefined();
    expect(data.totalCount).toBeDefined();
  });

  it('supports sorting parameters', async () => {
    await mockAuthenticated();

    const response = await GET(
      new Request('http://localhost/api/users/pivot?startDate=2025-01-01&endDate=2025-01-31&sortBy=totalCost&sortDir=asc')
    );

    expect(response.status).toBe(200);
  });

  it('supports search filtering', async () => {
    await mockAuthenticated();

    const response = await GET(
      new Request('http://localhost/api/users/pivot?startDate=2025-01-01&endDate=2025-01-31&search=user1')
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    for (const user of data.users) {
      expect(user.email.toLowerCase()).toContain('user1');
    }
  });
});
