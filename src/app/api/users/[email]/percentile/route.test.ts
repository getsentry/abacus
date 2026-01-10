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
    tool: 'claude_code',
    rawModel: 'claude-sonnet-4-20250514',
    model: 'sonnet-4',
    inputTokens: 50000,
    outputTokens: 25000,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
    cost: 0.75,
  });
}

describe('GET /api/users/[email]/percentile', () => {
  beforeEach(async () => {
    await seedTestData();
  });

  it('returns 401 for unauthenticated requests', async () => {
    await mockUnauthenticated();

    const response = await GET(
      new Request('http://localhost/api/users/user1@example.com/percentile'),
      { params: Promise.resolve({ email: 'user1@example.com' }) }
    );

    expect(response.status).toBe(401);
  });

  it('returns 400 when dates are missing', async () => {
    await mockAuthenticated();

    const response = await GET(
      new Request('http://localhost/api/users/user1@example.com/percentile'),
      { params: Promise.resolve({ email: 'user1@example.com' }) }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('required');
  });

  it('returns 404 for non-existent username', async () => {
    await mockAuthenticated();

    // resolveUserEmail returns null for usernames that don't exist
    const response = await GET(
      new Request('http://localhost/api/users/nonexistentuser/percentile?startDate=2025-01-01&endDate=2025-01-31'),
      { params: Promise.resolve({ email: 'nonexistentuser' }) }
    );

    expect(response.status).toBe(404);
  });

  it('returns percentile for authenticated users', async () => {
    await mockAuthenticated();

    const response = await GET(
      new Request('http://localhost/api/users/user1@example.com/percentile?startDate=2025-01-01&endDate=2025-01-31'),
      { params: Promise.resolve({ email: 'user1@example.com' }) }
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.percentile).toBeDefined();
    expect(typeof data.percentile).toBe('number');
  });
});
