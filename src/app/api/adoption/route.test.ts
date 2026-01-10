import { describe, it, expect, beforeEach } from 'vitest';
import { insertUsageRecord } from '@/lib/queries';
import { mockAuthenticated, mockUnauthenticated } from '@/test-utils/auth';
import { GET } from './route';

async function seedTestData() {
  // Create usage over multiple days for adoption scoring
  for (let i = 1; i <= 5; i++) {
    await insertUsageRecord({
      date: `2025-01-0${i}`,
      email: 'user1@example.com',
      tool: 'claude_code',
      rawModel: 'claude-sonnet-4-20250514',
      model: 'sonnet-4',
      inputTokens: 100000,
      outputTokens: 50000,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
      cost: 1.50,
    });
  }
}

describe('GET /api/adoption', () => {
  beforeEach(async () => {
    await seedTestData();
  });

  it('returns 401 for unauthenticated requests', async () => {
    await mockUnauthenticated();

    const response = await GET(new Request('http://localhost/api/adoption'));

    expect(response.status).toBe(401);
  });

  it('returns 400 for invalid startDate', async () => {
    await mockAuthenticated();

    const response = await GET(new Request('http://localhost/api/adoption?startDate=bad'));

    expect(response.status).toBe(400);
  });

  it('returns adoption summary for authenticated users', async () => {
    await mockAuthenticated();

    const response = await GET(
      new Request('http://localhost/api/adoption?startDate=2025-01-01&endDate=2025-01-31')
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.stages).toBeDefined();
    expect(data.avgScore).toBeDefined();
  });

  it('supports comparison mode', async () => {
    await mockAuthenticated();

    const response = await GET(
      new Request('http://localhost/api/adoption?startDate=2025-01-01&endDate=2025-01-31&comparison=true')
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.previousPeriod).toBeDefined();
  });
});
