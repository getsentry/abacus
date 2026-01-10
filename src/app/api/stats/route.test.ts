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
}

describe('GET /api/stats', () => {
  beforeEach(async () => {
    await seedTestData();
  });

  it('returns 401 for unauthenticated requests', async () => {
    await mockUnauthenticated();

    const response = await GET(new Request('http://localhost/api/stats'));

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBe('Unauthorized');
  });

  it('returns 400 for invalid startDate format', async () => {
    await mockAuthenticated();

    const response = await GET(new Request('http://localhost/api/stats?startDate=invalid'));

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Invalid startDate');
  });

  it('returns 400 for invalid endDate format', async () => {
    await mockAuthenticated();

    const response = await GET(new Request('http://localhost/api/stats?endDate=01-01-2025'));

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Invalid endDate');
  });

  it('returns stats for authenticated users', async () => {
    await mockAuthenticated();

    const response = await GET(
      new Request('http://localhost/api/stats?startDate=2025-01-01&endDate=2025-01-31')
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.activeUsers).toBeDefined();
    expect(data.totalTokens).toBeDefined();
  });
});
