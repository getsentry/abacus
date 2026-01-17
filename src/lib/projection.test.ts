import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { applyProjections, hasIncompleteData, hasProjectedData } from './projection';
import type { DailyUsage, DataCompleteness } from './queries';

describe('applyProjections', () => {
  const mockCompleteness: DataCompleteness = {
    claudeCode: { lastDataDate: '2025-01-15' },
    cursor: { lastDataDate: '2025-01-15' },
  };

  it('marks data after lastDataDate as incomplete', () => {
    const data: DailyUsage[] = [
      { date: '2025-01-14', claudeCode: 1000, cursor: 500, cost: 0.10 },
      { date: '2025-01-15', claudeCode: 1200, cursor: 600, cost: 0.12 },
      { date: '2025-01-16', claudeCode: 0, cursor: 0, cost: 0 },
    ];

    const result = applyProjections(data, mockCompleteness, '2025-01-16');

    expect(result[0].isIncomplete).toBeUndefined();
    expect(result[1].isIncomplete).toBeUndefined();
    expect(result[2].isIncomplete).toBe(true);
  });

  it('returns data unchanged when complete and not today', () => {
    const data: DailyUsage[] = [
      { date: '2025-01-14', claudeCode: 1000, cursor: 500, cost: 0.10 },
      { date: '2025-01-15', claudeCode: 1200, cursor: 600, cost: 0.12 },
    ];

    // Today is after the data range, so all data is complete
    const result = applyProjections(data, mockCompleteness, '2025-01-20');

    expect(result[0]).toEqual(data[0]);
    expect(result[1]).toEqual(data[1]);
  });

  it('does not project historical incomplete days', () => {
    const completeness: DataCompleteness = {
      claudeCode: { lastDataDate: '2025-01-13' },
      cursor: { lastDataDate: '2025-01-15' },
    };
    const data: DailyUsage[] = [
      { date: '2025-01-14', claudeCode: 0, cursor: 500, cost: 0.05 },
    ];

    const result = applyProjections(data, completeness, '2025-01-16');

    // Marked as incomplete but no projection (not today)
    expect(result[0].isIncomplete).toBe(true);
    expect(result[0].projectedClaudeCode).toBeUndefined();
    expect(result[0].claudeCode).toBe(0);
  });

  describe('today projection', () => {
    beforeEach(() => {
      // Mock Date to be at noon (12:00)
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-01-16T12:00:00'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('projects today\'s data based on hours elapsed', () => {
      const completeness: DataCompleteness = {
        claudeCode: { lastDataDate: '2025-01-15' },
        cursor: { lastDataDate: '2025-01-15' },
      };
      const data: DailyUsage[] = [
        { date: '2025-01-16', claudeCode: 500, cursor: 250, cost: 0.05 },
      ];

      const result = applyProjections(data, completeness, '2025-01-16');

      // At 12:00, factor = 12/24 = 0.5, so values should double
      expect(result[0].isIncomplete).toBe(true);
      expect(result[0].projectedClaudeCode).toBe(500);  // Original value stored
      expect(result[0].claudeCode).toBe(1000);  // 500 / 0.5
      expect(result[0].projectedCursor).toBe(250);
      expect(result[0].cursor).toBe(500);  // 250 / 0.5
    });

    it('does not project zero values when no historical data', () => {
      const completeness: DataCompleteness = {
        claudeCode: { lastDataDate: '2025-01-15' },
        cursor: { lastDataDate: '2025-01-15' },
      };
      // Only today's data, no historical data to average from
      const data: DailyUsage[] = [
        { date: '2025-01-16', claudeCode: 0, cursor: 0, cost: 0 },
      ];

      const result = applyProjections(data, completeness, '2025-01-16');

      expect(result[0].isIncomplete).toBe(true);
      expect(result[0].projectedClaudeCode).toBeUndefined();
      expect(result[0].projectedCursor).toBeUndefined();
      expect(result[0].claudeCode).toBe(0);
      expect(result[0].cursor).toBe(0);
    });

    it('projects zero values using historical average when available', () => {
      const completeness: DataCompleteness = {
        claudeCode: { lastDataDate: '2025-01-15' },
        cursor: { lastDataDate: '2025-01-15' },
      };
      // Historical data available
      const data: DailyUsage[] = [
        { date: '2025-01-14', claudeCode: 1000, cursor: 500, cost: 0.10 },
        { date: '2025-01-15', claudeCode: 2000, cursor: 1000, cost: 0.20 },
        { date: '2025-01-16', claudeCode: 0, cursor: 0, cost: 0 },  // Today, no data yet
      ];

      const result = applyProjections(data, completeness, '2025-01-16');

      // Should project using historical average (1500 for Claude Code, 750 for Cursor)
      expect(result[2].isIncomplete).toBe(true);
      expect(result[2].projectedClaudeCode).toBe(0);  // Original value
      expect(result[2].claudeCode).toBe(1500);  // Historical avg
      expect(result[2].projectedCursor).toBe(0);
      expect(result[2].cursor).toBe(750);
    });

    it('projects both tools for today since day is not complete', () => {
      const completeness: DataCompleteness = {
        claudeCode: { lastDataDate: '2025-01-15' },
        cursor: { lastDataDate: '2025-01-16' },  // Cursor has synced today but day isn't over
      };
      const data: DailyUsage[] = [
        { date: '2025-01-16', claudeCode: 500, cursor: 1000, cost: 0.10 },
      ];

      const result = applyProjections(data, completeness, '2025-01-16');

      // At 12:00, both tools are projected since the day isn't complete
      expect(result[0].isIncomplete).toBe(true);
      expect(result[0].projectedClaudeCode).toBe(500);
      expect(result[0].claudeCode).toBe(1000);  // 500 / 0.5
      expect(result[0].projectedCursor).toBe(1000);  // Cursor also projected
      expect(result[0].cursor).toBe(2000);  // 1000 / 0.5
    });
  });

  describe('early morning edge case', () => {
    beforeEach(() => {
      // Mock Date to be at 00:30
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-01-16T00:30:00'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('does not project when less than 1 hour elapsed', () => {
      const completeness: DataCompleteness = {
        claudeCode: { lastDataDate: '2025-01-15' },
        cursor: { lastDataDate: '2025-01-15' },
      };
      const data: DailyUsage[] = [
        { date: '2025-01-16', claudeCode: 100, cursor: 50, cost: 0.01 },
      ];

      const result = applyProjections(data, completeness, '2025-01-16');

      // Marked as incomplete but no projection (too early)
      expect(result[0].isIncomplete).toBe(true);
      expect(result[0].projectedClaudeCode).toBeUndefined();
      expect(result[0].claudeCode).toBe(100);  // Unchanged
    });
  });

  it('handles null lastDataDate (no data for tool)', () => {
    const completeness: DataCompleteness = {
      claudeCode: { lastDataDate: null },
      cursor: { lastDataDate: '2025-01-15' },
    };
    const data: DailyUsage[] = [
      { date: '2025-01-14', claudeCode: 0, cursor: 500, cost: 0.05 },
    ];

    const result = applyProjections(data, completeness, '2025-01-16');

    // Claude Code has no data at all, so all dates are "incomplete" for it
    expect(result[0].isIncomplete).toBe(true);
  });
});

describe('hasIncompleteData', () => {
  it('returns false for empty array', () => {
    expect(hasIncompleteData([])).toBe(false);
  });

  it('returns false when all data is complete', () => {
    const data: DailyUsage[] = [
      { date: '2025-01-14', claudeCode: 1000, cursor: 500, cost: 0.10 },
      { date: '2025-01-15', claudeCode: 1200, cursor: 600, cost: 0.12 },
    ];
    expect(hasIncompleteData(data)).toBe(false);
  });

  it('returns true when any data is incomplete', () => {
    const data: DailyUsage[] = [
      { date: '2025-01-14', claudeCode: 1000, cursor: 500, cost: 0.10 },
      { date: '2025-01-15', claudeCode: 1200, cursor: 600, cost: 0.12, isIncomplete: true },
    ];
    expect(hasIncompleteData(data)).toBe(true);
  });
});

describe('hasProjectedData', () => {
  it('returns false for empty array', () => {
    expect(hasProjectedData([])).toBe(false);
  });

  it('returns false when data is incomplete but not projected', () => {
    const data: DailyUsage[] = [
      { date: '2025-01-15', claudeCode: 0, cursor: 0, cost: 0, isIncomplete: true },
    ];
    expect(hasProjectedData(data)).toBe(false);
  });

  it('returns true when any Claude Code value is projected', () => {
    const data: DailyUsage[] = [
      { date: '2025-01-15', claudeCode: 1000, cursor: 500, cost: 0.10, isIncomplete: true, projectedClaudeCode: 500 },
    ];
    expect(hasProjectedData(data)).toBe(true);
  });

  it('returns true when any Cursor value is projected', () => {
    const data: DailyUsage[] = [
      { date: '2025-01-15', claudeCode: 500, cursor: 1000, cost: 0.10, isIncomplete: true, projectedCursor: 500 },
    ];
    expect(hasProjectedData(data)).toBe(true);
  });
});

describe('projection math verification', () => {
  beforeEach(() => {
    // Mock Date to be at 6pm (18:00) = 75% through the day
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-17T18:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('correctly extrapolates partial data at 6pm (75% of day)', () => {
    const completeness: DataCompleteness = {
      claudeCode: { lastDataDate: '2025-01-16' },
      cursor: { lastDataDate: '2025-01-16' },
    };
    const data: DailyUsage[] = [
      { date: '2025-01-16', claudeCode: 1000, cursor: 500, cost: 0.10 },
      { date: '2025-01-17', claudeCode: 750, cursor: 300, cost: 0.05 },  // Today partial
    ];

    const result = applyProjections(data, completeness, '2025-01-17');

    // At 18:00, factor = 18/24 = 0.75
    // Claude Code: 750 / 0.75 = 1000
    // Cursor: 300 / 0.75 = 400
    expect(result[1].claudeCode).toBe(1000);
    expect(result[1].cursor).toBe(400);
    expect(result[1].projectedClaudeCode).toBe(750);
    expect(result[1].projectedCursor).toBe(300);
  });

  it('excludes today from historical average calculation', () => {
    const completeness: DataCompleteness = {
      claudeCode: { lastDataDate: '2025-01-17' },  // Today has synced
      cursor: { lastDataDate: '2025-01-17' },
    };
    const data: DailyUsage[] = [
      { date: '2025-01-15', claudeCode: 1000, cursor: 500, cost: 0.10 },
      { date: '2025-01-16', claudeCode: 2000, cursor: 1000, cost: 0.20 },
      { date: '2025-01-17', claudeCode: 600, cursor: 300, cost: 0.05 },  // Today - should NOT be in average
    ];

    const result = applyProjections(data, completeness, '2025-01-17');

    // Historical average should be (1000+2000)/2 = 1500 for Claude Code
    // But we have partial data, so we extrapolate instead: 600 / 0.75 = 800
    expect(result[2].claudeCode).toBe(800);
    expect(result[2].projectedClaudeCode).toBe(600);
  });

  it('projects historical incomplete days with no data using average', () => {
    const completeness: DataCompleteness = {
      claudeCode: { lastDataDate: '2025-01-14' },  // 3 days behind
      cursor: { lastDataDate: '2025-01-16' },
    };
    const data: DailyUsage[] = [
      { date: '2025-01-13', claudeCode: 1000, cursor: 500, cost: 0.10 },
      { date: '2025-01-14', claudeCode: 2000, cursor: 1000, cost: 0.20 },
      { date: '2025-01-15', claudeCode: 0, cursor: 800, cost: 0.08 },   // CC incomplete, Cursor complete
      { date: '2025-01-16', claudeCode: 0, cursor: 600, cost: 0.06 },   // CC incomplete, Cursor complete
      { date: '2025-01-17', claudeCode: 0, cursor: 0, cost: 0 },        // Today - both incomplete
    ];

    const result = applyProjections(data, completeness, '2025-01-17');

    // Claude Code avg: (1000+2000)/2 = 1500
    // Jan 15: CC projected to 1500, Cursor stays 800 (complete)
    expect(result[2].claudeCode).toBe(1500);
    expect(result[2].projectedClaudeCode).toBe(0);
    expect(result[2].cursor).toBe(800);  // Not projected
    expect(result[2].projectedCursor).toBeUndefined();

    // Jan 16: CC projected to 1500, Cursor stays 600 (complete)
    expect(result[3].claudeCode).toBe(1500);
    expect(result[3].cursor).toBe(600);
    expect(result[3].projectedCursor).toBeUndefined();

    // Today: both projected
    // Cursor avg: (500+1000+800+600)/4 = 725 (excludes today)
    // Wait, we need to check which days are "complete" for cursor
    // Cursor lastDataDate is 2025-01-16, so Jan 13-16 are complete
    // Avg: (500+1000+800+600)/4 = 725
    expect(result[4].claudeCode).toBe(1500);  // From avg
    expect(result[4].cursor).toBe(725);       // From avg
  });

  it('handles mixed scenario: one tool has data, other does not', () => {
    const completeness: DataCompleteness = {
      claudeCode: { lastDataDate: '2025-01-15' },  // 2 days behind
      cursor: { lastDataDate: '2025-01-17' },      // Synced today
    };
    const data: DailyUsage[] = [
      { date: '2025-01-15', claudeCode: 2000, cursor: 1000, cost: 0.20 },
      { date: '2025-01-16', claudeCode: 0, cursor: 1200, cost: 0.12 },    // CC missing, Cursor complete
      { date: '2025-01-17', claudeCode: 0, cursor: 450, cost: 0.05 },     // Today: CC from avg, Cursor partial
    ];

    const result = applyProjections(data, completeness, '2025-01-17');

    // Yesterday (Jan 16): Claude Code uses avg (2000), Cursor is 1200 (complete, not today)
    // But wait - Jan 16 is not today, so Cursor shouldn't be projected
    expect(result[1].claudeCode).toBe(2000);  // Avg from Jan 15
    expect(result[1].projectedClaudeCode).toBe(0);
    expect(result[1].cursor).toBe(1200);      // Original value, not projected
    expect(result[1].projectedCursor).toBeUndefined();

    // Today: Claude Code uses avg (2000), Cursor extrapolates (450/0.75=600)
    expect(result[2].claudeCode).toBe(2000);  // From avg
    expect(result[2].projectedClaudeCode).toBe(0);
    expect(result[2].cursor).toBe(600);       // 450 / 0.75
    expect(result[2].projectedCursor).toBe(450);
  });
});
