import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/sync', () => ({
  runOpenRouterSync: vi.fn().mockResolvedValue({
    success: true,
    recordsImported: 0,
    recordsSkipped: 0,
    errors: [],
  }),
  getOpenRouterSyncState: vi.fn().mockResolvedValue({ lastSyncedDate: null }),
}));

describe('GET /api/cron/sync-openrouter', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 'test-secret');
    vi.unstubAllEnvs();
    vi.stubEnv('CRON_SECRET', 'test-secret');
  });

  it('returns 401 without authorization header', async () => {
    const { GET } = await import('./route');
    const response = await GET(new Request('http://localhost/api/cron/sync-openrouter'));
    expect(response.status).toBe(401);
  });

  it('returns 401 with invalid authorization', async () => {
    const { GET } = await import('./route');
    const response = await GET(
      new Request('http://localhost/api/cron/sync-openrouter', {
        headers: { Authorization: 'Bearer wrong-secret' },
      })
    );
    expect(response.status).toBe(401);
  });

  it('skips when neither OPENROUTER_MANAGEMENT_KEY nor OPENROUTER_MANAGEMENT_KEYS is set', async () => {
    vi.stubEnv('OPENROUTER_MANAGEMENT_KEY', '');
    vi.stubEnv('OPENROUTER_MANAGEMENT_KEYS', '');

    const { GET } = await import('./route');
    const response = await GET(
      new Request('http://localhost/api/cron/sync-openrouter', {
        headers: { Authorization: 'Bearer test-secret' },
      })
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.skipped).toBe(true);
    expect(data.reason).toContain('OPENROUTER_MANAGEMENT_KEY');
    expect(data.reason).toContain('OPENROUTER_MANAGEMENT_KEYS');
  });

  it('runs sync with plural-only config (OPENROUTER_MANAGEMENT_KEYS set, singular unset)', async () => {
    vi.stubEnv('OPENROUTER_MANAGEMENT_KEY', '');
    vi.stubEnv(
      'OPENROUTER_MANAGEMENT_KEYS',
      JSON.stringify({ 'Coding Agents': 'sk-or-alpha', Tools: 'sk-or-beta' })
    );

    const { GET } = await import('./route');
    const response = await GET(
      new Request('http://localhost/api/cron/sync-openrouter', {
        headers: { Authorization: 'Bearer test-secret' },
      })
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.skipped).toBeUndefined();
    expect(data.service).toBe('openrouter');
  });

  it('runs sync with singular-only config (OPENROUTER_MANAGEMENT_KEY set)', async () => {
    vi.stubEnv('OPENROUTER_MANAGEMENT_KEY', 'sk-or-single');
    vi.stubEnv('OPENROUTER_MANAGEMENT_KEYS', '');

    const { GET } = await import('./route');
    const response = await GET(
      new Request('http://localhost/api/cron/sync-openrouter', {
        headers: { Authorization: 'Bearer test-secret' },
      })
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.skipped).toBeUndefined();
    expect(data.service).toBe('openrouter');
  });
});
