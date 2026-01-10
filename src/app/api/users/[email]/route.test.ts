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

describe('GET /api/users/[email]', () => {
  beforeEach(async () => {
    await seedTestData();
  });

  it('returns 401 for unauthenticated requests', async () => {
    await mockUnauthenticated();

    const response = await GET(
      new Request('http://localhost/api/users/user1@example.com'),
      { params: Promise.resolve({ email: 'user1@example.com' }) }
    );

    expect(response.status).toBe(401);
  });

  it('returns 404 for non-existent user', async () => {
    await mockAuthenticated();

    const response = await GET(
      new Request('http://localhost/api/users/nonexistent@example.com'),
      { params: Promise.resolve({ email: 'nonexistent@example.com' }) }
    );

    expect(response.status).toBe(404);
  });

  it('returns 400 for invalid startDate', async () => {
    await mockAuthenticated();

    const response = await GET(
      new Request('http://localhost/api/users/user1@example.com?startDate=invalid'),
      { params: Promise.resolve({ email: 'user1@example.com' }) }
    );

    expect(response.status).toBe(400);
  });

  it('returns user details for authenticated users', async () => {
    await mockAuthenticated();

    const response = await GET(
      new Request('http://localhost/api/users/user1@example.com?startDate=2025-01-01&endDate=2025-01-31'),
      { params: Promise.resolve({ email: 'user1@example.com' }) }
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.summary).toBeDefined();
    expect(data.summary.email).toBe('user1@example.com');
  });

  it('supports URL-encoded email addresses', async () => {
    await mockAuthenticated();

    const response = await GET(
      new Request('http://localhost/api/users/user1%40example.com?startDate=2025-01-01&endDate=2025-01-31'),
      { params: Promise.resolve({ email: 'user1%40example.com' }) }
    );

    expect(response.status).toBe(200);
  });
});
