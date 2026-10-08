import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';

describe('GET /api/cron/sync-openrouter', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 'test-secret');
  });

  it('returns 401 without authorization header', async () => {
    const response = await GET(new Request('http://localhost/api/cron/sync-openrouter'));

    expect(response.status).toBe(401);
  });

  it('skips when no OpenRouter key configured', async () => {
    vi.stubEnv('OPENROUTER_MANAGEMENT_KEY', '');

    const response = await GET(
      new Request('http://localhost/api/cron/sync-openrouter', {
        headers: { Authorization: 'Bearer test-secret' },
      })
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.skipped).toBe(true);
  });
});
