import { describe, it, expect } from 'vitest';
import { applyProjections, hasIncompleteData, hasProjectedData, hasEstimatedData } from './projection';
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

  it('returns data unchanged when complete', () => {
    const data: DailyUsage[] = [
      { date: '2025-01-14', claudeCode: 1000, cursor: 500, cost: 0.10 },
      { date: '2025-01-15', claudeCode: 1200, cursor: 600, cost: 0.12 },
    ];

    // Today is after the data range, so all data is complete
    const result = applyProjections(data, mockCompleteness, '2025-01-20');

    expect(result[0]).toEqual(data[0]);
    expect(result[1]).toEqual(data[1]);
  });

  it('projects incomplete days using historical average', () => {
    const completeness: DataCompleteness = {
      claudeCode: { lastDataDate: '2025-01-15' },
      cursor: { lastDataDate: '2025-01-15' },
    };
    const data: DailyUsage[] = [
      { date: '2025-01-14', claudeCode: 1000, cursor: 500, cost: 0.10 },
      { date: '2025-01-15', claudeCode: 2000, cursor: 1000, cost: 0.20 },
      { date: '2025-01-16', claudeCode: 0, cursor: 0, cost: 0 },  // Incomplete, no data yet
    ];

    const result = applyProjections(data, completeness, '2025-01-16');

    // Should project using historical average (1500 for Claude Code, 750 for Cursor)
    expect(result[2].isIncomplete).toBe(true);
    expect(result[2].projectedClaudeCode).toBe(0);  // Actual value
    expect(result[2].claudeCode).toBe(1500);  // Historical avg
    expect(result[2].projectedCursor).toBe(0);
    expect(result[2].cursor).toBe(750);
  });

  it('stores partial data and projects to historical average', () => {
    const completeness: DataCompleteness = {
      claudeCode: { lastDataDate: '2025-01-15' },
      cursor: { lastDataDate: '2025-01-15' },
    };
    const data: DailyUsage[] = [
      { date: '2025-01-14', claudeCode: 1000, cursor: 500, cost: 0.10 },
      { date: '2025-01-15', claudeCode: 2000, cursor: 1000, cost: 0.20 },
      { date: '2025-01-16', claudeCode: 300, cursor: 150, cost: 0.03 },  // Partial data
    ];

    const result = applyProjections(data, completeness, '2025-01-16');

    // Should store actual partial data, project to historical average
    expect(result[2].isIncomplete).toBe(true);
    expect(result[2].projectedClaudeCode).toBe(300);  // Actual partial value
    expect(result[2].claudeCode).toBe(1500);  // Historical avg
    expect(result[2].projectedCursor).toBe(150);
    expect(result[2].cursor).toBe(750);
  });

  it('does not project when no historical data available', () => {
    const completeness: DataCompleteness = {
      claudeCode: { lastDataDate: '2025-01-15' },
      cursor: { lastDataDate: '2025-01-15' },
    };
    // Only today's data, no historical data to average from
    const data: DailyUsage[] = [
      { date: '2025-01-16', claudeCode: 500, cursor: 250, cost: 0.05 },
    ];

    const result = applyProjections(data, completeness, '2025-01-16');

    expect(result[0].isIncomplete).toBe(true);
    expect(result[0].projectedClaudeCode).toBeUndefined();  // No historical data
    expect(result[0].claudeCode).toBe(500);  // Unchanged
    expect(result[0].projectedCursor).toBeUndefined();
    expect(result[0].cursor).toBe(250);
  });

  it('handles mixed tool completeness', () => {
    const completeness: DataCompleteness = {
      claudeCode: { lastDataDate: '2025-01-14' },  // 2 days behind
      cursor: { lastDataDate: '2025-01-16' },      // Up to date
    };
    const data: DailyUsage[] = [
      { date: '2025-01-14', claudeCode: 2000, cursor: 1000, cost: 0.20 },
      { date: '2025-01-15', claudeCode: 0, cursor: 800, cost: 0.08 },   // CC incomplete, Cursor complete
      { date: '2025-01-16', claudeCode: 0, cursor: 600, cost: 0.06 },   // CC incomplete, Cursor complete
    ];

    const result = applyProjections(data, completeness, '2025-01-16');

    // Jan 15: Claude Code projected, Cursor unchanged
    expect(result[1].isIncomplete).toBe(true);
    expect(result[1].claudeCode).toBe(2000);  // Avg from Jan 14
    expect(result[1].projectedClaudeCode).toBe(0);
    expect(result[1].cursor).toBe(800);  // Unchanged (complete)
    expect(result[1].projectedCursor).toBeUndefined();

    // Jan 16: Claude Code projected, Cursor unchanged
    expect(result[2].claudeCode).toBe(2000);
    expect(result[2].cursor).toBe(600);
    expect(result[2].projectedCursor).toBeUndefined();
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

describe('same-day-of-week averaging', () => {
  it('uses same-day-of-week average when enough samples exist', () => {
    const completeness: DataCompleteness = {
      claudeCode: { lastDataDate: '2025-01-20' },
      cursor: { lastDataDate: '2025-01-20' },
    };
    // 3 weeks of data with weekday variance
    // Tuesdays: Jan 7, Jan 14 have 2000 tokens
    // Other days have different values
    const data: DailyUsage[] = [
      // Week 1
      { date: '2025-01-06', claudeCode: 500, cursor: 250, cost: 0.05 },   // Mon
      { date: '2025-01-07', claudeCode: 2000, cursor: 1000, cost: 0.20 }, // Tue
      { date: '2025-01-08', claudeCode: 600, cursor: 300, cost: 0.06 },   // Wed
      // Week 2
      { date: '2025-01-13', claudeCode: 550, cursor: 275, cost: 0.055 },  // Mon
      { date: '2025-01-14', claudeCode: 1800, cursor: 900, cost: 0.18 },  // Tue
      { date: '2025-01-15', claudeCode: 650, cursor: 325, cost: 0.065 },  // Wed
      { date: '2025-01-20', claudeCode: 580, cursor: 290, cost: 0.058 },  // Mon
      { date: '2025-01-21', claudeCode: 0, cursor: 0, cost: 0 },          // Tue - incomplete
    ];

    const result = applyProjections(data, completeness, '2025-01-21');

    // Should use Tuesday average: (2000 + 1800) / 2 = 1900 for Claude Code
    // Should use Tuesday average: (1000 + 900) / 2 = 950 for Cursor
    expect(result[7].claudeCode).toBe(1900);
    expect(result[7].cursor).toBe(950);
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
      { date: '2025-01-21', claudeCode: 0, cursor: 0, cost: 0 },          // Tue - incomplete
    ];

    const result = applyProjections(data, completeness, '2025-01-21');

    // Should fall back to simple average: (2000+600+700+800+100+150+550) / 7 = 700 for Claude Code
    expect(result[7].claudeCode).toBe(700);
    expect(result[7].cursor).toBe(350);
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

  it('returns false when no projected values', () => {
    const data: DailyUsage[] = [
      { date: '2025-01-15', claudeCode: 1000, cursor: 500, cost: 0.10 },
    ];
    expect(hasEstimatedData(data)).toBe(false);
  });

  it('returns true when projectedClaudeCode exists', () => {
    const data: DailyUsage[] = [
      { date: '2025-01-15', claudeCode: 1500, cursor: 500, cost: 0.15, isIncomplete: true, projectedClaudeCode: 0 },
    ];
    expect(hasEstimatedData(data)).toBe(true);
  });

  it('returns true when projectedCursor exists', () => {
    const data: DailyUsage[] = [
      { date: '2025-01-15', claudeCode: 500, cursor: 750, cost: 0.10, isIncomplete: true, projectedCursor: 0 },
    ];
    expect(hasEstimatedData(data)).toBe(true);
  });
});
