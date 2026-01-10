import { describe, it, expect } from 'vitest';
import { mockAuthenticated, mockUnauthenticated } from '@/test-utils/auth';
import { GET } from './route';

describe('GET /api/commits/trends', () => {
  it('returns 401 for unauthenticated requests', async () => {
    await mockUnauthenticated();

    const response = await GET(new Request('http://localhost/api/commits/trends'));

    expect(response.status).toBe(401);
  });

  it('returns 400 when dates are missing', async () => {
    await mockAuthenticated();

    const response = await GET(new Request('http://localhost/api/commits/trends'));

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('required');
  });

  it('returns 400 for invalid date format', async () => {
    await mockAuthenticated();

    const response = await GET(
      new Request('http://localhost/api/commits/trends?startDate=bad&endDate=2025-01-31')
    );

    expect(response.status).toBe(400);
  });

  it('returns commit trends for authenticated users', async () => {
    await mockAuthenticated();

    const response = await GET(
      new Request('http://localhost/api/commits/trends?startDate=2025-01-01&endDate=2025-01-31')
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.daily).toBeDefined();
    expect(data.overall).toBeDefined();
  });

  it('supports comparison mode', async () => {
    await mockAuthenticated();

    const response = await GET(
      new Request('http://localhost/api/commits/trends?startDate=2025-01-01&endDate=2025-01-31&comparison=true')
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.overall.previousPeriod).toBeDefined();
  });
});
