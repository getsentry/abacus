import { describe, it, expect, vi, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test-utils/msw-handlers';
import {
  syncOpenRouterUsage,
  syncOpenRouterCron,
  getOpenRouterSyncState,
  getOpenRouterBackfillState,
  backfillOpenRouterUsage,
  NO_OPENROUTER_KEY_ERROR,
} from './openrouter';
import { insertUsageRecord } from '../queries';
import { db, usageRecords, syncState, openrouterKeys } from '../db';
import { eq } from 'drizzle-orm';

// The OpenRouter SDK calls https://openrouter.ai/api/v1/activity
const ACTIVITY_URL = 'https://openrouter.ai/api/v1/activity';

/**
 * Helper to create an OpenRouter ActivityItem as returned by the API.
 * The SDK uses snake_case over the wire and transforms to camelCase.
 * The `date` field comes back as "YYYY-MM-DD HH:MM:SS" (UTC).
 */
function createActivityItem(overrides: {
  date?: string;
  model?: string;
  endpointId?: string;
  promptTokens?: number;
  completionTokens?: number;
  reasoningTokens?: number;
  usage?: number;
  byokUsageInference?: number;
} = {}) {
  return {
    date: overrides.date ?? '2025-01-15 00:00:00',
    model: overrides.model ?? 'anthropic/claude-sonnet-4.5',
    model_permaslug: (overrides.model ?? 'anthropic/claude-sonnet-4.5') + '-20250514',
    provider_name: 'anthropic',
    endpoint_id: overrides.endpointId ?? 'endpoint-abc',
    prompt_tokens: overrides.promptTokens ?? 1000,
    completion_tokens: overrides.completionTokens ?? 200,
    reasoning_tokens: overrides.reasoningTokens ?? 0,
    requests: 10,
    usage: overrides.usage ?? 0.05,
    byok_usage_inference: overrides.byokUsageInference ?? 0,
  };
}

/** Mock the /activity endpoint for a specific key hash */
function mockActivityEndpoint(
  items: ReturnType<typeof createActivityItem>[],
  options: { status?: number } = {}
) {
  server.use(
    http.get(ACTIVITY_URL, () => {
      if (options.status && options.status !== 200) {
        return HttpResponse.json({ error: { message: 'Server error' } }, { status: options.status });
      }
      return HttpResponse.json({ data: items });
    })
  );
}

/** Insert a key into openrouter_keys table */
async function insertKey(hash: string, email: string, revoked = false) {
  await db.insert(openrouterKeys).values({
    hash,
    email,
    name: `Key for ${email}`,
    createdAt: new Date('2025-01-01'),
    revokedAt: revoked ? new Date('2025-01-10') : null,
  });
}

describe('OpenRouter Sync', () => {
  beforeEach(() => {
    vi.stubEnv('OPENROUTER_MANAGEMENT_KEY', 'sk-or-test-key');
  });

  describe('syncOpenRouterUsage', () => {
    it('returns error when management key is not set', async () => {
      vi.stubEnv('OPENROUTER_MANAGEMENT_KEY', '');

      const result = await syncOpenRouterUsage('2025-01-15', '2025-01-15');

      expect(result.success).toBe(false);
      expect(result.errors).toContain(NO_OPENROUTER_KEY_ERROR);
    });

    it('returns success with no records when no keys exist', async () => {
      mockActivityEndpoint([]);

      const result = await syncOpenRouterUsage('2025-01-15', '2025-01-15');

      expect(result.success).toBe(true);
      expect(result.recordsImported).toBe(0);
    });

    it('maps ActivityItem to usage record correctly', async () => {
      await insertKey('hash-abc', 'user@example.com');
      mockActivityEndpoint([
        createActivityItem({
          date: '2025-01-15 00:00:00',
          model: 'anthropic/claude-sonnet-4.5',
          endpointId: 'ep-123',
          promptTokens: 1000,
          completionTokens: 200,
          reasoningTokens: 50,
          usage: 0.075,
        }),
      ]);

      const result = await syncOpenRouterUsage('2025-01-15', '2025-01-15');

      expect(result.success).toBe(true);
      expect(result.recordsImported).toBe(1);

      const records = await db.select().from(usageRecords).where(eq(usageRecords.email, 'user@example.com'));
      expect(records).toHaveLength(1);

      const rec = records[0];
      expect(rec.tool).toBe('openrouter');
      expect(rec.email).toBe('user@example.com');
      expect(rec.date).toBe('2025-01-15');
      expect(rec.rawModel).toBe('anthropic/claude-sonnet-4.5');  // Full slug preserved
      expect(rec.model).toBe('sonnet-4.5');                      // Normalized to canonical form
      expect(Number(rec.inputTokens)).toBe(1000);                // = promptTokens
      expect(Number(rec.outputTokens)).toBe(250);                // = completionTokens + reasoningTokens
      expect(Number(rec.cacheWriteTokens)).toBe(0);
      expect(Number(rec.cacheReadTokens)).toBe(0);
      expect(Number(rec.cost)).toBeCloseTo(0.075);               // USD as-is, no /100
      expect(rec.toolRecordId).toBe('ep-123');                   // = endpointId
    });

    it('outputs completionTokens + reasoningTokens as outputTokens', async () => {
      await insertKey('hash-abc', 'user@example.com');
      mockActivityEndpoint([
        createActivityItem({ completionTokens: 300, reasoningTokens: 150 }),
      ]);

      await syncOpenRouterUsage('2025-01-15', '2025-01-15');

      const records = await db.select().from(usageRecords).where(eq(usageRecords.email, 'user@example.com'));
      expect(Number(records[0].outputTokens)).toBe(450); // 300 + 150
    });

    it('does not divide cost by 100 (usage is already USD)', async () => {
      await insertKey('hash-abc', 'user@example.com');
      mockActivityEndpoint([
        createActivityItem({ usage: 1.23 }),
      ]);

      await syncOpenRouterUsage('2025-01-15', '2025-01-15');

      const records = await db.select().from(usageRecords).where(eq(usageRecords.email, 'user@example.com'));
      expect(Number(records[0].cost)).toBeCloseTo(1.23);
    });

    it('aggregates two keys of the same email into one record', async () => {
      await insertKey('hash-key1', 'shared@example.com');
      await insertKey('hash-key2', 'shared@example.com');

      let callCount = 0;
      server.use(
        http.get(ACTIVITY_URL, () => {
          callCount++;
          if (callCount === 1) {
            // First key call
            return HttpResponse.json({
              data: [createActivityItem({ promptTokens: 1000, completionTokens: 200, reasoningTokens: 0, usage: 0.03 })],
            });
          }
          // Second key call — same date/model/endpoint
          return HttpResponse.json({
            data: [createActivityItem({ promptTokens: 500, completionTokens: 100, reasoningTokens: 50, usage: 0.02 })],
          });
        })
      );

      const result = await syncOpenRouterUsage('2025-01-15', '2025-01-15');

      expect(result.success).toBe(true);
      expect(result.recordsImported).toBe(1); // Aggregated into one record

      const records = await db.select().from(usageRecords).where(eq(usageRecords.email, 'shared@example.com'));
      expect(records).toHaveLength(1);
      expect(Number(records[0].inputTokens)).toBe(1500);           // 1000 + 500
      expect(Number(records[0].outputTokens)).toBe(350);           // (200+0) + (100+50)
      expect(Number(records[0].cost)).toBeCloseTo(0.05);           // 0.03 + 0.02
    });

    it('includes revoked keys in fetch loop', async () => {
      await insertKey('hash-revoked', 'revoked@example.com', true);  // revoked
      mockActivityEndpoint([
        createActivityItem({ date: '2025-01-15 00:00:00' }),
      ]);

      const result = await syncOpenRouterUsage('2025-01-15', '2025-01-15');

      // Revoked key should be fetched — pre-revocation usage still counts
      expect(result.success).toBe(true);
      expect(result.recordsImported).toBe(1);
    });

    it('filters items outside requested date range', async () => {
      await insertKey('hash-abc', 'user@example.com');
      mockActivityEndpoint([
        createActivityItem({ date: '2025-01-10 00:00:00' }), // Before range
        createActivityItem({ date: '2025-01-15 00:00:00' }), // In range
        createActivityItem({ date: '2025-01-20 00:00:00' }), // After range
      ]);

      const result = await syncOpenRouterUsage('2025-01-15', '2025-01-15');

      expect(result.recordsImported).toBe(1); // Only the in-range item
    });

    it('handles a key that returns a 500 error — other keys still processed', { timeout: 20000 }, async () => {
      await insertKey('hash-key1', 'key1@example.com');
      await insertKey('hash-key2', 'key2@example.com');

      // Route by api_key_hash query param: key1 always 500s, key2 succeeds
      server.use(
        http.get(ACTIVITY_URL, ({ request }) => {
          const url = new URL(request.url);
          const keyHash = url.searchParams.get('api_key_hash');
          if (keyHash === 'hash-key1') {
            return HttpResponse.json({ error: 'Internal server error' }, { status: 500 });
          }
          return HttpResponse.json({
            data: [createActivityItem({ date: '2025-01-15 00:00:00', model: 'openai/gpt-4.1' })],
          });
        })
      );

      const result = await syncOpenRouterUsage('2025-01-15', '2025-01-15');

      // One key errored, one succeeded
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      // Second key (key2) was still processed
      expect(result.recordsImported).toBe(1);
    });

    it('treats a 404 on a deleted key as no activity — other keys still imported, result.success true', async () => {
      await insertKey('hash-deleted', 'deleted@example.com');
      await insertKey('hash-active', 'active@example.com');

      // deleted key returns 404; active key returns normal data
      server.use(
        http.get(ACTIVITY_URL, ({ request }) => {
          const url = new URL(request.url);
          const keyHash = url.searchParams.get('api_key_hash');
          if (keyHash === 'hash-deleted') {
            return HttpResponse.json(
              { error: { message: 'Key not found', code: 404 } },
              { status: 404 }
            );
          }
          return HttpResponse.json({
            data: [createActivityItem({ date: '2025-01-15 00:00:00', model: 'openai/gpt-4.1' })],
          });
        })
      );

      const result = await syncOpenRouterUsage('2025-01-15', '2025-01-15');

      // 404 treated as no activity — not an error
      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
      // Active key's data was imported
      expect(result.recordsImported).toBe(1);
      // Sync state updated
      const state = await getOpenRouterSyncState();
      expect(state.lastSyncedDate).toBe('2025-01-15');
    });

    it('re-sync is idempotent (UPSERT does not duplicate records)', async () => {
      await insertKey('hash-abc', 'user@example.com');
      mockActivityEndpoint([
        createActivityItem({ promptTokens: 1000, completionTokens: 200, usage: 0.05 }),
      ]);

      await syncOpenRouterUsage('2025-01-15', '2025-01-15');

      // Re-sync same data
      mockActivityEndpoint([
        createActivityItem({ promptTokens: 1000, completionTokens: 200, usage: 0.05 }),
      ]);
      await syncOpenRouterUsage('2025-01-15', '2025-01-15');

      const records = await db.select().from(usageRecords).where(eq(usageRecords.email, 'user@example.com'));
      expect(records).toHaveLength(1); // Not duplicated
    });
  });

  describe('model normalization', () => {
    beforeEach(async () => {
      await insertKey('hash-abc', 'user@example.com');
    });

    it('strips vendor prefix and normalizes anthropic/claude-sonnet-4.5 to canonical sonnet-4.5', async () => {
      mockActivityEndpoint([createActivityItem({ model: 'anthropic/claude-sonnet-4.5' })]);
      await syncOpenRouterUsage('2025-01-15', '2025-01-15');

      const records = await db.select().from(usageRecords).where(eq(usageRecords.email, 'user@example.com'));
      expect(records[0].rawModel).toBe('anthropic/claude-sonnet-4.5');
      expect(records[0].model).toBe('sonnet-4.5'); // Normalized to canonical form
    });

    it('passes through openai/gpt-4.1 without mangling', async () => {
      mockActivityEndpoint([createActivityItem({ model: 'openai/gpt-4.1' })]);
      await syncOpenRouterUsage('2025-01-15', '2025-01-15');

      const records = await db.select().from(usageRecords).where(eq(usageRecords.email, 'user@example.com'));
      expect(records[0].rawModel).toBe('openai/gpt-4.1');
      expect(records[0].model).toBe('gpt-4.1'); // tail passes through normalizeModelName unchanged
    });

    it('passes through google/gemini-2.5-pro without mangling', async () => {
      mockActivityEndpoint([createActivityItem({ model: 'google/gemini-2.5-pro' })]);
      await syncOpenRouterUsage('2025-01-15', '2025-01-15');

      const records = await db.select().from(usageRecords).where(eq(usageRecords.email, 'user@example.com'));
      expect(records[0].rawModel).toBe('google/gemini-2.5-pro');
      expect(records[0].model).toBe('gemini-2.5-pro');
    });
  });

  describe('syncOpenRouterCron', () => {
    it('returns error when management key is not set', async () => {
      vi.stubEnv('OPENROUTER_MANAGEMENT_KEY', '');

      const result = await syncOpenRouterCron();

      expect(result.success).toBe(false);
      expect(result.errors).toContain(NO_OPENROUTER_KEY_ERROR);
    });

    it('returns early (no sync) if the latest completed day is already synced', async () => {
      const yesterday = new Date();
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      await db.insert(syncState).values({
        id: 'openrouter',
        lastSyncAt: new Date(),
        lastSyncedHourEnd: yesterdayStr,
      });

      const result = await syncOpenRouterCron();

      expect(result.success).toBe(true);
      expect(result.recordsImported).toBe(0);
      expect(result.syncedRange).toBeUndefined();
    });

    it('syncs the last two completed days when not synced yet', async () => {
      mockActivityEndpoint([]);

      const result = await syncOpenRouterCron();

      expect(result.success).toBe(true);
      // State should be updated to yesterday (latest completed UTC day)
      const yesterday = new Date();
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      const state = await getOpenRouterSyncState();
      expect(state.lastSyncedDate).toBe(yesterday.toISOString().split('T')[0]);
    });
  });

  describe('backfillOpenRouterUsage', () => {
    it('returns error when management key is not set', async () => {
      vi.stubEnv('OPENROUTER_MANAGEMENT_KEY', '');

      const result = await backfillOpenRouterUsage();

      expect(result.success).toBe(false);
      expect(result.errors).toContain(NO_OPENROUTER_KEY_ERROR);
    });

    it('returns immediately if backfill is already marked complete', async () => {
      await db.insert(syncState).values({
        id: 'openrouter',
        lastSyncAt: new Date(),
        backfillComplete: true,
      });

      const result = await backfillOpenRouterUsage();

      expect(result.success).toBe(true);
      expect(result.recordsImported).toBe(0);
    });

    it('marks backfill complete after successful full-window sync', async () => {
      await insertKey('hash-abc', 'user@example.com');
      mockActivityEndpoint([]);

      const result = await backfillOpenRouterUsage();

      expect(result.success).toBe(true);

      const state = await getOpenRouterBackfillState();
      expect(state.isComplete).toBe(true);
    });
  });

  describe('getOpenRouterBackfillState', () => {
    it('returns null oldestDate when no data exists', async () => {
      const state = await getOpenRouterBackfillState();
      expect(state.oldestDate).toBeNull();
      expect(state.isComplete).toBe(false);
    });

    it('derives oldestDate from actual usage data', async () => {
      await insertUsageRecord({
        date: '2025-01-10',
        email: 'user@example.com',
        tool: 'openrouter',
        model: 'sonnet-4.5',
        rawModel: 'anthropic/claude-sonnet-4.5',
        inputTokens: 1000,
        outputTokens: 200,
        cacheWriteTokens: 0,
        cacheReadTokens: 0,
        cost: 0.05,
      });

      const state = await getOpenRouterBackfillState();
      expect(state.oldestDate).toBe('2025-01-10');
    });
  });
});
