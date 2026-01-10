import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from './route';

describe('GET /api/cron/sync-github-mappings', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 'test-secret');
  });

  it('returns 401 without authorization header', async () => {
    const response = await GET(new Request('http://localhost/api/cron/sync-github-mappings'));

    expect(response.status).toBe(401);
  });

  it('returns 401 with invalid authorization', async () => {
    const response = await GET(
      new Request('http://localhost/api/cron/sync-github-mappings', {
        headers: { Authorization: 'Bearer wrong-secret' },
      })
    );

    expect(response.status).toBe(401);
  });
});

describe('POST /api/cron/sync-github-mappings', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 'test-secret');
  });

  it('returns 401 without authorization header', async () => {
    const response = await POST(
      new Request('http://localhost/api/cron/sync-github-mappings', { method: 'POST' })
    );

    expect(response.status).toBe(401);
  });
});
