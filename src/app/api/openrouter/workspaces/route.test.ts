import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db, openrouterWorkspaces } from '@/lib/db';
import { mockAuthenticated, mockUnauthenticated } from '@/test-utils/auth';
import { GET, PUT } from './route';
import { listOpenRouterWorkspaces } from '@/lib/openrouter';

vi.mock('@/lib/openrouter', async () => {
  const actual = await vi.importActual<typeof import('@/lib/openrouter')>('@/lib/openrouter');
  return {
    ...actual,
    listOpenRouterWorkspaces: vi.fn(),
  };
});

const LIVE_WORKSPACES = [
  { id: 'ws-default', name: 'Default Workspace' },
  { id: 'ws-coding', name: 'Coding Agents' },
  { id: 'ws-tools', name: 'Tools' },
];

function makeGetRequest(adminView = false): Request {
  const url = adminView
    ? 'http://localhost/api/openrouter/workspaces?admin=true'
    : 'http://localhost/api/openrouter/workspaces';
  return new Request(url);
}

function makePutRequest(ids: unknown): Request {
  return new Request('http://localhost/api/openrouter/workspaces', {
    method: 'PUT',
    body: JSON.stringify({ ids }),
  });
}

describe('/api/openrouter/workspaces', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    await db.delete(openrouterWorkspaces);
    await mockUnauthenticated();
  });

  describe('GET', () => {
    it('returns 401 for unauthenticated requests', async () => {
      const response = await GET(makeGetRequest());

      expect(response.status).toBe(401);
    });

    it('returns empty list when no workspaces are enabled', async () => {
      await mockAuthenticated();

      const response = await GET(makeGetRequest());

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ workspaces: [] });
    });

    it('returns enabled workspaces from the database', async () => {
      await mockAuthenticated();
      await db.insert(openrouterWorkspaces).values([
        { id: 'ws-coding', name: 'Coding Agents' },
        { id: 'ws-tools', name: 'Tools' },
      ]);

      const response = await GET(makeGetRequest());

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.workspaces).toHaveLength(2);
      expect(data.workspaces).toEqual(
        expect.arrayContaining([
          { id: 'ws-coding', name: 'Coding Agents' },
          { id: 'ws-tools', name: 'Tools' },
        ])
      );
      // Never leaks management keys
      expect(JSON.stringify(data)).not.toContain('sk-or-');
    });

    it('does not call the OpenRouter API for the non-admin view', async () => {
      await mockAuthenticated();

      await GET(makeGetRequest());

      expect(listOpenRouterWorkspaces).not.toHaveBeenCalled();
    });

    it('returns 403 for admin view as non-admin', async () => {
      await mockAuthenticated();
      vi.stubEnv('ADMIN_EMAILS', 'admin@example.com');

      const response = await GET(makeGetRequest(true));

      expect(response.status).toBe(403);
    });

    it('returns live workspaces with enabled state for admins', async () => {
      await mockAuthenticated();
      vi.stubEnv('ADMIN_EMAILS', 'test@example.com');
      vi.mocked(listOpenRouterWorkspaces).mockResolvedValue(LIVE_WORKSPACES);
      await db.insert(openrouterWorkspaces).values([{ id: 'ws-tools', name: 'Tools' }]);

      const response = await GET(makeGetRequest(true));

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.workspaces).toEqual([
        { id: 'ws-default', name: 'Default Workspace', enabled: false },
        { id: 'ws-coding', name: 'Coding Agents', enabled: false },
        { id: 'ws-tools', name: 'Tools', enabled: true },
      ]);
    });

    it('returns 502 when the OpenRouter API fails in admin view', async () => {
      await mockAuthenticated();
      vi.stubEnv('ADMIN_EMAILS', 'test@example.com');
      vi.mocked(listOpenRouterWorkspaces).mockRejectedValue(new Error('upstream down'));

      const response = await GET(makeGetRequest(true));

      expect(response.status).toBe(502);
    });
  });

  describe('PUT', () => {
    it('returns 401 for unauthenticated requests', async () => {
      const response = await PUT(makePutRequest(['ws-tools']));

      expect(response.status).toBe(401);
    });

    it('returns 403 for non-admins', async () => {
      await mockAuthenticated();
      vi.stubEnv('ADMIN_EMAILS', 'admin@example.com');

      const response = await PUT(makePutRequest(['ws-tools']));

      expect(response.status).toBe(403);
    });

    it('returns 400 for invalid ids payload', async () => {
      await mockAuthenticated();
      vi.stubEnv('ADMIN_EMAILS', 'test@example.com');

      const response = await PUT(makePutRequest('not-an-array'));

      expect(response.status).toBe(400);
    });

    it('returns 400 for unknown workspace ids', async () => {
      await mockAuthenticated();
      vi.stubEnv('ADMIN_EMAILS', 'test@example.com');
      vi.mocked(listOpenRouterWorkspaces).mockResolvedValue(LIVE_WORKSPACES);

      const response = await PUT(makePutRequest(['ws-nope']));

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('ws-nope');
    });

    it('replaces the enabled set and caches live names', async () => {
      await mockAuthenticated();
      vi.stubEnv('ADMIN_EMAILS', 'test@example.com');
      vi.mocked(listOpenRouterWorkspaces).mockResolvedValue(LIVE_WORKSPACES);
      await db.insert(openrouterWorkspaces).values([{ id: 'ws-default', name: 'Old Name' }]);

      const response = await PUT(makePutRequest(['ws-coding', 'ws-tools']));

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.workspaces).toEqual([
        { id: 'ws-coding', name: 'Coding Agents' },
        { id: 'ws-tools', name: 'Tools' },
      ]);

      const rows = await db.select().from(openrouterWorkspaces);
      expect(rows).toHaveLength(2);
      expect(rows.map((row) => row.id).sort()).toEqual(['ws-coding', 'ws-tools']);
    });

    it('clears all enabled workspaces with an empty array', async () => {
      await mockAuthenticated();
      vi.stubEnv('ADMIN_EMAILS', 'test@example.com');
      vi.mocked(listOpenRouterWorkspaces).mockResolvedValue(LIVE_WORKSPACES);
      await db.insert(openrouterWorkspaces).values([{ id: 'ws-tools', name: 'Tools' }]);

      const response = await PUT(makePutRequest([]));

      expect(response.status).toBe(200);
      const rows = await db.select().from(openrouterWorkspaces);
      expect(rows).toHaveLength(0);
    });
  });
});
