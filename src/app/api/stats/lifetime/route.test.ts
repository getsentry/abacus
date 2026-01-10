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

describe('GET /api/stats/lifetime', () => {
  beforeEach(async () => {
    await seedTestData();
  });

  it('returns 401 for unauthenticated requests', async () => {
    await mockUnauthenticated();

    const response = await GET();

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBe('Unauthorized');
  });

  it('returns lifetime stats for authenticated users', async () => {
    await mockAuthenticated();

    const response = await GET();

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.totalTokens).toBeDefined();
    expect(data.totalUsers).toBeDefined();
    expect(data.totalRepos).toBeDefined();
  });
});
