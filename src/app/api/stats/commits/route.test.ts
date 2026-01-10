import { describe, it, expect, beforeEach } from 'vitest';
import { mockAuthenticated, mockUnauthenticated } from '@/test-utils/auth';
import { seedRepositoryWithCommits } from '@/test-utils/fixtures';
import { GET } from './route';

async function seedTestData() {
  await seedRepositoryWithCommits('test-org/test-repo', [
    {
      authorEmail: 'dev@example.com',
      committedAt: '2025-01-15T10:00:00Z',
      aiTool: 'claude_code',
      additions: 100,
      deletions: 20,
    },
    {
      authorEmail: 'dev@example.com',
      committedAt: '2025-01-15T14:00:00Z',
      aiTool: 'cursor',
      additions: 50,
      deletions: 10,
    },
    {
      authorEmail: 'dev@example.com',
      committedAt: '2025-01-16T09:00:00Z',
      aiTool: null,
      additions: 30,
      deletions: 5,
    },
  ]);
}

describe('GET /api/stats/commits', () => {
  beforeEach(async () => {
    await seedTestData();
  });

  it('returns 401 for unauthenticated requests', async () => {
    await mockUnauthenticated();

    const response = await GET(new Request('http://localhost/api/stats/commits'));

    expect(response.status).toBe(401);
  });

  it('returns stats without dates (uses all time)', async () => {
    await mockAuthenticated();

    const response = await GET(new Request('http://localhost/api/stats/commits'));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.totalCommits).toBe(3);
  });

  it('returns commit statistics for date range', async () => {
    await mockAuthenticated();

    const response = await GET(
      new Request('http://localhost/api/stats/commits?startDate=2025-01-01&endDate=2025-01-31')
    );

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.totalCommits).toBe(3);
    expect(data.aiAssistedCommits).toBe(2);
    expect(data.totalAdditions).toBe(180);
    expect(data.totalDeletions).toBe(35);
  });

  it('supports comparison mode', async () => {
    await mockAuthenticated();

    const response = await GET(
      new Request('http://localhost/api/stats/commits?startDate=2025-01-15&endDate=2025-01-16&comparison=true')
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.previousPeriod).toBeDefined();
  });
});
