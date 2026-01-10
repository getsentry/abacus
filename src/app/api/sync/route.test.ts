import { describe, it, expect } from 'vitest';
import { mockAuthenticated, mockUnauthenticated } from '@/test-utils/auth';
import { GET, POST } from './route';

describe('GET /api/sync', () => {
  it('returns 401 for unauthenticated requests', async () => {
    await mockUnauthenticated();

    const response = await GET();

    expect(response.status).toBe(401);
  });

  it('returns sync status for authenticated users', async () => {
    await mockAuthenticated();

    const response = await GET();

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('anthropicConfigured');
    expect(data).toHaveProperty('cursorConfigured');
  });
});

describe('POST /api/sync', () => {
  it('returns 401 for unauthenticated requests', async () => {
    await mockUnauthenticated();

    const response = await POST(
      new Request('http://localhost/api/sync', {
        method: 'POST',
        body: JSON.stringify({}),
      })
    );

    expect(response.status).toBe(401);
  });

  it('returns 400 for invalid JSON', async () => {
    await mockAuthenticated();

    const response = await POST(
      new Request('http://localhost/api/sync', {
        method: 'POST',
        body: 'not json',
      })
    );

    expect(response.status).toBe(400);
  });

  it('returns 400 for invalid startDate', async () => {
    await mockAuthenticated();

    const response = await POST(
      new Request('http://localhost/api/sync', {
        method: 'POST',
        body: JSON.stringify({ startDate: 'bad' }),
      })
    );

    expect(response.status).toBe(400);
  });
});
