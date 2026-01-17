/**
 * Projection utilities for handling incomplete data in charts.
 *
 * Data from tools like Claude Code can have ~24h lag, and Cursor ~1-2h lag.
 * This module provides functions to identify incomplete data and project
 * values based on available data.
 */

import type { DailyUsage, DataCompleteness } from './queries';

// Tool configuration for projection
type ToolKey = 'claudeCode' | 'cursor';
type ProjectedKey = 'projectedClaudeCode' | 'projectedCursor';
type CompletenessKey = 'claudeCode' | 'cursor';

const TOOLS: { key: ToolKey; projectedKey: ProjectedKey; completenessKey: CompletenessKey }[] = [
  { key: 'claudeCode', projectedKey: 'projectedClaudeCode', completenessKey: 'claudeCode' },
  { key: 'cursor', projectedKey: 'projectedCursor', completenessKey: 'cursor' },
];

/**
 * Calculate same-day-of-week averages from historical data.
 * Uses average of same weekdays (e.g., previous Tuesdays for a Tuesday)
 * to account for weekday vs weekend variance.
 *
 * Falls back to simple average if fewer than 2 same-day samples.
 */
function calculateHistoricalAverages(
  data: DailyUsage[],
  completeness: DataCompleteness,
  todayStr: string,
  targetDayOfWeek?: number
): Record<ToolKey, number> {
  const averages: Record<ToolKey, number> = { claudeCode: 0, cursor: 0 };

  for (const tool of TOOLS) {
    const lastDataDate = completeness[tool.completenessKey].lastDataDate;
    if (!lastDataDate) continue;

    // Filter to complete days with non-zero data for this tool
    // Exclude today since today's data is always partial (day isn't over)
    const completeDays = data.filter(d =>
      d.date <= lastDataDate &&
      d.date !== todayStr &&
      Number(d[tool.key]) > 0
    );

    if (completeDays.length === 0) continue;

    // If we have a target day of week, try to use same-day average first
    if (targetDayOfWeek !== undefined) {
      const sameDayData = completeDays.filter(d => {
        const [year, month, day] = d.date.split('-').map(Number);
        const date = new Date(year, month - 1, day);
        return date.getDay() === targetDayOfWeek;
      });

      // Use same-day average if we have at least 2 samples
      if (sameDayData.length >= 2) {
        averages[tool.key] = sameDayData.reduce((sum, d) => sum + Number(d[tool.key]), 0) / sameDayData.length;
        continue;
      }
    }

    // Fall back to simple average
    averages[tool.key] = completeDays.reduce((sum, d) => sum + Number(d[tool.key]), 0) / completeDays.length;
  }

  return averages;
}

/**
 * Apply projections to daily usage data for dates with incomplete data.
 *
 * For today: projects based on hours elapsed using either:
 *   - Partial data extrapolation (if we have some data today)
 *   - Historical average (if no data yet today)
 * For other incomplete dates: uses historical average for missing tool data
 *
 * @param data - The daily usage data from the database
 * @param completeness - Data completeness info (last date with data per tool)
 * @param todayStr - Today's date as YYYY-MM-DD string
 * @returns Data with projection fields added where applicable
 */
export function applyProjections(
  data: DailyUsage[],
  completeness: DataCompleteness,
  todayStr: string
): DailyUsage[] {
  // Get today's day of week for same-day averaging
  const [year, month, day] = todayStr.split('-').map(Number);
  const todayDate = new Date(year, month - 1, day);
  const todayDayOfWeek = todayDate.getDay();

  // Calculate averages using same-day-of-week logic
  const historicalAvg = calculateHistoricalAverages(data, completeness, todayStr, todayDayOfWeek);

  return data.map(dayData => {
    const isToday = dayData.date === todayStr;

    // Check which tools have incomplete data for this day
    const toolIncomplete: Record<ToolKey, boolean> = { claudeCode: false, cursor: false };
    let anyIncomplete = isToday; // Today is always incomplete

    for (const tool of TOOLS) {
      const lastDataDate = completeness[tool.completenessKey].lastDataDate;
      const incomplete = !lastDataDate || dayData.date > lastDataDate;
      toolIncomplete[tool.key] = incomplete;
      if (incomplete) anyIncomplete = true;
    }

    if (!anyIncomplete) {
      return dayData;
    }

    const result: DailyUsage = { ...dayData, isIncomplete: true };

    // Calculate time factor for today's projection
    let factor = 1;
    if (isToday) {
      const now = new Date();
      const hoursElapsed = now.getHours() + now.getMinutes() / 60;
      if (hoursElapsed < 1) {
        // Too early to project, just mark as incomplete
        return result;
      }
      factor = hoursElapsed / 24;
    }

    // Project each tool
    for (const tool of TOOLS) {
      const currentValue = Number(dayData[tool.key]);
      const avg = historicalAvg[tool.key];
      const isToolIncomplete = toolIncomplete[tool.key] || isToday;

      if (!isToolIncomplete) continue;

      if (isToday) {
        // Today: extrapolate from partial data or use historical average
        if (currentValue > 0) {
          result[tool.projectedKey] = currentValue;
          result[tool.key] = Math.round(currentValue / factor);
        } else if (avg > 0) {
          result[tool.projectedKey] = 0;
          result[tool.key] = Math.round(avg);
        }
      } else {
        // Historical incomplete day: use historical average if no data
        if (toolIncomplete[tool.key] && currentValue === 0 && avg > 0) {
          result[tool.projectedKey] = 0;
          result[tool.key] = Math.round(avg);
        }
      }
    }

    return result;
  });
}

/**
 * Check if any data in the array has incomplete/projected values.
 * Useful for determining whether to show projection legend in UI.
 */
export function hasIncompleteData(data: DailyUsage[]): boolean {
  return data.some(d => d.isIncomplete);
}

/**
 * Check if any data in the array has projected values (as opposed to just incomplete).
 * Projected means we extrapolated from partial data; incomplete means we just marked it.
 */
export function hasProjectedData(data: DailyUsage[]): boolean {
  return data.some(d => d.projectedClaudeCode !== undefined || d.projectedCursor !== undefined);
}

/**
 * Check if any data in the array has estimated values (historical average, no actual data).
 * This is when projectedValue === 0, meaning we had no data and used the historical average.
 */
export function hasEstimatedData(data: DailyUsage[]): boolean {
  return data.some(d => d.projectedClaudeCode === 0 || d.projectedCursor === 0);
}

/**
 * Check if any data in the array has extrapolated values (partial actual data scaled up).
 * This is when projectedValue > 0, meaning we had partial data and extrapolated.
 */
export function hasExtrapolatedData(data: DailyUsage[]): boolean {
  return data.some(d =>
    (d.projectedClaudeCode !== undefined && d.projectedClaudeCode > 0) ||
    (d.projectedCursor !== undefined && d.projectedCursor > 0)
  );
}
