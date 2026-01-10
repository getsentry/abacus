import { describe, it, expect, vi, beforeEach } from 'vitest';
import { insertUsageRecord } from '@/lib/queries';

vi.mock('@/lib/auth', () => ({
  getSession: vi.fn(),
}));

import { getSession } from '@/lib/auth';
import { GET } from '@/app/api/stats/route';

// Helper to seed test data
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
    vi.clearAllMocks();
    await seedTestData();
  });

  it('returns 401 for unauthenticated requests', async () => {
    vi.mocked(getSession).mockResolvedValueOnce(null);

    const request = new Request('http://localhost/api/stats');
    const response = await GET(request);

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBe('Unauthorized');
  });

  it('returns 400 for invalid startDate format', async () => {
    vi.mocked(getSession).mockResolvedValueOnce({
      user: { email: 'test@example.com', name: 'Test' },
    } as never);

    const request = new Request('http://localhost/api/stats?startDate=invalid');
    const response = await GET(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Invalid startDate');
  });

  it('returns 400 for invalid endDate format', async () => {
    vi.mocked(getSession).mockResolvedValueOnce({
      user: { email: 'test@example.com', name: 'Test' },
    } as never);

    const request = new Request('http://localhost/api/stats?endDate=01-01-2025');
    const response = await GET(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Invalid endDate');
  });

  it('returns stats for authenticated users', async () => {
    vi.mocked(getSession).mockResolvedValueOnce({
      user: { email: 'test@example.com', name: 'Test' },
    } as never);

    const request = new Request(
      'http://localhost/api/stats?startDate=2025-01-01&endDate=2025-01-31'
    );
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.activeUsers).toBeDefined();
    expect(data.totalTokens).toBeDefined();
  });
});
