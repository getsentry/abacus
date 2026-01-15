import { describe, it, expect, vi, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test-utils/msw-handlers';
import {
  syncCursorUsage,
  syncCursorCron,
  getCursorSyncState,
  getPreviousCompleteHourEnd,
} from './cursor';
import { insertUsageRecord } from '../queries';
import { db, usageRecords, syncState } from '../db';
import { eq, and, isNull } from 'drizzle-orm';

// Helper to create Cursor API response events
function createCursorEvent(overrides: {
  userEmail?: string;
  model?: string;
  timestamp?: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheWriteTokens?: number;
  cacheReadTokens?: number;
  totalCents?: number;
} = {}) {
  return {
    userEmail: overrides.userEmail ?? 'test@example.com',
    model: overrides.model ?? 'claude-3-5-sonnet-20241022',
    timestamp: overrides.timestamp ?? Date.now().toString(),
    tokenUsage: {
      inputTokens: overrides.inputTokens ?? 500,
      outputTokens: overrides.outputTokens ?? 100,
      cacheWriteTokens: overrides.cacheWriteTokens ?? 0,
      cacheReadTokens: overrides.cacheReadTokens ?? 0,
      totalCents: overrides.totalCents ?? 5,
    },
  };
}

// Helper to set up Cursor API mock with specific events
function mockCursorAPI(events: ReturnType<typeof createCursorEvent>[], hasNextPage = false) {
  server.use(
    http.post('https://api.cursor.com/teams/filtered-usage-events', () => {
      return HttpResponse.json({
        usageEvents: events,
        totalUsageEventsCount: events.length,
        pagination: {
          numPages: hasNextPage ? 2 : 1,
          currentPage: 1,
          pageSize: 1000,
          hasNextPage,
        },
      });
    })
  );
}

describe('Cursor Sync', () => {
  beforeEach(() => {
    vi.stubEnv('CURSOR_ADMIN_KEY', 'test-cursor-key');
  });

  describe('getPreviousCompleteHourEnd', () => {
    it('returns start of current hour', () => {
      const result = getPreviousCompleteHourEnd();
      expect(result.getMinutes()).toBe(0);
      expect(result.getSeconds()).toBe(0);
      expect(result.getMilliseconds()).toBe(0);
    });
  });

  describe('syncCursorUsage', () => {
    it('returns error when CURSOR_ADMIN_KEY not configured', async () => {
      vi.stubEnv('CURSOR_ADMIN_KEY', '');

      const result = await syncCursorUsage('2025-01-01', '2025-01-07');

      expect(result.success).toBe(false);
      expect(result.errors).toContain('CURSOR_ADMIN_KEY not configured');
    });

    it('imports usage records from Cursor API', async () => {
      const timestamp = new Date('2025-01-15T12:00:00Z').getTime().toString();
      mockCursorAPI([
        createCursorEvent({
          userEmail: 'user1@example.com',
          model: 'claude-3-5-sonnet-20241022',
          timestamp,
          inputTokens: 1000,
          outputTokens: 500,
        }),
      ]);

      const result = await syncCursorUsage('2025-01-15', '2025-01-15');

      expect(result.success).toBe(true);
      expect(result.recordsImported).toBe(1);

      // Verify record was inserted with normalized model
      const records = await db
        .select()
        .from(usageRecords)
        .where(eq(usageRecords.email, 'user1@example.com'));
      expect(records).toHaveLength(1);
      expect(records[0].model).toBe('sonnet-3.5'); // normalized
      expect(records[0].rawModel).toBe('claude-3-5-sonnet-20241022');
      expect(Number(records[0].inputTokens)).toBe(1000);
      expect(Number(records[0].outputTokens)).toBe(500);
    });

    it('stores each event separately with different timestamps', async () => {
      const timestamp1 = new Date('2025-01-15T12:00:00Z').getTime().toString();
      const timestamp2 = new Date('2025-01-15T12:01:00Z').getTime().toString();
      mockCursorAPI([
        createCursorEvent({
          userEmail: 'user1@example.com',
          model: 'claude-3-5-sonnet-20241022',
          timestamp: timestamp1,
          inputTokens: 1000,
          outputTokens: 500,
        }),
        createCursorEvent({
          userEmail: 'user1@example.com',
          model: 'claude-3-5-sonnet-20241022',
          timestamp: timestamp2,
          inputTokens: 500,
          outputTokens: 250,
        }),
      ]);

      const result = await syncCursorUsage('2025-01-15', '2025-01-15');

      expect(result.success).toBe(true);
      expect(result.recordsImported).toBe(2); // One record per event

      const records = await db
        .select()
        .from(usageRecords)
        .where(eq(usageRecords.email, 'user1@example.com'));
      expect(records).toHaveLength(2);

      // Total tokens across both records
      const totalInput = records.reduce((sum, r) => sum + Number(r.inputTokens), 0);
      const totalOutput = records.reduce((sum, r) => sum + Number(r.outputTokens), 0);
      expect(totalInput).toBe(1500); // 1000 + 500
      expect(totalOutput).toBe(750); // 500 + 250
    });

    it('keeps different rawModels as separate records', async () => {
      const timestamp = new Date('2025-01-15T12:00:00Z').getTime().toString();
      mockCursorAPI([
        createCursorEvent({
          userEmail: 'user1@example.com',
          model: 'claude-3-5-sonnet-20241022',
          timestamp,
          inputTokens: 1000,
          outputTokens: 500,
        }),
        createCursorEvent({
          userEmail: 'user1@example.com',
          model: 'claude-3-5-sonnet-20241022-thinking', // Different raw model
          timestamp,
          inputTokens: 500,
          outputTokens: 250,
        }),
      ]);

      const result = await syncCursorUsage('2025-01-15', '2025-01-15');

      expect(result.success).toBe(true);
      expect(result.recordsImported).toBe(2); // Two separate records

      const records = await db
        .select()
        .from(usageRecords)
        .where(eq(usageRecords.email, 'user1@example.com'));
      expect(records).toHaveLength(2);
    });

    it('skips events with zero tokens', async () => {
      const timestamp = new Date('2025-01-15T12:00:00Z').getTime().toString();
      mockCursorAPI([
        createCursorEvent({
          userEmail: 'user1@example.com',
          timestamp,
          inputTokens: 0,
          outputTokens: 0,
          cacheWriteTokens: 0,
          cacheReadTokens: 0,
        }),
      ]);

      const result = await syncCursorUsage('2025-01-15', '2025-01-15');

      expect(result.success).toBe(true);
      expect(result.recordsImported).toBe(0);
      expect(result.recordsSkipped).toBe(1);
    });

    it('handles rate limit response', async () => {
      server.use(
        http.post('https://api.cursor.com/teams/filtered-usage-events', () => {
          return HttpResponse.json(
            { error: 'Rate limit exceeded' },
            { status: 429 }
          );
        })
      );

      const result = await syncCursorUsage('2025-01-15', '2025-01-15');

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('rate limited'))).toBe(true);
    });

    it('handles API error response', async () => {
      server.use(
        http.post('https://api.cursor.com/teams/filtered-usage-events', () => {
          return HttpResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
          );
        })
      );

      const result = await syncCursorUsage('2025-01-15', '2025-01-15');

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('500'))).toBe(true);
    });

    it('upserts on conflict (same date/email/tool/rawModel)', async () => {
      // First sync
      const timestamp = new Date('2025-01-15T12:00:00Z').getTime().toString();
      mockCursorAPI([
        createCursorEvent({
          userEmail: 'user1@example.com',
          model: 'claude-3-5-sonnet-20241022',
          timestamp,
          inputTokens: 1000,
          outputTokens: 500,
        }),
      ]);

      await syncCursorUsage('2025-01-15', '2025-01-15');

      // Second sync with same date/email/rawModel but different values
      mockCursorAPI([
        createCursorEvent({
          userEmail: 'user1@example.com',
          model: 'claude-3-5-sonnet-20241022',
          timestamp,
          inputTokens: 2000, // Different value
          outputTokens: 1000,
        }),
      ]);

      const result = await syncCursorUsage('2025-01-15', '2025-01-15');

      expect(result.success).toBe(true);

      // Should upsert, not create duplicate
      const records = await db
        .select()
        .from(usageRecords)
        .where(eq(usageRecords.email, 'user1@example.com'));
      expect(records).toHaveLength(1);
      expect(Number(records[0].inputTokens)).toBe(2000); // Updated value
    });
  });

  describe('syncCursorCron', () => {
    it('returns error when CURSOR_ADMIN_KEY not configured', async () => {
      vi.stubEnv('CURSOR_ADMIN_KEY', '');

      const result = await syncCursorCron();

      expect(result.success).toBe(false);
      expect(result.errors).toContain('CURSOR_ADMIN_KEY not configured');
    });

    it('skips sync if already synced up to current hour', async () => {
      // Set sync state to current hour
      const currentHour = getPreviousCompleteHourEnd().getTime();
      await db
        .insert(syncState)
        .values({
          id: 'cursor',
          lastSyncAt: new Date(),
          lastSyncedHourEnd: currentHour.toString(),
        })
        .onConflictDoUpdate({
          target: syncState.id,
          set: { lastSyncedHourEnd: currentHour.toString() },
        });

      const result = await syncCursorCron();

      expect(result.success).toBe(true);
      expect(result.recordsImported).toBe(0);
      expect(result.syncedRange).toBeUndefined();
    });

    it('syncs from last synced hour to current hour', async () => {
      // Set sync state to 2 hours ago
      const twoHoursAgo = getPreviousCompleteHourEnd().getTime() - 2 * 60 * 60 * 1000;
      await db
        .insert(syncState)
        .values({
          id: 'cursor',
          lastSyncAt: new Date(),
          lastSyncedHourEnd: twoHoursAgo.toString(),
        });

      const timestamp = new Date().getTime().toString();
      mockCursorAPI([
        createCursorEvent({
          userEmail: 'cronuser@example.com',
          timestamp,
        }),
      ]);

      const result = await syncCursorCron();

      expect(result.success).toBe(true);
      expect(result.syncedRange).toBeDefined();
      expect(result.syncedRange!.startMs).toBe(twoHoursAgo);
    });

    it('updates sync state on successful sync', async () => {
      mockCursorAPI([createCursorEvent()]);

      await syncCursorCron();

      const state = await getCursorSyncState();
      expect(state.lastSyncedHourEnd).not.toBeNull();
    });

    it('does not update sync state on rate limit', async () => {
      // Set initial state
      const initialHourEnd = Date.now() - 24 * 60 * 60 * 1000;
      await db
        .insert(syncState)
        .values({
          id: 'cursor',
          lastSyncAt: new Date(),
          lastSyncedHourEnd: initialHourEnd.toString(),
        });

      server.use(
        http.post('https://api.cursor.com/teams/filtered-usage-events', () => {
          return HttpResponse.json(
            { error: 'Rate limit exceeded' },
            { status: 429 }
          );
        })
      );

      await syncCursorCron();

      // State should not be updated
      const state = await getCursorSyncState();
      expect(state.lastSyncedHourEnd).toBe(initialHourEnd);
    });
  });

  describe('deduplication with rawModel', () => {
    it('treats NULL and non-NULL rawModel as different records', async () => {
      // Insert a record with NULL rawModel (simulating old data)
      await insertUsageRecord({
        date: '2025-01-15',
        email: 'user1@example.com',
        tool: 'cursor',
        model: 'sonnet-3.5',
        // rawModel omitted = NULL
        inputTokens: 1000,
        outputTokens: 500,
        cacheWriteTokens: 0,
        cacheReadTokens: 0,
        cost: 0.05,
      });

      // Sync with proper rawModel
      const timestamp = new Date('2025-01-15T12:00:00Z').getTime().toString();
      mockCursorAPI([
        createCursorEvent({
          userEmail: 'user1@example.com',
          model: 'claude-3-5-sonnet-20241022',
          timestamp,
          inputTokens: 2000,
          outputTokens: 1000,
        }),
      ]);

      const result = await syncCursorUsage('2025-01-15', '2025-01-15');

      expect(result.success).toBe(true);
      expect(result.recordsImported).toBe(1);

      // Should have two records: one with NULL, one with proper rawModel
      const records = await db
        .select()
        .from(usageRecords)
        .where(
          and(
            eq(usageRecords.email, 'user1@example.com'),
            eq(usageRecords.date, '2025-01-15')
          )
        );
      expect(records).toHaveLength(2);

      const nullRecord = records.find(r => r.rawModel === null);
      const nonNullRecord = records.find(r => r.rawModel !== null);
      expect(nullRecord).toBeDefined();
      expect(nonNullRecord).toBeDefined();
      expect(nonNullRecord!.rawModel).toBe('claude-3-5-sonnet-20241022');
    });

    it('creates separate records per event (no aggregation)', async () => {
      // Insert a record manually (no timestampMs)
      await insertUsageRecord({
        date: '2025-01-15',
        email: 'user1@example.com',
        tool: 'cursor',
        model: 'sonnet-3.5',
        rawModel: 'claude-3-5-sonnet-20241022',
        inputTokens: 1000,
        outputTokens: 500,
        cacheWriteTokens: 0,
        cacheReadTokens: 0,
        cost: 0.05,
      });

      // Sync event with same rawModel but different timestamp
      const timestamp = new Date('2025-01-15T12:00:00Z').getTime().toString();
      mockCursorAPI([
        createCursorEvent({
          userEmail: 'user1@example.com',
          model: 'claude-3-5-sonnet-20241022',
          timestamp,
          inputTokens: 2000,
          outputTokens: 1000,
        }),
      ]);

      const result = await syncCursorUsage('2025-01-15', '2025-01-15');

      expect(result.success).toBe(true);

      // Per-event storage: each event creates a separate record
      // Manual insert has timestampMs=null, sync has timestampMs=1736942400000
      const records = await db
        .select()
        .from(usageRecords)
        .where(
          and(
            eq(usageRecords.email, 'user1@example.com'),
            eq(usageRecords.date, '2025-01-15')
          )
        );
      expect(records).toHaveLength(2);

      // Both records should have the same rawModel
      expect(records.every(r => r.rawModel === 'claude-3-5-sonnet-20241022')).toBe(true);

      // One without timestampMs (manual), one with (synced)
      const manualRecord = records.find(r => r.timestampMs === null);
      const syncedRecord = records.find(r => r.timestampMs !== null);
      expect(manualRecord).toBeDefined();
      expect(syncedRecord).toBeDefined();
      expect(Number(syncedRecord!.inputTokens)).toBe(2000);
    });
  });
});
