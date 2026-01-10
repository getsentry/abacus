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
    email: 'user1@example.com',
    tool: 'claude_code',
    rawModel: 'claude-3-5-haiku-20241022',
    model: 'haiku-3.5',
    inputTokens: 50000,
    outputTokens: 10000,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
    cost: 0.05,
  });
}

describe('GET /api/models', () => {
  beforeEach(async () => {
    await seedTestData();
  });

  it('returns 401 for unauthenticated requests', async () => {
    await mockUnauthenticated();

    const response = await GET(new Request('http://localhost/api/models'));

    expect(response.status).toBe(401);
  });

  it('returns 400 for invalid startDate', async () => {
    await mockAuthenticated();

    const response = await GET(new Request('http://localhost/api/models?startDate=invalid'));

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Invalid startDate');
  });

  it('returns model breakdown for authenticated users', async () => {
    await mockAuthenticated();

    const response = await GET(
      new Request('http://localhost/api/models?startDate=2025-01-01&endDate=2025-01-31')
    );

    expect(response.status).toBe(200);
    const models = await response.json();
    expect(Array.isArray(models)).toBe(true);
    expect(models.length).toBeGreaterThan(0);
  });
});
