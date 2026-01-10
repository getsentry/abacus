import { describe, it, expect, beforeEach } from 'vitest';
import { insertUsageRecord, getOverallStats, getLifetimeStats } from '@/lib/queries';

// Helper to create test usage records
function createTestUsageRecord(overrides: Partial<Parameters<typeof insertUsageRecord>[0]> = {}) {
  return {
    date: '2025-01-15',
    email: 'test@example.com',
    tool: 'claude_code',
    rawModel: 'claude-sonnet-4-20250514',
    model: 'sonnet-4',
    inputTokens: 1000,
    outputTokens: 500,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
    cost: 0.015,
    ...overrides,
  };
}

// Helper to seed test data
async function seedTestData() {
  await insertUsageRecord({
    date: '2025-01-01',
    email: 'user1@example.com',
    tool: 'claude_code',
    rawModel: 'claude-sonnet-4-20250514',
    model: 'sonnet-4',
    inputTokens: 10000,
    outputTokens: 5000,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
    cost: 0.15,
  });
  await insertUsageRecord({
    date: '2025-01-01',
    email: 'user2@example.com',
    tool: 'cursor',
    rawModel: 'claude-sonnet-4-20250514',
    model: 'sonnet-4',
    inputTokens: 20000,
    outputTokens: 10000,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
    cost: 0.30,
  });
}

describe('Database Queries', () => {
  describe('insertUsageRecord', () => {
    it('inserts a new usage record', async () => {
      const record = createTestUsageRecord();

      await insertUsageRecord(record);

      const stats = await getOverallStats(record.date, record.date);
      expect(Number(stats.totalTokens)).toBeGreaterThan(0);
    });

    it('upserts on conflict (same date/email/tool/rawModel)', async () => {
      const record = createTestUsageRecord({
        inputTokens: 1000,
        outputTokens: 200,
      });

      await insertUsageRecord(record);
      await insertUsageRecord({
        ...record,
        inputTokens: 2000,
        outputTokens: 400,
      });

      const stats = await getOverallStats(record.date, record.date);
      expect(Number(stats.totalTokens)).toBe(2400);
    });

    it('handles different tools correctly', async () => {
      const record1 = createTestUsageRecord({ tool: 'claude_code' });
      const record2 = createTestUsageRecord({ tool: 'cursor', email: 'other@example.com' });

      await insertUsageRecord(record1);
      await insertUsageRecord(record2);

      const stats = await getOverallStats(record1.date, record1.date);
      expect(stats.activeUsers).toBe(2);
    });
  });

  describe('getOverallStats', () => {
    beforeEach(async () => {
      await seedTestData();
    });

    it('returns aggregated stats for date range', async () => {
      const stats = await getOverallStats('2025-01-01', '2025-01-31');

      expect(stats.activeUsers).toBeGreaterThanOrEqual(2);
      expect(Number(stats.totalTokens)).toBeGreaterThan(0);
    });

    it('filters by date range', async () => {
      const stats = await getOverallStats('2025-01-01', '2025-01-01');
      expect(stats.activeUsers).toBe(2);
    });

    it('returns zeros for empty date range', async () => {
      const stats = await getOverallStats('2020-01-01', '2020-01-02');

      expect(stats.activeUsers).toBe(0);
      expect(Number(stats.totalTokens)).toBe(0);
    });
  });

  describe('getLifetimeStats', () => {
    beforeEach(async () => {
      await seedTestData();
    });

    it('returns cumulative stats across all time', async () => {
      const stats = await getLifetimeStats();

      expect(Number(stats.totalTokens)).toBeGreaterThan(0);
      expect(stats.totalUsers).toBeGreaterThan(0);
    });

    it('includes repository count', async () => {
      const stats = await getLifetimeStats();
      expect(stats.totalRepos).toBeGreaterThanOrEqual(0);
    });
  });
});
