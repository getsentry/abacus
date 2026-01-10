import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from './route';

describe('GET /api/cron/backfill-github', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 'test-secret');
  });

  it('returns 401 without authorization header', async () => {
    const response = await GET(new Request('http://localhost/api/cron/backfill-github'));

    expect(response.status).toBe(401);
  });

  it('returns 401 with invalid authorization', async () => {
    const response = await GET(
      new Request('http://localhost/api/cron/backfill-github', {
        headers: { Authorization: 'Bearer wrong-secret' },
      })
    );

    expect(response.status).toBe(401);
  });
});

describe('POST /api/cron/backfill-github', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 'test-secret');
  });

  it('returns 401 without authorization header', async () => {
    const response = await POST(
      new Request('http://localhost/api/cron/backfill-github', { method: 'POST' })
    );

    expect(response.status).toBe(401);
  });
});
