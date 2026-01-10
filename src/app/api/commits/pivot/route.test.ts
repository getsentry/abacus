import { describe, it, expect } from 'vitest';
import { mockAuthenticated, mockUnauthenticated } from '@/test-utils/auth';
import { GET } from './route';

describe('GET /api/commits/pivot', () => {
  it('returns 401 for unauthenticated requests', async () => {
    await mockUnauthenticated();

    const response = await GET(new Request('http://localhost/api/commits/pivot'));

    expect(response.status).toBe(401);
  });

  it('returns 400 for invalid startDate', async () => {
    await mockAuthenticated();

    const response = await GET(new Request('http://localhost/api/commits/pivot?startDate=bad'));

    expect(response.status).toBe(400);
  });

  it('returns repository pivot data for authenticated users', async () => {
    await mockAuthenticated();

    const response = await GET(
      new Request('http://localhost/api/commits/pivot?startDate=2025-01-01&endDate=2025-01-31')
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.repositories).toBeDefined();
    expect(data.totalCount).toBeDefined();
  });

  it('supports sorting parameters', async () => {
    await mockAuthenticated();

    const response = await GET(
      new Request('http://localhost/api/commits/pivot?startDate=2025-01-01&endDate=2025-01-31&sortBy=aiAssistedCommits&sortDir=desc')
    );

    expect(response.status).toBe(200);
  });
});
