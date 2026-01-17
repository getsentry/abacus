import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { applyProjections, hasIncompleteData, hasProjectedData, hasEstimatedData, hasExtrapolatedData } from './projection';
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

describe('hasEstimatedData', () => {
  it('returns false for empty array', () => {
    expect(hasEstimatedData([])).toBe(false);
  });

  it('returns false when projected values are > 0 (extrapolated, not estimated)', () => {
    const data: DailyUsage[] = [
      { date: '2025-01-15', claudeCode: 1000, cursor: 500, cost: 0.10, isIncomplete: true, projectedClaudeCode: 500 },
    ];
    expect(hasEstimatedData(data)).toBe(false);
  });

  it('returns true when projectedClaudeCode is 0 (using historical avg)', () => {
    const data: DailyUsage[] = [
      { date: '2025-01-15', claudeCode: 1500, cursor: 500, cost: 0.15, isIncomplete: true, projectedClaudeCode: 0 },
    ];
    expect(hasEstimatedData(data)).toBe(true);
  });

  it('returns true when projectedCursor is 0 (using historical avg)', () => {
    const data: DailyUsage[] = [
      { date: '2025-01-15', claudeCode: 500, cursor: 750, cost: 0.10, isIncomplete: true, projectedCursor: 0 },
    ];
    expect(hasEstimatedData(data)).toBe(true);
  });
});

describe('hasExtrapolatedData', () => {
  it('returns false for empty array', () => {
    expect(hasExtrapolatedData([])).toBe(false);
  });

  it('returns false when projected values are 0 (estimated, not extrapolated)', () => {
    const data: DailyUsage[] = [
      { date: '2025-01-15', claudeCode: 1500, cursor: 750, cost: 0.15, isIncomplete: true, projectedClaudeCode: 0, projectedCursor: 0 },
    ];
    expect(hasExtrapolatedData(data)).toBe(false);
  });

  it('returns true when projectedClaudeCode > 0 (has actual partial data)', () => {
    const data: DailyUsage[] = [
      { date: '2025-01-15', claudeCode: 1000, cursor: 500, cost: 0.10, isIncomplete: true, projectedClaudeCode: 500 },
    ];
    expect(hasExtrapolatedData(data)).toBe(true);
  });

  it('returns true when projectedCursor > 0 (has actual partial data)', () => {
    const data: DailyUsage[] = [
      { date: '2025-01-15', claudeCode: 500, cursor: 1000, cost: 0.10, isIncomplete: true, projectedCursor: 500 },
    ];
    expect(hasExtrapolatedData(data)).toBe(true);
  });
});

describe('same-day-of-week averaging', () => {
  beforeEach(() => {
    // Mock Date to be Tuesday Jan 21, 2025 at noon
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-21T12:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses same-day-of-week average when enough samples exist', () => {
    const completeness: DataCompleteness = {
      claudeCode: { lastDataDate: '2025-01-20' },
      cursor: { lastDataDate: '2025-01-20' },
    };
    // 3 weeks of data with weekday/weekend variance
    // Tuesdays: Jan 7, Jan 14 have 2000 tokens
    // Other weekdays and weekends have different values
    const data: DailyUsage[] = [
      // Week 1
      { date: '2025-01-06', claudeCode: 500, cursor: 250, cost: 0.05 },   // Mon
      { date: '2025-01-07', claudeCode: 2000, cursor: 1000, cost: 0.20 }, // Tue
      { date: '2025-01-08', claudeCode: 600, cursor: 300, cost: 0.06 },   // Wed
      { date: '2025-01-09', claudeCode: 700, cursor: 350, cost: 0.07 },   // Thu
      { date: '2025-01-10', claudeCode: 800, cursor: 400, cost: 0.08 },   // Fri
      { date: '2025-01-11', claudeCode: 100, cursor: 50, cost: 0.01 },    // Sat
      { date: '2025-01-12', claudeCode: 150, cursor: 75, cost: 0.015 },   // Sun
      // Week 2
      { date: '2025-01-13', claudeCode: 550, cursor: 275, cost: 0.055 },  // Mon
      { date: '2025-01-14', claudeCode: 1800, cursor: 900, cost: 0.18 },  // Tue
      { date: '2025-01-15', claudeCode: 650, cursor: 325, cost: 0.065 },  // Wed
      { date: '2025-01-16', claudeCode: 750, cursor: 375, cost: 0.075 },  // Thu
      { date: '2025-01-17', claudeCode: 850, cursor: 425, cost: 0.085 },  // Fri
      { date: '2025-01-18', claudeCode: 120, cursor: 60, cost: 0.012 },   // Sat
      { date: '2025-01-19', claudeCode: 180, cursor: 90, cost: 0.018 },   // Sun
      { date: '2025-01-20', claudeCode: 580, cursor: 290, cost: 0.058 },  // Mon
      { date: '2025-01-21', claudeCode: 0, cursor: 0, cost: 0 },          // Tue - today, no data yet
    ];

    const result = applyProjections(data, completeness, '2025-01-21');

    // Should use Tuesday average: (2000 + 1800) / 2 = 1900 for Claude Code
    // Should use Tuesday average: (1000 + 900) / 2 = 950 for Cursor
    expect(result[15].claudeCode).toBe(1900);
    expect(result[15].cursor).toBe(950);
    expect(result[15].projectedClaudeCode).toBe(0);
    expect(result[15].projectedCursor).toBe(0);
  });

  it('falls back to simple average when fewer than 2 same-day samples', () => {
    const completeness: DataCompleteness = {
      claudeCode: { lastDataDate: '2025-01-20' },
      cursor: { lastDataDate: '2025-01-20' },
    };
    // Only 1 week of data, so only 1 Tuesday sample
    const data: DailyUsage[] = [
      { date: '2025-01-14', claudeCode: 2000, cursor: 1000, cost: 0.20 }, // Tue
      { date: '2025-01-15', claudeCode: 600, cursor: 300, cost: 0.06 },   // Wed
      { date: '2025-01-16', claudeCode: 700, cursor: 350, cost: 0.07 },   // Thu
      { date: '2025-01-17', claudeCode: 800, cursor: 400, cost: 0.08 },   // Fri
      { date: '2025-01-18', claudeCode: 100, cursor: 50, cost: 0.01 },    // Sat
      { date: '2025-01-19', claudeCode: 150, cursor: 75, cost: 0.015 },   // Sun
      { date: '2025-01-20', claudeCode: 550, cursor: 275, cost: 0.055 },  // Mon
      { date: '2025-01-21', claudeCode: 0, cursor: 0, cost: 0 },          // Tue - today
    ];

    const result = applyProjections(data, completeness, '2025-01-21');

    // Should fall back to simple average: (2000+600+700+800+100+150+550) / 7 = 700 for Claude Code
    // (1000+300+350+400+50+75+275) / 7 = 350 for Cursor
    expect(result[7].claudeCode).toBe(700);
    expect(result[7].cursor).toBe(350);
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
