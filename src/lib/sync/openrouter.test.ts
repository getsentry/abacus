import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test-utils/msw-handlers';
import {
  syncOpenRouterUsage,
  syncOpenRouterCron,
  getOpenRouterSyncState,
  normalizeOpenRouterModel,
  NO_OPENROUTER_KEY_ERROR,
} from './openrouter';
import { db, usageRecords } from '../db';
import { eq } from 'drizzle-orm';

const API = 'https://openrouter.ai/api/v1';
const WORKSPACE_ID = '550e8400-e29b-41d4-a716-446655440000';

function activityItem(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    date: '2026-01-15',
    model: 'anthropic/claude-sonnet-4.5',
    model_permaslug: 'anthropic/claude-sonnet-4.5-20250929',
    endpoint_id: 'endpoint-1',
    provider_name: 'Anthropic',
    usage: 0.5,
    byok_usage_inference: 0,
    requests: 3,
    prompt_tokens: 1000,
    completion_tokens: 200,
    reasoning_tokens: 0,
    cached_tokens: 400,
    ...overrides,
  };
}

interface MockOptions {
  members?: { id: string; email: string }[];
  workspaceMembers?: string[];
  activityByUser?: Record<string, ReturnType<typeof activityItem>[]>;
  activityStatus?: number;
}

function mockOpenRouterAPI(options: MockOptions = {}) {
  const members = options.members ?? [
    { id: 'user_1', email: 'user1@example.com' },
    { id: 'user_2', email: 'user2@example.com' },
  ];
  const activityRequests: URLSearchParams[] = [];

  server.use(
    http.get(`${API}/organization/members`, () =>
      HttpResponse.json({
        data: members.map((m) => ({ ...m, first_name: null, last_name: null, role: 'org:member' })),
        total_count: members.length,
      })
    ),
    http.get(`${API}/workspaces/:ref`, ({ params }) =>
      HttpResponse.json({ data: { id: WORKSPACE_ID, slug: params.ref === WORKSPACE_ID ? 'eng' : params.ref } })
    ),
    http.get(`${API}/workspaces/:id/members`, () => {
      const ids = options.workspaceMembers ?? members.map((m) => m.id);
      return HttpResponse.json({
        data: ids.map((user_id) => ({ id: `m-${user_id}`, workspace_id: WORKSPACE_ID, user_id, role: 'member', created_at: '' })),
        total_count: ids.length,
      });
    }),
    http.get(`${API}/activity`, ({ request }) => {
      const url = new URL(request.url);
      activityRequests.push(url.searchParams);
      if (options.activityStatus) {
        return HttpResponse.json({ error: { message: 'nope' } }, { status: options.activityStatus });
      }
      const userId = url.searchParams.get('user_id') || '';
      return HttpResponse.json({ data: options.activityByUser?.[userId] ?? [] });
    })
  );

  return { activityRequests };
}

describe('OpenRouter Sync', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-20T12:00:00Z'));
    vi.stubEnv('OPENROUTER_MANAGEMENT_KEY', 'test-openrouter-key');
    vi.stubEnv('OPENROUTER_WORKSPACES', '');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('normalizeOpenRouterModel', () => {
    it('strips vendor prefix and variant suffix', () => {
      expect(normalizeOpenRouterModel('anthropic/claude-sonnet-4.5')).toBe('sonnet-4.5');
      expect(normalizeOpenRouterModel('anthropic/claude-3.7-sonnet:thinking')).toBe('sonnet-3.7');
      expect(normalizeOpenRouterModel('openai/gpt-4.1')).toBe('gpt-4.1');
    });
  });

  describe('syncOpenRouterUsage', () => {
    it('returns error when no management key configured', async () => {
      vi.stubEnv('OPENROUTER_MANAGEMENT_KEY', '');

      const result = await syncOpenRouterUsage('2026-01-15', '2026-01-15');

      expect(result.success).toBe(false);
      expect(result.errors).toContain(NO_OPENROUTER_KEY_ERROR);
    });

    it('imports per-member activity across all workspaces', async () => {
      const { activityRequests } = mockOpenRouterAPI({
        activityByUser: {
          user_1: [
            activityItem(),
            // Same model on another endpoint aggregates into one record
            activityItem({ endpoint_id: 'endpoint-2', provider_name: 'Amazon Bedrock', prompt_tokens: 500, cached_tokens: 0, completion_tokens: 100, usage: 0.25, byok_usage_inference: 0.1 }),
          ],
        },
      });

      const result = await syncOpenRouterUsage('2026-01-15', '2026-01-15');

      expect(result.success).toBe(true);
      expect(result.recordsImported).toBe(1);
      expect(activityRequests.every((p) => !p.has('workspace_id'))).toBe(true);

      const records = await db.select().from(usageRecords).where(eq(usageRecords.email, 'user1@example.com'));
      expect(records).toHaveLength(1);
      expect(records[0].tool).toBe('openrouter');
      expect(records[0].model).toBe('sonnet-4.5');
      expect(records[0].rawModel).toBe('anthropic/claude-sonnet-4.5');
      expect(Number(records[0].inputTokens)).toBe(1100); // (1000 - 400) + 500
      expect(Number(records[0].cacheReadTokens)).toBe(400);
      expect(Number(records[0].outputTokens)).toBe(300);
      expect(Number(records[0].cost)).toBeCloseTo(0.85);
      expect(records[0].organizationId).toBeNull();
    });

    it('only imports members of configured workspaces', async () => {
      vi.stubEnv('OPENROUTER_WORKSPACES', 'eng');
      const { activityRequests } = mockOpenRouterAPI({
        workspaceMembers: ['user_2'],
        activityByUser: {
          user_1: [activityItem()],
          user_2: [activityItem()],
        },
      });

      const result = await syncOpenRouterUsage('2026-01-15', '2026-01-15');

      expect(result.success).toBe(true);
      expect(result.recordsImported).toBe(1);
      expect(activityRequests).toHaveLength(1);
      expect(activityRequests[0].get('user_id')).toBe('user_2');
      expect(activityRequests[0].get('workspace_id')).toBe(WORKSPACE_ID);

      const records = await db.select().from(usageRecords).where(eq(usageRecords.tool, 'openrouter'));
      expect(records).toHaveLength(1);
      expect(records[0].email).toBe('user2@example.com');
      expect(records[0].organizationId).toBe(`openrouter:${WORKSPACE_ID}`);
    });

    it('filters to the requested date range and skips empty rows', async () => {
      mockOpenRouterAPI({
        activityByUser: {
          user_1: [
            activityItem({ date: '2026-01-14' }),
            activityItem({ date: '2026-01-15', prompt_tokens: 0, completion_tokens: 0, cached_tokens: 0 }),
          ],
        },
      });

      const result = await syncOpenRouterUsage('2026-01-15', '2026-01-15');

      expect(result.recordsImported).toBe(0);
      expect(result.recordsSkipped).toBe(1);
    });

    it('clamps the start date to the 30-day activity window', async () => {
      mockOpenRouterAPI();

      const result = await syncOpenRouterUsage('2025-01-01', '2026-01-19');

      // Window is the 30 completed UTC days before today (2026-01-20)
      expect(result.syncedRange).toEqual({ startDate: '2025-12-21', endDate: '2026-01-19' });
    });

    it('reports API failures', async () => {
      mockOpenRouterAPI({ activityStatus: 403 });

      const result = await syncOpenRouterUsage('2026-01-15', '2026-01-15');

      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('403');
    });
  });

  describe('syncOpenRouterCron', () => {
    it('syncs the 30 completed days first, then resumes from the last synced date', async () => {
      mockOpenRouterAPI({ activityByUser: { user_1: [activityItem()] } });

      const first = await syncOpenRouterCron();
      expect(first.success).toBe(true);
      // Today (2026-01-20) is excluded: OpenRouter only returns completed UTC days
      expect(first.syncedRange).toEqual({ startDate: '2025-12-21', endDate: '2026-01-19' });
      expect((await getOpenRouterSyncState()).lastSyncedDate).toBe('2026-01-19');

      vi.setSystemTime(new Date('2026-01-21T00:15:00Z'));
      const second = await syncOpenRouterCron();
      expect(second.syncedRange).toEqual({ startDate: '2026-01-18', endDate: '2026-01-20' });
      expect((await getOpenRouterSyncState()).lastSyncedDate).toBe('2026-01-20');
    });

    it('does not advance sync state on failure', async () => {
      mockOpenRouterAPI({ activityStatus: 500 });

      const result = await syncOpenRouterCron();

      expect(result.success).toBe(false);
      expect((await getOpenRouterSyncState()).lastSyncedDate).toBeNull();
    });
  });
});
