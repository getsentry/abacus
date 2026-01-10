import { describe, it, expect } from 'vitest';
import { mockAuthenticated, mockUnauthenticated } from '@/test-utils/auth';
import { GET } from './route';

describe('GET /api/export/commits', () => {
  it('returns 401 for unauthenticated requests', async () => {
    await mockUnauthenticated();

    const response = await GET(new Request('http://localhost/api/export/commits'));

    expect(response.status).toBe(401);
  });

  it('returns 400 for invalid startDate', async () => {
    await mockAuthenticated();

    const response = await GET(new Request('http://localhost/api/export/commits?startDate=bad'));

    expect(response.status).toBe(400);
  });

  it('returns CSV for authenticated users', async () => {
    await mockAuthenticated();

    const response = await GET(
      new Request('http://localhost/api/export/commits?startDate=2025-01-01&endDate=2025-01-31')
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/csv');
    expect(response.headers.get('Content-Disposition')).toContain('attachment');
  });
});
