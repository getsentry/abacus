import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from './route';

describe('GET /api/cron/backfill-cursor', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 'test-secret');
  });

  it('returns 401 without authorization header', async () => {
    const response = await GET(new Request('http://localhost/api/cron/backfill-cursor'));

    expect(response.status).toBe(401);
  });

  it('returns 401 with invalid authorization', async () => {
    const response = await GET(
      new Request('http://localhost/api/cron/backfill-cursor', {
        headers: { Authorization: 'Bearer wrong-secret' },
      })
    );

    expect(response.status).toBe(401);
  });

  it('skips when CURSOR_ADMIN_KEY not configured', async () => {
    vi.stubEnv('CURSOR_ADMIN_KEY', '');

    const response = await GET(
      new Request('http://localhost/api/cron/backfill-cursor', {
        headers: { Authorization: 'Bearer test-secret' },
      })
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.skipped).toBe(true);
  });
});

describe('POST /api/cron/backfill-cursor', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 'test-secret');
  });

  it('returns 401 without authorization header', async () => {
    const response = await POST(
      new Request('http://localhost/api/cron/backfill-cursor', { method: 'POST' })
    );

    expect(response.status).toBe(401);
  });
});
