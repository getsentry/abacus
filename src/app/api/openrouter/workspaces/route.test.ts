import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockAuthenticated, mockUnauthenticated } from '@/test-utils/auth';
import { GET } from './route';

describe('GET /api/openrouter/workspaces', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    mockUnauthenticated();
  });

  it('returns 401 for unauthenticated requests', async () => {
    const response = await GET();

    expect(response.status).toBe(401);
  });

  it('returns workspace names in env declaration order (multi-workspace)', async () => {
    await mockAuthenticated();
    vi.stubEnv('OPENROUTER_MANAGEMENT_KEYS', JSON.stringify({ alpha: 'sk-or-alpha', beta: 'sk-or-beta', gamma: 'sk-or-gamma' }));

    const response = await GET();

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ workspaces: ['alpha', 'beta', 'gamma'] });
  });

  it('returns [\'default\'] for single-key fallback', async () => {
    await mockAuthenticated();
    vi.stubEnv('OPENROUTER_MANAGEMENT_KEY', 'sk-or-single');

    const response = await GET();

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ workspaces: ['default'] });
  });

  it('returns [] when no management keys configured', async () => {
    await mockAuthenticated();

    const response = await GET();

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ workspaces: [] });
  });
});
