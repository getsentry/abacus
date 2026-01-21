import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { applyProjections, hasIncompleteData, hasProjectedData, hasEstimatedData, hasExtrapolatedData, getWorkingHoursFactor } from './projection';
import type { DailyUsage, DataCompleteness } from './queries';

describe('getWorkingHoursFactor', () => {
  it('returns 0 before work window (before 7am)', () => {
    expect(getWorkingHoursFactor(6)).toBe(0);
    expect(getWorkingHoursFactor(6.99)).toBe(0);
  });

  it('returns correct factor during work window', () => {
    // At 7am: 0/12 = 0
    expect(getWorkingHoursFactor(7)).toBeCloseTo(0, 5);

    // At 9am: 2/12 ≈ 0.167
    expect(getWorkingHoursFactor(9)).toBeCloseTo(2/12, 5);

    // At 1pm (13:00): 6/12 = 0.5
    expect(getWorkingHoursFactor(13)).toBeCloseTo(0.5, 5);

    // At 6pm (18:00): 11/12 ≈ 0.917
    expect(getWorkingHoursFactor(18)).toBeCloseTo(11/12, 5);
  });

  it('returns 1 after work window (7pm+)', () => {
    // At 7pm: factor = 1 (day complete)
    expect(getWorkingHoursFactor(19)).toBe(1);

    // At 10pm: still 1
    expect(getWorkingHoursFactor(22)).toBe(1);

    // At midnight: still 1 (for that calendar day)
    expect(getWorkingHoursFactor(23.99)).toBe(1);
  });

  it('handles fractional hours correctly', () => {
    // At 10:30am: 3.5/12 ≈ 0.292
    expect(getWorkingHoursFactor(10.5)).toBeCloseTo(3.5/12, 5);
  });

  it('falls back to server time when localHour not provided', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-16T13:00:00'));
    // At 1pm, factor should be 0.5
    expect(getWorkingHoursFactor()).toBeCloseTo(0.5, 5);
    vi.useRealTimers();
  });
});

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
    it('projects today\'s data based on working hours factor', () => {
      const completeness: DataCompleteness = {
        claudeCode: { lastDataDate: '2025-01-15' },
        cursor: { lastDataDate: '2025-01-15' },
      };
      const data: DailyUsage[] = [
        { date: '2025-01-16', claudeCode: 500, cursor: 250, cost: 0.05 },
      ];

      // Pass localHour = 12 (noon)
      const result = applyProjections(data, completeness, '2025-01-16', 12);

      // At 12:00, factor = (12-7)/12 = 5/12 ≈ 0.417
      // No historical data, so no cap applies
      // 500 / 0.417 ≈ 1200, 250 / 0.417 ≈ 600
      expect(result[0].isIncomplete).toBe(true);
      expect(result[0].projectedClaudeCode).toBe(500);  // Original value stored
      expect(result[0].claudeCode).toBe(1200);  // 500 / (5/12)
      expect(result[0].projectedCursor).toBe(250);
      expect(result[0].cursor).toBe(600);  // 250 / (5/12)
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

      const result = applyProjections(data, completeness, '2025-01-16', 12);

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

      const result = applyProjections(data, completeness, '2025-01-16', 12);

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

      const result = applyProjections(data, completeness, '2025-01-16', 12);

      // At 12:00, factor = 5/12 ≈ 0.417, both tools are projected
      expect(result[0].isIncomplete).toBe(true);
      expect(result[0].projectedClaudeCode).toBe(500);
      expect(result[0].claudeCode).toBe(1200);  // 500 / (5/12)
      expect(result[0].projectedCursor).toBe(1000);  // Cursor also projected
      expect(result[0].cursor).toBe(2400);  // 1000 / (5/12)
    });
  });

  describe('before working hours edge case', () => {
    it('does not project before work window starts', () => {
      const completeness: DataCompleteness = {
        claudeCode: { lastDataDate: '2025-01-15' },
        cursor: { lastDataDate: '2025-01-15' },
      };
      const data: DailyUsage[] = [
        { date: '2025-01-16', claudeCode: 100, cursor: 50, cost: 0.01 },
      ];

      // Pass localHour = 6.5 (6:30am, before 7am work window)
      const result = applyProjections(data, completeness, '2025-01-16', 6.5);

      // Marked as incomplete but no projection (before 7am work window)
      expect(result[0].isIncomplete).toBe(true);
      expect(result[0].projectedClaudeCode).toBeUndefined();
      expect(result[0].claudeCode).toBe(100);  // Unchanged
    });
  });

  describe('after working hours', () => {
    it('does not scale projection after work window ends (factor = 1)', () => {
      const completeness: DataCompleteness = {
        claudeCode: { lastDataDate: '2025-01-15' },
        cursor: { lastDataDate: '2025-01-15' },
      };
      const data: DailyUsage[] = [
        { date: '2025-01-16', claudeCode: 800, cursor: 400, cost: 0.08 },
      ];

      // Pass localHour = 20 (8pm, after 7pm work window)
      const result = applyProjections(data, completeness, '2025-01-16', 20);

      // After 7pm, factor = 1, so projected = actual (no scaling)
      expect(result[0].isIncomplete).toBe(true);
      expect(result[0].projectedClaudeCode).toBe(800);
      expect(result[0].claudeCode).toBe(800);  // 800 / 1 = 800
      expect(result[0].projectedCursor).toBe(400);
      expect(result[0].cursor).toBe(400);  // 400 / 1 = 400
    });
  });

  describe('blended projection with historical average', () => {
    it('blends extrapolation with historical average early in day', () => {
      const completeness: DataCompleteness = {
        claudeCode: { lastDataDate: '2025-01-15' },
        cursor: { lastDataDate: '2025-01-15' },
      };
      const data: DailyUsage[] = [
        { date: '2025-01-14', claudeCode: 1000, cursor: 500, cost: 0.10 },
        { date: '2025-01-15', claudeCode: 1000, cursor: 500, cost: 0.10 },
        { date: '2025-01-16', claudeCode: 200, cursor: 100, cost: 0.02 },  // Today, early
      ];

      // Pass localHour = 8 (8am, early in work window)
      const result = applyProjections(data, completeness, '2025-01-16', 8);

      // At 8am, factor = 1/12 ≈ 0.083
      // extrapolated = 200 / 0.083 = 2400
      // blended = 0.083 * 2400 + 0.917 * 1000 = 200 + 917 = 1117
      // cap = 1.5 * 1000 = 1500, 1117 < 1500 so no cap
      expect(result[2].projectedClaudeCode).toBe(200);
      expect(result[2].claudeCode).toBe(1117);  // Blended, conservative

      // Cursor: extrapolated = 1200, blended = 0.083*1200 + 0.917*500 ≈ 558
      expect(result[2].projectedCursor).toBe(100);
      expect(result[2].cursor).toBe(558);
    });

    it('caps at 1.5x historical average', () => {
      const completeness: DataCompleteness = {
        claudeCode: { lastDataDate: '2025-01-15' },
        cursor: { lastDataDate: '2025-01-15' },
      };
      // Low historical average relative to today's early data
      const data: DailyUsage[] = [
        { date: '2025-01-14', claudeCode: 500, cursor: 250, cost: 0.05 },
        { date: '2025-01-15', claudeCode: 500, cursor: 250, cost: 0.05 },
        { date: '2025-01-16', claudeCode: 400, cursor: 200, cost: 0.04 },  // Today, already high
      ];

      // Pass localHour = 8 (8am)
      const result = applyProjections(data, completeness, '2025-01-16', 8);

      // At 8am, factor = 1/12 ≈ 0.083
      // extrapolated = 400 / 0.083 = 4800
      // blended = 0.083 * 4800 + 0.917 * 500 = 398 + 459 = 857
      // cap = 1.5 * 500 = 750, 857 > 750 so CAPPED
      expect(result[2].projectedClaudeCode).toBe(400);
      expect(result[2].claudeCode).toBe(750);  // Capped at 1.5x historical

      expect(result[2].projectedCursor).toBe(200);
      expect(result[2].cursor).toBe(375);  // Capped at 1.5 * 250
    });

    it('weights toward historical average early, extrapolation late', () => {
      const completeness: DataCompleteness = {
        claudeCode: { lastDataDate: '2025-01-15' },
        cursor: { lastDataDate: '2025-01-15' },
      };
      const data: DailyUsage[] = [
        { date: '2025-01-14', claudeCode: 5000, cursor: 2500, cost: 0.50 },
        { date: '2025-01-15', claudeCode: 5000, cursor: 2500, cost: 0.50 },
        { date: '2025-01-16', claudeCode: 200, cursor: 100, cost: 0.02 },  // Today, early
      ];

      // Pass localHour = 8 (8am)
      const result = applyProjections(data, completeness, '2025-01-16', 8);

      // At 8am, factor = 1/12 ≈ 0.083 (heavily weighted to historical)
      // extrapolated = 200 / 0.083 = 2400
      // blended = 0.083 * 2400 + 0.917 * 5000 = 200 + 4585 = 4785
      // cap = 1.5 * 5000 = 7500, so no cap
      expect(result[2].projectedClaudeCode).toBe(200);
      expect(result[2].claudeCode).toBe(4783);  // Heavily weighted to historical avg
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

    // Pass localHour = 12 (noon on Tuesday Jan 21)
    const result = applyProjections(data, completeness, '2025-01-21', 12);

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

    // Pass localHour = 12 (noon)
    const result = applyProjections(data, completeness, '2025-01-21', 12);

    // Should fall back to simple average: (2000+600+700+800+100+150+550) / 7 = 700 for Claude Code
    // (1000+300+350+400+50+75+275) / 7 = 350 for Cursor
    expect(result[7].claudeCode).toBe(700);
    expect(result[7].cursor).toBe(350);
  });
});

describe('projection math verification', () => {
  it('correctly blends partial data at 6pm (near end of work window)', () => {
    const completeness: DataCompleteness = {
      claudeCode: { lastDataDate: '2025-01-16' },
      cursor: { lastDataDate: '2025-01-16' },
    };
    const data: DailyUsage[] = [
      { date: '2025-01-16', claudeCode: 1000, cursor: 500, cost: 0.10 },
      { date: '2025-01-17', claudeCode: 750, cursor: 300, cost: 0.05 },  // Today partial
    ];

    // Pass localHour = 18 (6pm)
    const result = applyProjections(data, completeness, '2025-01-17', 18);

    // At 18:00, factor = 11/12 ≈ 0.917 (heavily weighted to extrapolation)
    // extrapolated = 750 / 0.917 = 818
    // blended = 0.917 * 818 + 0.083 * 1000 = 750 + 83 = 833
    expect(result[1].claudeCode).toBe(833);
    // Cursor: extrapolated = 327, blended = 0.917*327 + 0.083*500 = 300 + 42 = 342
    expect(result[1].cursor).toBe(342);
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

    // Pass localHour = 18 (6pm)
    const result = applyProjections(data, completeness, '2025-01-17', 18);

    // Historical average = (1000+2000)/2 = 1500 for Claude Code
    // At 6pm, factor = 11/12 ≈ 0.917
    // extrapolated = 600 / 0.917 = 655
    // blended = 0.917 * 655 + 0.083 * 1500 ≈ 725
    expect(result[2].claudeCode).toBe(725);
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

    // Pass localHour = 18 (6pm)
    const result = applyProjections(data, completeness, '2025-01-17', 18);

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

    // Pass localHour = 18 (6pm)
    const result = applyProjections(data, completeness, '2025-01-17', 18);

    // Yesterday (Jan 16): Claude Code uses avg (2000), Cursor is 1200 (complete, not today)
    expect(result[1].claudeCode).toBe(2000);  // Avg from Jan 15
    expect(result[1].projectedClaudeCode).toBe(0);
    expect(result[1].cursor).toBe(1200);      // Original value, not projected
    expect(result[1].projectedCursor).toBeUndefined();

    // Today at 6pm: Claude Code uses avg (2000), Cursor blends
    // Cursor avg = (1000+1200)/2 = 1100
    // extrapolated = 450 / 0.917 = 491
    // blended = 0.917 * 491 + 0.083 * 1100 ≈ 542
    expect(result[2].claudeCode).toBe(2000);  // From avg
    expect(result[2].projectedClaudeCode).toBe(0);
    expect(result[2].cursor).toBe(542);       // Blended
    expect(result[2].projectedCursor).toBe(450);
  });
});
