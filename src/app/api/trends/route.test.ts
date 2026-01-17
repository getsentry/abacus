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

describe('GET /api/trends', () => {
  beforeEach(async () => {
    await seedTestData();
  });

  it('returns 401 for unauthenticated requests', async () => {
    await mockUnauthenticated();

    const response = await GET(new Request('http://localhost/api/trends'));

    expect(response.status).toBe(401);
  });

  it('returns 400 when dates are missing', async () => {
    await mockAuthenticated();

    const response = await GET(new Request('http://localhost/api/trends'));

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('required');
  });

  it('returns 400 for invalid startDate', async () => {
    await mockAuthenticated();

    const response = await GET(
      new Request('http://localhost/api/trends?startDate=bad&endDate=2025-01-31')
    );

    expect(response.status).toBe(400);
  });

  it('returns daily usage trends for authenticated users', async () => {
    await mockAuthenticated();

    const response = await GET(
      new Request('http://localhost/api/trends?startDate=2025-01-01&endDate=2025-01-31')
    );

    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result).toHaveProperty('data');
    expect(result).toHaveProperty('completeness');
    expect(Array.isArray(result.data)).toBe(true);
    expect(result.completeness).toHaveProperty('claudeCode');
    expect(result.completeness).toHaveProperty('cursor');
  });
});
