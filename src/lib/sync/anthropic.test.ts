import { describe, it, expect, vi, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test-utils/msw-handlers';
import {
  syncAnthropicUsage,
  syncAnthropicCron,
  getAnthropicSyncState,
  getAnthropicBackfillState,
} from './anthropic';
import { insertUsageRecord } from '../queries';
import { db, usageRecords, syncState, identityMappings } from '../db';
import { eq, and } from 'drizzle-orm';

// Helper to create Anthropic API response data
function createAnthropicUsageResult(overrides: {
  api_key_id?: string | null;
  model?: string | null;
  uncached_input_tokens?: number;
  cache_creation_ephemeral_5m?: number;
  cache_creation_ephemeral_1h?: number;
  cache_read_input_tokens?: number;
  output_tokens?: number;
} = {}) {
  return {
    api_key_id: overrides.api_key_id ?? 'test-key-123',
    workspace_id: 'ws-test',
    model: overrides.model ?? 'claude-sonnet-4-20250514',
    service_tier: null,
    context_window: null,
    uncached_input_tokens: overrides.uncached_input_tokens ?? 1000,
    cache_creation: {
      ephemeral_1h_input_tokens: overrides.cache_creation_ephemeral_1h ?? 0,
      ephemeral_5m_input_tokens: overrides.cache_creation_ephemeral_5m ?? 100,
    },
    cache_read_input_tokens: overrides.cache_read_input_tokens ?? 500,
    output_tokens: overrides.output_tokens ?? 200,
    server_tool_use: { web_search_requests: 0 },
  };
}

// Helper to set up Anthropic API mock with specific results
function mockAnthropicAPI(
  results: ReturnType<typeof createAnthropicUsageResult>[],
  date: string = '2025-01-15',
  hasMore: boolean = false
) {
  server.use(
    http.get('https://api.anthropic.com/v1/organizations/usage_report/messages', () => {
      return HttpResponse.json({
        data: [
          {
            starting_at: `${date}T00:00:00Z`,
            ending_at: `${date}T23:59:59Z`,
            results,
          },
        ],
        has_more: hasMore,
        next_page: hasMore ? 'page2' : undefined,
      });
    })
  );
}

// Helper to seed identity mapping
async function seedIdentityMapping(apiKeyId: string, email: string) {
  await db.insert(identityMappings).values({
    source: 'claude_code',
    externalId: apiKeyId,
    email,
  });
}

describe('Anthropic Sync', () => {
  beforeEach(() => {
    vi.stubEnv('ANTHROPIC_ADMIN_KEY', 'test-anthropic-key');
  });

  describe('syncAnthropicUsage', () => {
    it('returns error when ANTHROPIC_ADMIN_KEY not configured', async () => {
      vi.stubEnv('ANTHROPIC_ADMIN_KEY', '');

      const result = await syncAnthropicUsage('2025-01-01', '2025-01-07');

      expect(result.success).toBe(false);
      expect(result.errors).toContain('ANTHROPIC_ADMIN_KEY not configured');
    });

    it('imports usage records from Anthropic API', async () => {
      await seedIdentityMapping('test-key-123', 'user1@example.com');
      mockAnthropicAPI([createAnthropicUsageResult()]);

      const result = await syncAnthropicUsage('2025-01-15', '2025-01-15');

      expect(result.success).toBe(true);
      expect(result.recordsImported).toBe(1);

      // Verify record was inserted with normalized model
      const records = await db
        .select()
        .from(usageRecords)
        .where(eq(usageRecords.email, 'user1@example.com'));
      expect(records).toHaveLength(1);
      expect(records[0].model).toBe('sonnet-4'); // normalized
      expect(records[0].rawModel).toBe('claude-sonnet-4-20250514');
      expect(records[0].tool).toBe('claude_code');
      expect(Number(records[0].inputTokens)).toBe(1000);
      expect(Number(records[0].outputTokens)).toBe(200);
      expect(Number(records[0].cacheWriteTokens)).toBe(100); // 5m ephemeral
      expect(Number(records[0].cacheReadTokens)).toBe(500);
    });

    it('stores toolRecordId for per-API-key tracking', async () => {
      await seedIdentityMapping('test-key-123', 'user1@example.com');
      mockAnthropicAPI([createAnthropicUsageResult({ api_key_id: 'test-key-123' })]);

      await syncAnthropicUsage('2025-01-15', '2025-01-15');

      const records = await db
        .select()
        .from(usageRecords)
        .where(eq(usageRecords.email, 'user1@example.com'));
      expect(records).toHaveLength(1);
      expect(records[0].toolRecordId).toBe('test-key-123');
    });

    it('keeps records from different API keys separate', async () => {
      await seedIdentityMapping('key-1', 'user1@example.com');
      await seedIdentityMapping('key-2', 'user1@example.com');

      mockAnthropicAPI([
        createAnthropicUsageResult({ api_key_id: 'key-1', uncached_input_tokens: 1000 }),
        createAnthropicUsageResult({ api_key_id: 'key-2', uncached_input_tokens: 2000 }),
      ]);

      const result = await syncAnthropicUsage('2025-01-15', '2025-01-15');

      expect(result.success).toBe(true);
      expect(result.recordsImported).toBe(2);

      // Both records should exist with same email but different toolRecordId
      const records = await db
        .select()
        .from(usageRecords)
        .where(eq(usageRecords.email, 'user1@example.com'));
      expect(records).toHaveLength(2);
      const toolRecordIds = records.map(r => r.toolRecordId).sort();
      expect(toolRecordIds).toEqual(['key-1', 'key-2']);
    });

    it('handles rate limit response', async () => {
      server.use(
        http.get('https://api.anthropic.com/v1/organizations/usage_report/messages', () => {
          return HttpResponse.json(
            { error: { message: 'Rate limit exceeded' } },
            { status: 429 }
          );
        })
      );

      const result = await syncAnthropicUsage('2025-01-15', '2025-01-15');

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('rate limited'))).toBe(true);
    });

    it('handles API error response', async () => {
      server.use(
        http.get('https://api.anthropic.com/v1/organizations/usage_report/messages', () => {
          return HttpResponse.json(
            { error: { message: 'Internal server error' } },
            { status: 500 }
          );
        })
      );

      const result = await syncAnthropicUsage('2025-01-15', '2025-01-15');

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('500'))).toBe(true);
    });

    it('upserts on conflict (same date/email/tool/rawModel/toolRecordId)', async () => {
      await seedIdentityMapping('test-key-123', 'user1@example.com');

      // First sync
      mockAnthropicAPI([
        createAnthropicUsageResult({ uncached_input_tokens: 1000, output_tokens: 500 }),
      ]);

      await syncAnthropicUsage('2025-01-15', '2025-01-15');

      // Second sync with same key but different values
      mockAnthropicAPI([
        createAnthropicUsageResult({ uncached_input_tokens: 2000, output_tokens: 1000 }),
      ]);

      const result = await syncAnthropicUsage('2025-01-15', '2025-01-15');

      expect(result.success).toBe(true);

      // Should upsert, not create duplicate
      const records = await db
        .select()
        .from(usageRecords)
        .where(eq(usageRecords.email, 'user1@example.com'));
      expect(records).toHaveLength(1);
      expect(Number(records[0].inputTokens)).toBe(2000); // Updated value
    });

    it('calculates and stores cost', async () => {
      await seedIdentityMapping('test-key-123', 'user1@example.com');
      mockAnthropicAPI([
        createAnthropicUsageResult({
          uncached_input_tokens: 1000000,
          output_tokens: 100000,
        }),
      ]);

      await syncAnthropicUsage('2025-01-15', '2025-01-15');

      const records = await db
        .select()
        .from(usageRecords)
        .where(eq(usageRecords.email, 'user1@example.com'));
      expect(records).toHaveLength(1);
      expect(Number(records[0].cost)).toBeGreaterThan(0); // Cost should be calculated
    });

    it('combines ephemeral 1h and 5m cache tokens', async () => {
      await seedIdentityMapping('test-key-123', 'user1@example.com');
      mockAnthropicAPI([
        createAnthropicUsageResult({
          cache_creation_ephemeral_1h: 500,
          cache_creation_ephemeral_5m: 300,
        }),
      ]);

      await syncAnthropicUsage('2025-01-15', '2025-01-15');

      const records = await db
        .select()
        .from(usageRecords)
        .where(eq(usageRecords.email, 'user1@example.com'));
      expect(records).toHaveLength(1);
      expect(Number(records[0].cacheWriteTokens)).toBe(800); // 500 + 300
    });
  });

  describe('syncAnthropicCron', () => {
    it('returns error when ANTHROPIC_ADMIN_KEY not configured', async () => {
      vi.stubEnv('ANTHROPIC_ADMIN_KEY', '');

      const result = await syncAnthropicCron();

      expect(result.success).toBe(false);
      expect(result.errors).toContain('ANTHROPIC_ADMIN_KEY not configured');
    });

    it('does not update sync state on rate limit', async () => {
      // Set initial state
      await db
        .insert(syncState)
        .values({
          id: 'anthropic',
          lastSyncAt: new Date('2025-01-10'),
          lastSyncedHourEnd: '2025-01-10',
        });

      server.use(
        http.get('https://api.anthropic.com/v1/organizations/usage_report/messages', () => {
          return HttpResponse.json(
            { error: { message: 'Rate limit exceeded' } },
            { status: 429 }
          );
        })
      );

      await syncAnthropicCron();

      // State should not be updated
      const state = await getAnthropicSyncState();
      expect(state.lastSyncedDate).toBe('2025-01-10');
    });
  });

  describe('backfill state', () => {
    it('returns null oldestDate when no data exists', async () => {
      const state = await getAnthropicBackfillState();

      expect(state.oldestDate).toBeNull();
      expect(state.isComplete).toBe(false);
    });

    it('derives oldestDate from actual usage data', async () => {
      // Insert some usage records
      await insertUsageRecord({
        date: '2025-01-10',
        email: 'user@example.com',
        tool: 'claude_code',
        model: 'sonnet-4',
        rawModel: 'claude-sonnet-4-20250514',
        inputTokens: 1000,
        outputTokens: 500,
        cacheWriteTokens: 0,
        cacheReadTokens: 0,
        cost: 0.05,
      });

      await insertUsageRecord({
        date: '2025-01-15',
        email: 'user@example.com',
        tool: 'claude_code',
        model: 'sonnet-4',
        rawModel: 'claude-sonnet-4-20250514',
        inputTokens: 2000,
        outputTokens: 1000,
        cacheWriteTokens: 0,
        cacheReadTokens: 0,
        cost: 0.10,
      });

      const state = await getAnthropicBackfillState();

      expect(state.oldestDate).toBe('2025-01-10'); // Oldest date
    });

    it('reports isComplete from sync_state table', async () => {
      await db.insert(syncState).values({
        id: 'anthropic',
        lastSyncAt: new Date(),
        backfillComplete: true,
      });

      const state = await getAnthropicBackfillState();

      expect(state.isComplete).toBe(true);
    });
  });

  describe('model normalization', () => {
    it('normalizes model names correctly', async () => {
      await seedIdentityMapping('test-key-123', 'user1@example.com');
      mockAnthropicAPI([
        createAnthropicUsageResult({ model: 'claude-sonnet-4-20250514' }),
      ]);

      await syncAnthropicUsage('2025-01-15', '2025-01-15');

      const records = await db
        .select()
        .from(usageRecords)
        .where(eq(usageRecords.email, 'user1@example.com'));
      expect(records).toHaveLength(1);
      expect(records[0].model).toBe('sonnet-4'); // Normalized
      expect(records[0].rawModel).toBe('claude-sonnet-4-20250514'); // Raw preserved
    });

    it('normalizes older model name format', async () => {
      await seedIdentityMapping('test-key-123', 'user1@example.com');
      mockAnthropicAPI([
        createAnthropicUsageResult({ model: 'claude-3-5-sonnet-20241022' }),
      ]);

      await syncAnthropicUsage('2025-01-15', '2025-01-15');

      const records = await db
        .select()
        .from(usageRecords)
        .where(eq(usageRecords.email, 'user1@example.com'));
      expect(records).toHaveLength(1);
      expect(records[0].model).toBe('sonnet-3.5'); // Normalized
      expect(records[0].rawModel).toBe('claude-3-5-sonnet-20241022'); // Raw preserved
    });
  });
});
