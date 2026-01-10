import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';

describe('GET /api/cron/sync-anthropic', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 'test-secret');
  });

  it('returns 401 without authorization header', async () => {
    const response = await GET(new Request('http://localhost/api/cron/sync-anthropic'));

    expect(response.status).toBe(401);
  });

  it('returns 401 with invalid authorization', async () => {
    const response = await GET(
      new Request('http://localhost/api/cron/sync-anthropic', {
        headers: { Authorization: 'Bearer wrong-secret' },
      })
    );

    expect(response.status).toBe(401);
  });

  it('skips when ANTHROPIC_ADMIN_KEY not configured', async () => {
    vi.stubEnv('ANTHROPIC_ADMIN_KEY', '');

    const response = await GET(
      new Request('http://localhost/api/cron/sync-anthropic', {
        headers: { Authorization: 'Bearer test-secret' },
      })
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.skipped).toBe(true);
    expect(data.reason).toContain('ANTHROPIC_ADMIN_KEY');
  });

  // Note: Full integration testing of the sync flow would require
  // disabling transaction-based isolation, which is complex.
  // The sync logic is tested via manual testing and staging.
});

describe('POST /api/cron/sync-anthropic', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 'test-secret');
  });

  it('returns 401 without authorization header', async () => {
    const { POST } = await import('./route');
    const response = await POST(
      new Request('http://localhost/api/cron/sync-anthropic', { method: 'POST' })
    );

    expect(response.status).toBe(401);
  });
});
