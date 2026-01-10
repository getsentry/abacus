import { describe, it, expect } from 'vitest';
import { mockAuthenticated, mockUnauthenticated } from '@/test-utils/auth';
import { GET } from './route';

describe('GET /api/stats/commits', () => {
  it('returns 401 for unauthenticated requests', async () => {
    await mockUnauthenticated();

    const response = await GET(new Request('http://localhost/api/stats/commits'));

    expect(response.status).toBe(401);
  });

  it('returns 400 for invalid startDate', async () => {
    await mockAuthenticated();

    const response = await GET(new Request('http://localhost/api/stats/commits?startDate=invalid'));

    expect(response.status).toBe(400);
  });

  it('returns 400 for invalid endDate', async () => {
    await mockAuthenticated();

    const response = await GET(new Request('http://localhost/api/stats/commits?endDate=01-01-2025'));

    expect(response.status).toBe(400);
  });

  it('returns commit stats for authenticated users', async () => {
    await mockAuthenticated();

    const response = await GET(
      new Request('http://localhost/api/stats/commits?startDate=2025-01-01&endDate=2025-01-31')
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.totalCommits).toBeDefined();
    expect(data.aiAssistedCommits).toBeDefined();
  });

  it('supports comparison mode', async () => {
    await mockAuthenticated();

    const response = await GET(
      new Request('http://localhost/api/stats/commits?startDate=2025-01-01&endDate=2025-01-31&comparison=true')
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.previousPeriod).toBeDefined();
  });
});
