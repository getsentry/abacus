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
import { db, usageRecords, syncState } from '../db';
import { eq } from 'drizzle-orm';

/**
 * Helper to create Claude Code Analytics API response data
 * Matches the structure from /v1/organizations/usage_report/claude_code
 */
function createClaudeCodeRecord(overrides: {
  email?: string;
  date?: string;
  model?: string;
  input?: number;
  output?: number;
  cache_read?: number;
  cache_creation?: number;
  estimated_cost_cents?: number;
} = {}) {
  return {
    date: `${overrides.date ?? '2025-01-15'}T00:00:00Z`,
    actor: {
      type: 'user_actor' as const,
      email_address: overrides.email ?? 'user1@example.com',
    },
    organization_id: 'org-test-123',
    customer_type: 'api' as const,
    terminal_type: 'vscode',
    core_metrics: {
      num_sessions: 5,
      lines_of_code: { added: 100, removed: 50 },
      commits_by_claude_code: 2,
      pull_requests_by_claude_code: 1,
    },
    tool_actions: {
      edit_tool: { accepted: 10, rejected: 2 },
      write_tool: { accepted: 5, rejected: 1 },
      notebook_edit_tool: { accepted: 0, rejected: 0 },
    },
    model_breakdown: [
      {
        model: overrides.model ?? 'claude-sonnet-4-20250514',
        tokens: {
          input: overrides.input ?? 1000,
          output: overrides.output ?? 200,
          cache_read: overrides.cache_read ?? 500,
          cache_creation: overrides.cache_creation ?? 100,
        },
        estimated_cost: {
          currency: 'USD',
          amount: overrides.estimated_cost_cents ?? 450, // in cents
        },
      },
    ],
  };
}

/**
 * Helper to set up Claude Code Analytics API mock
 */
function mockClaudeCodeAPI(
  records: ReturnType<typeof createClaudeCodeRecord>[],
  hasMore: boolean = false
) {
  server.use(
    http.get('https://api.anthropic.com/v1/organizations/usage_report/claude_code', () => {
      return HttpResponse.json({
        data: records,
        has_more: hasMore,
        next_page: hasMore ? 'page2' : null,
      });
    })
  );
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

    it('imports usage records from Claude Code Analytics API', async () => {
      mockClaudeCodeAPI([createClaudeCodeRecord()]);

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
      expect(Number(records[0].cacheWriteTokens)).toBe(100);
      expect(Number(records[0].cacheReadTokens)).toBe(500);
    });

    it('uses email directly from API (no mapping needed)', async () => {
      mockClaudeCodeAPI([
        createClaudeCodeRecord({ email: 'direct@example.com' }),
      ]);

      await syncAnthropicUsage('2025-01-15', '2025-01-15');

      const records = await db
        .select()
        .from(usageRecords)
        .where(eq(usageRecords.email, 'direct@example.com'));
      expect(records).toHaveLength(1);
    });

    it('keeps records from different users separate', async () => {
      mockClaudeCodeAPI([
        createClaudeCodeRecord({ email: 'user1@example.com', input: 1000 }),
        createClaudeCodeRecord({ email: 'user2@example.com', input: 2000 }),
      ]);

      const result = await syncAnthropicUsage('2025-01-15', '2025-01-15');

      expect(result.success).toBe(true);
      expect(result.recordsImported).toBe(2);

      const records = await db
        .select()
        .from(usageRecords);
      expect(records).toHaveLength(2);
      const emails = records.map(r => r.email).sort();
      expect(emails).toEqual(['user1@example.com', 'user2@example.com']);
    });

    it('handles rate limit response', async () => {
      server.use(
        http.get('https://api.anthropic.com/v1/organizations/usage_report/claude_code', () => {
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
        http.get('https://api.anthropic.com/v1/organizations/usage_report/claude_code', () => {
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

    it('upserts on conflict (same date/email/tool/rawModel)', async () => {
      // First sync
      mockClaudeCodeAPI([
        createClaudeCodeRecord({ input: 1000, output: 500 }),
      ]);

      await syncAnthropicUsage('2025-01-15', '2025-01-15');

      // Second sync with same user but different values
      mockClaudeCodeAPI([
        createClaudeCodeRecord({ input: 2000, output: 1000 }),
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

    it('uses estimated_cost from Anthropic API', async () => {
      mockClaudeCodeAPI([
        createClaudeCodeRecord({
          input: 1000000,
          output: 100000,
          estimated_cost_cents: 450, // $4.50 in cents
        }),
      ]);

      await syncAnthropicUsage('2025-01-15', '2025-01-15');

      const records = await db
        .select()
        .from(usageRecords)
        .where(eq(usageRecords.email, 'user1@example.com'));
      expect(records).toHaveLength(1);
      expect(Number(records[0].cost)).toBeCloseTo(4.50); // Converted from cents to dollars
    });

    it('stores cache tokens from API', async () => {
      mockClaudeCodeAPI([
        createClaudeCodeRecord({
          cache_creation: 800,
          cache_read: 1200,
        }),
      ]);

      await syncAnthropicUsage('2025-01-15', '2025-01-15');

      const records = await db
        .select()
        .from(usageRecords)
        .where(eq(usageRecords.email, 'user1@example.com'));
      expect(records).toHaveLength(1);
      expect(Number(records[0].cacheWriteTokens)).toBe(800);
      expect(Number(records[0].cacheReadTokens)).toBe(1200);
    });

    it('resolves email for api_actor via API key mappings', async () => {
      // Mock API key mappings endpoints
      server.use(
        // Mock users endpoint
        http.get('https://api.anthropic.com/v1/organizations/users', () => {
          return HttpResponse.json({
            data: [
              { id: 'user-123', email: 'apikey-owner@example.com', name: 'Test User', role: 'developer', type: 'user', added_at: '2024-01-01T00:00:00Z' }
            ],
            has_more: false,
            first_id: 'user-123',
            last_id: 'user-123',
          });
        }),
        // Mock API keys endpoint
        http.get('https://api.anthropic.com/v1/organizations/api_keys', () => {
          return HttpResponse.json({
            data: [
              { id: 'key-123', name: 'test-api-key', created_at: '2024-01-01T00:00:00Z', created_by: { id: 'user-123', type: 'user' }, partial_key_hint: 'sk-ant-...abc', status: 'active', workspace_id: 'ws-123', type: 'user_key' }
            ],
            has_more: false,
            first_id: 'key-123',
            last_id: 'key-123',
          });
        }),
        // Mock Claude Code Analytics API with api_actor
        http.get('https://api.anthropic.com/v1/organizations/usage_report/claude_code', () => {
          return HttpResponse.json({
            data: [
              {
                date: '2025-01-15T00:00:00Z',
                actor: {
                  type: 'api_actor',
                  api_key_name: 'test-api-key',
                },
                organization_id: 'org-test',
                customer_type: 'api',
                terminal_type: 'vscode',
                core_metrics: { num_sessions: 1, lines_of_code: { added: 0, removed: 0 }, commits_by_claude_code: 0, pull_requests_by_claude_code: 0 },
                tool_actions: { edit_tool: { accepted: 0, rejected: 0 }, write_tool: { accepted: 0, rejected: 0 }, notebook_edit_tool: { accepted: 0, rejected: 0 } },
                model_breakdown: [{
                  model: 'claude-sonnet-4-20250514',
                  tokens: { input: 1000, output: 200, cache_read: 0, cache_creation: 0 },
                  estimated_cost: { currency: 'USD', amount: 100 },
                }],
              },
            ],
            has_more: false,
            next_page: null,
          });
        })
      );

      const result = await syncAnthropicUsage('2025-01-15', '2025-01-15');

      expect(result.success).toBe(true);
      expect(result.recordsImported).toBe(1);
      expect(result.recordsSkipped).toBe(0);

      // Verify record was inserted with resolved email
      const records = await db
        .select()
        .from(usageRecords)
        .where(eq(usageRecords.email, 'apikey-owner@example.com'));
      expect(records).toHaveLength(1);
      expect(records[0].email).toBe('apikey-owner@example.com');
    });

    it('aggregates multiple api_actor records for same user/model', async () => {
      // Mock API key mappings - both keys belong to same user
      server.use(
        http.get('https://api.anthropic.com/v1/organizations/users', () => {
          return HttpResponse.json({
            data: [
              { id: 'user-123', email: 'developer@example.com', name: 'Test User', role: 'developer', type: 'user', added_at: '2024-01-01T00:00:00Z' }
            ],
            has_more: false,
            first_id: 'user-123',
            last_id: 'user-123',
          });
        }),
        http.get('https://api.anthropic.com/v1/organizations/api_keys', () => {
          return HttpResponse.json({
            data: [
              { id: 'key-prod', name: 'production-key', created_at: '2024-01-01T00:00:00Z', created_by: { id: 'user-123', type: 'user' }, partial_key_hint: 'sk-ant-...abc', status: 'active', workspace_id: 'ws-123', type: 'user_key' },
              { id: 'key-dev', name: 'development-key', created_at: '2024-01-01T00:00:00Z', created_by: { id: 'user-123', type: 'user' }, partial_key_hint: 'sk-ant-...xyz', status: 'active', workspace_id: 'ws-123', type: 'user_key' }
            ],
            has_more: false,
            first_id: 'key-prod',
            last_id: 'key-dev',
          });
        }),
        // Mock Claude Code Analytics API with 2 separate records (different API keys, same user)
        http.get('https://api.anthropic.com/v1/organizations/usage_report/claude_code', () => {
          return HttpResponse.json({
            data: [
              {
                date: '2025-01-15T00:00:00Z',
                actor: { type: 'api_actor', api_key_name: 'production-key' },
                organization_id: 'org-test',
                customer_type: 'api',
                terminal_type: 'vscode',
                core_metrics: { num_sessions: 1, lines_of_code: { added: 0, removed: 0 }, commits_by_claude_code: 0, pull_requests_by_claude_code: 0 },
                tool_actions: { edit_tool: { accepted: 0, rejected: 0 }, write_tool: { accepted: 0, rejected: 0 }, notebook_edit_tool: { accepted: 0, rejected: 0 } },
                model_breakdown: [{
                  model: 'claude-sonnet-4-20250514',
                  tokens: { input: 1000, output: 200, cache_read: 500, cache_creation: 100 },
                  estimated_cost: { currency: 'USD', amount: 150 }, // $1.50
                }],
              },
              {
                date: '2025-01-15T00:00:00Z',
                actor: { type: 'api_actor', api_key_name: 'development-key' },
                organization_id: 'org-test',
                customer_type: 'api',
                terminal_type: 'vscode',
                core_metrics: { num_sessions: 1, lines_of_code: { added: 0, removed: 0 }, commits_by_claude_code: 0, pull_requests_by_claude_code: 0 },
                tool_actions: { edit_tool: { accepted: 0, rejected: 0 }, write_tool: { accepted: 0, rejected: 0 }, notebook_edit_tool: { accepted: 0, rejected: 0 } },
                model_breakdown: [{
                  model: 'claude-sonnet-4-20250514',
                  tokens: { input: 2000, output: 400, cache_read: 300, cache_creation: 200 },
                  estimated_cost: { currency: 'USD', amount: 250 }, // $2.50
                }],
              },
            ],
            has_more: false,
            next_page: null,
          });
        })
      );

      const result = await syncAnthropicUsage('2025-01-15', '2025-01-15');

      expect(result.success).toBe(true);
      expect(result.recordsImported).toBe(1); // Should be 1 aggregated record, not 2
      expect(result.recordsSkipped).toBe(0);

      // Verify aggregated record has summed values
      const records = await db
        .select()
        .from(usageRecords)
        .where(eq(usageRecords.email, 'developer@example.com'));
      expect(records).toHaveLength(1);
      expect(records[0].email).toBe('developer@example.com');
      expect(Number(records[0].inputTokens)).toBe(3000); // 1000 + 2000
      expect(Number(records[0].outputTokens)).toBe(600); // 200 + 400
      expect(Number(records[0].cacheReadTokens)).toBe(800); // 500 + 300
      expect(Number(records[0].cacheWriteTokens)).toBe(300); // 100 + 200
      expect(Number(records[0].cost)).toBeCloseTo(4.00); // $1.50 + $2.50
    });

    it('skips records without email when api_actor cannot be resolved', async () => {
      // Mock empty mappings
      server.use(
        http.get('https://api.anthropic.com/v1/organizations/users', () => {
          return HttpResponse.json({
            data: [],
            has_more: false,
            first_id: '',
            last_id: '',
          });
        }),
        http.get('https://api.anthropic.com/v1/organizations/api_keys', () => {
          return HttpResponse.json({
            data: [],
            has_more: false,
            first_id: '',
            last_id: '',
          });
        }),
        http.get('https://api.anthropic.com/v1/organizations/usage_report/claude_code', () => {
          return HttpResponse.json({
            data: [
              {
                date: '2025-01-15T00:00:00Z',
                actor: {
                  type: 'api_actor',
                  api_key_name: 'unknown-key',
                },
                organization_id: 'org-test',
                customer_type: 'api',
                terminal_type: 'vscode',
                core_metrics: { num_sessions: 1, lines_of_code: { added: 0, removed: 0 }, commits_by_claude_code: 0, pull_requests_by_claude_code: 0 },
                tool_actions: { edit_tool: { accepted: 0, rejected: 0 }, write_tool: { accepted: 0, rejected: 0 }, notebook_edit_tool: { accepted: 0, rejected: 0 } },
                model_breakdown: [{
                  model: 'claude-sonnet-4-20250514',
                  tokens: { input: 1000, output: 200, cache_read: 0, cache_creation: 0 },
                  estimated_cost: { currency: 'USD', amount: 100 },
                }],
              },
            ],
            has_more: false,
            next_page: null,
          });
        })
      );

      const result = await syncAnthropicUsage('2025-01-15', '2025-01-15');

      expect(result.success).toBe(true);
      expect(result.recordsImported).toBe(0);
      expect(result.recordsSkipped).toBe(1);
    });

    it('creates separate records for different models (no cross-model aggregation)', async () => {
      // Mock API key mappings - single user with one key
      server.use(
        http.get('https://api.anthropic.com/v1/organizations/users', () => {
          return HttpResponse.json({
            data: [
              { id: 'user-123', email: 'multimodel@example.com', name: 'Test User', role: 'developer', type: 'user', added_at: '2024-01-01T00:00:00Z' }
            ],
            has_more: false,
            first_id: 'user-123',
            last_id: 'user-123',
          });
        }),
        http.get('https://api.anthropic.com/v1/organizations/api_keys', () => {
          return HttpResponse.json({
            data: [
              { id: 'key-123', name: 'prod-key', created_at: '2024-01-01T00:00:00Z', created_by: { id: 'user-123', type: 'user' }, partial_key_hint: 'sk-ant-...abc', status: 'active', workspace_id: 'ws-123', type: 'user_key' }
            ],
            has_more: false,
            first_id: 'key-123',
            last_id: 'key-123',
          });
        }),
        // Mock Claude Code Analytics API with 2 records - same user/key but different models
        http.get('https://api.anthropic.com/v1/organizations/usage_report/claude_code', () => {
          return HttpResponse.json({
            data: [
              {
                date: '2025-01-15T00:00:00Z',
                actor: { type: 'api_actor', api_key_name: 'prod-key' },
                organization_id: 'org-test',
                customer_type: 'api',
                terminal_type: 'vscode',
                core_metrics: { num_sessions: 1, lines_of_code: { added: 0, removed: 0 }, commits_by_claude_code: 0, pull_requests_by_claude_code: 0 },
                tool_actions: { edit_tool: { accepted: 0, rejected: 0 }, write_tool: { accepted: 0, rejected: 0 }, notebook_edit_tool: { accepted: 0, rejected: 0 } },
                model_breakdown: [{
                  model: 'claude-sonnet-4-20250514',
                  tokens: { input: 1000, output: 200, cache_read: 0, cache_creation: 0 },
                  estimated_cost: { currency: 'USD', amount: 100 },
                }],
              },
              {
                date: '2025-01-15T00:00:00Z',
                actor: { type: 'api_actor', api_key_name: 'prod-key' },
                organization_id: 'org-test',
                customer_type: 'api',
                terminal_type: 'vscode',
                core_metrics: { num_sessions: 1, lines_of_code: { added: 0, removed: 0 }, commits_by_claude_code: 0, pull_requests_by_claude_code: 0 },
                tool_actions: { edit_tool: { accepted: 0, rejected: 0 }, write_tool: { accepted: 0, rejected: 0 }, notebook_edit_tool: { accepted: 0, rejected: 0 } },
                model_breakdown: [{
                  model: 'claude-opus-4-20250514',
                  tokens: { input: 2000, output: 400, cache_read: 0, cache_creation: 0 },
                  estimated_cost: { currency: 'USD', amount: 300 },
                }],
              },
            ],
            has_more: false,
            next_page: null,
          });
        })
      );

      const result = await syncAnthropicUsage('2025-01-15', '2025-01-15');

      expect(result.success).toBe(true);
      expect(result.recordsImported).toBe(2); // Should be 2 separate records

      // Verify we have 2 records with different models
      const records = await db
        .select()
        .from(usageRecords)
        .where(eq(usageRecords.email, 'multimodel@example.com'));
      expect(records).toHaveLength(2);

      const models = records.map(r => r.model).sort();
      expect(models).toEqual(['opus-4', 'sonnet-4']);

      // Verify tokens are kept separate, not summed
      const sonnetRecord = records.find(r => r.model === 'sonnet-4');
      const opusRecord = records.find(r => r.model === 'opus-4');
      expect(Number(sonnetRecord?.inputTokens)).toBe(1000);
      expect(Number(opusRecord?.inputTokens)).toBe(2000);
    });

    it('re-sync is idempotent (aggregated records UPSERT correctly)', async () => {
      // Mock API key mappings - both keys belong to same user
      server.use(
        http.get('https://api.anthropic.com/v1/organizations/users', () => {
          return HttpResponse.json({
            data: [
              { id: 'user-123', email: 'idempotent@example.com', name: 'Test User', role: 'developer', type: 'user', added_at: '2024-01-01T00:00:00Z' }
            ],
            has_more: false,
            first_id: 'user-123',
            last_id: 'user-123',
          });
        }),
        http.get('https://api.anthropic.com/v1/organizations/api_keys', () => {
          return HttpResponse.json({
            data: [
              { id: 'key-1', name: 'key-one', created_at: '2024-01-01T00:00:00Z', created_by: { id: 'user-123', type: 'user' }, partial_key_hint: 'sk-ant-...abc', status: 'active', workspace_id: 'ws-123', type: 'user_key' },
              { id: 'key-2', name: 'key-two', created_at: '2024-01-01T00:00:00Z', created_by: { id: 'user-123', type: 'user' }, partial_key_hint: 'sk-ant-...xyz', status: 'active', workspace_id: 'ws-123', type: 'user_key' }
            ],
            has_more: false,
            first_id: 'key-1',
            last_id: 'key-2',
          });
        }),
        http.get('https://api.anthropic.com/v1/organizations/usage_report/claude_code', () => {
          return HttpResponse.json({
            data: [
              {
                date: '2025-01-15T00:00:00Z',
                actor: { type: 'api_actor', api_key_name: 'key-one' },
                organization_id: 'org-test',
                customer_type: 'api',
                terminal_type: 'vscode',
                core_metrics: { num_sessions: 1, lines_of_code: { added: 0, removed: 0 }, commits_by_claude_code: 0, pull_requests_by_claude_code: 0 },
                tool_actions: { edit_tool: { accepted: 0, rejected: 0 }, write_tool: { accepted: 0, rejected: 0 }, notebook_edit_tool: { accepted: 0, rejected: 0 } },
                model_breakdown: [{
                  model: 'claude-sonnet-4-20250514',
                  tokens: { input: 1000, output: 200, cache_read: 0, cache_creation: 0 },
                  estimated_cost: { currency: 'USD', amount: 100 },
                }],
              },
              {
                date: '2025-01-15T00:00:00Z',
                actor: { type: 'api_actor', api_key_name: 'key-two' },
                organization_id: 'org-test',
                customer_type: 'api',
                terminal_type: 'vscode',
                core_metrics: { num_sessions: 1, lines_of_code: { added: 0, removed: 0 }, commits_by_claude_code: 0, pull_requests_by_claude_code: 0 },
                tool_actions: { edit_tool: { accepted: 0, rejected: 0 }, write_tool: { accepted: 0, rejected: 0 }, notebook_edit_tool: { accepted: 0, rejected: 0 } },
                model_breakdown: [{
                  model: 'claude-sonnet-4-20250514',
                  tokens: { input: 2000, output: 400, cache_read: 0, cache_creation: 0 },
                  estimated_cost: { currency: 'USD', amount: 200 },
                }],
              },
            ],
            has_more: false,
            next_page: null,
          });
        })
      );

      // First sync - should aggregate to 3000 tokens
      const result1 = await syncAnthropicUsage('2025-01-15', '2025-01-15');
      expect(result1.success).toBe(true);
      expect(result1.recordsImported).toBe(1);

      let records = await db
        .select()
        .from(usageRecords)
        .where(eq(usageRecords.email, 'idempotent@example.com'));
      expect(records).toHaveLength(1);
      expect(Number(records[0].inputTokens)).toBe(3000); // 1000 + 2000

      // Second sync with SAME data - should UPSERT to 3000 (not 6000)
      const result2 = await syncAnthropicUsage('2025-01-15', '2025-01-15');
      expect(result2.success).toBe(true);
      expect(result2.recordsImported).toBe(1);

      records = await db
        .select()
        .from(usageRecords)
        .where(eq(usageRecords.email, 'idempotent@example.com'));
      expect(records).toHaveLength(1);
      expect(Number(records[0].inputTokens)).toBe(3000); // Still 3000, not doubled
      expect(Number(records[0].cost)).toBeCloseTo(3.00); // $1.00 + $2.00, not doubled
    });

    it('aggregates mixed user_actor and api_actor for same user', async () => {
      // Mock API key mappings
      server.use(
        http.get('https://api.anthropic.com/v1/organizations/users', () => {
          return HttpResponse.json({
            data: [
              { id: 'user-123', email: 'mixed@example.com', name: 'Test User', role: 'developer', type: 'user', added_at: '2024-01-01T00:00:00Z' }
            ],
            has_more: false,
            first_id: 'user-123',
            last_id: 'user-123',
          });
        }),
        http.get('https://api.anthropic.com/v1/organizations/api_keys', () => {
          return HttpResponse.json({
            data: [
              { id: 'key-123', name: 'api-key', created_at: '2024-01-01T00:00:00Z', created_by: { id: 'user-123', type: 'user' }, partial_key_hint: 'sk-ant-...abc', status: 'active', workspace_id: 'ws-123', type: 'user_key' }
            ],
            has_more: false,
            first_id: 'key-123',
            last_id: 'key-123',
          });
        }),
        // Mock both user_actor (email) and api_actor (api key) for same user
        http.get('https://api.anthropic.com/v1/organizations/usage_report/claude_code', () => {
          return HttpResponse.json({
            data: [
              {
                date: '2025-01-15T00:00:00Z',
                actor: { type: 'user_actor', email_address: 'mixed@example.com' },
                organization_id: 'org-test',
                customer_type: 'api',
                terminal_type: 'vscode',
                core_metrics: { num_sessions: 1, lines_of_code: { added: 0, removed: 0 }, commits_by_claude_code: 0, pull_requests_by_claude_code: 0 },
                tool_actions: { edit_tool: { accepted: 0, rejected: 0 }, write_tool: { accepted: 0, rejected: 0 }, notebook_edit_tool: { accepted: 0, rejected: 0 } },
                model_breakdown: [{
                  model: 'claude-sonnet-4-20250514',
                  tokens: { input: 1000, output: 200, cache_read: 0, cache_creation: 0 },
                  estimated_cost: { currency: 'USD', amount: 100 },
                }],
              },
              {
                date: '2025-01-15T00:00:00Z',
                actor: { type: 'api_actor', api_key_name: 'api-key' },
                organization_id: 'org-test',
                customer_type: 'api',
                terminal_type: 'vscode',
                core_metrics: { num_sessions: 1, lines_of_code: { added: 0, removed: 0 }, commits_by_claude_code: 0, pull_requests_by_claude_code: 0 },
                tool_actions: { edit_tool: { accepted: 0, rejected: 0 }, write_tool: { accepted: 0, rejected: 0 }, notebook_edit_tool: { accepted: 0, rejected: 0 } },
                model_breakdown: [{
                  model: 'claude-sonnet-4-20250514',
                  tokens: { input: 2000, output: 400, cache_read: 0, cache_creation: 0 },
                  estimated_cost: { currency: 'USD', amount: 200 },
                }],
              },
            ],
            has_more: false,
            next_page: null,
          });
        })
      );

      const result = await syncAnthropicUsage('2025-01-15', '2025-01-15');

      expect(result.success).toBe(true);
      expect(result.recordsImported).toBe(1); // Should aggregate into 1 record

      // Verify aggregation across actor types
      const records = await db
        .select()
        .from(usageRecords)
        .where(eq(usageRecords.email, 'mixed@example.com'));
      expect(records).toHaveLength(1);
      expect(Number(records[0].inputTokens)).toBe(3000); // 1000 + 2000 from both sources
      expect(Number(records[0].outputTokens)).toBe(600); // 200 + 400
      expect(Number(records[0].cost)).toBeCloseTo(3.00); // $1.00 + $2.00
    });

    it('deletes old records with toolRecordId after successful sync', async () => {
      // Insert an old record with toolRecordId (from legacy sync)
      await db.insert(usageRecords).values({
        date: '2025-01-15',
        email: 'user1@example.com',
        tool: 'claude_code',
        model: 'sonnet-4',
        rawModel: 'claude-sonnet-4-20250514',
        inputTokens: 500,
        outputTokens: 100,
        cost: 1.00,
        toolRecordId: 'old-api-key-id', // Legacy record
      });

      // Verify old record exists
      let records = await db.select().from(usageRecords);
      expect(records).toHaveLength(1);
      expect(records[0].toolRecordId).toBe('old-api-key-id');

      // Sync new data
      mockClaudeCodeAPI([
        createClaudeCodeRecord({ email: 'user1@example.com', input: 1000 }),
      ]);

      const result = await syncAnthropicUsage('2025-01-15', '2025-01-15');

      expect(result.success).toBe(true);
      expect(result.recordsImported).toBe(1);

      // Should have only the new record (old one deleted)
      records = await db.select().from(usageRecords);
      expect(records).toHaveLength(1);
      expect(records[0].toolRecordId).toBeNull(); // New record has no toolRecordId
      expect(Number(records[0].inputTokens)).toBe(1000);
    });

    it('keeps old records if no new records imported', async () => {
      // Insert an old record with toolRecordId
      await db.insert(usageRecords).values({
        date: '2025-01-15',
        email: 'user1@example.com',
        tool: 'claude_code',
        model: 'sonnet-4',
        rawModel: 'claude-sonnet-4-20250514',
        inputTokens: 500,
        outputTokens: 100,
        cost: 1.00,
        toolRecordId: 'old-api-key-id',
      });

      // Mock API returning no data
      mockClaudeCodeAPI([]);

      const result = await syncAnthropicUsage('2025-01-15', '2025-01-15');

      expect(result.success).toBe(true);
      expect(result.recordsImported).toBe(0);

      // Old record should still exist (not deleted when no new data)
      const records = await db.select().from(usageRecords);
      expect(records).toHaveLength(1);
      expect(records[0].toolRecordId).toBe('old-api-key-id');
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
        http.get('https://api.anthropic.com/v1/organizations/usage_report/claude_code', () => {
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
      mockClaudeCodeAPI([
        createClaudeCodeRecord({ model: 'claude-sonnet-4-20250514' }),
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
      mockClaudeCodeAPI([
        createClaudeCodeRecord({ model: 'claude-3-5-sonnet-20241022' }),
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
