/**
 * Projection utilities for handling incomplete data in charts.
 *
 * Data from tools like Claude Code can have ~24h lag, and Cursor ~1-2h lag.
 * This module provides functions to identify incomplete data and project
 * values based on available data.
 */

import type { DailyUsage, DataCompleteness } from './queries';

// Working hours configuration for projection
// Uses a 12-hour window (7am-7pm) to accommodate varied schedules
const WORK_WINDOW_START = 7;   // Earliest typical start (7am)
const WORK_WINDOW_END = 19;    // Latest typical end (7pm)

/**
 * Calculate the working hours factor for today's projection.
 *
 * Instead of assuming uniform usage across 24 hours, this uses a compressed
 * working day model. Most productive work happens in a 12-hour window (7am-7pm),
 * but people only work ~9 hours within that.
 *
 * - Before 7am: Returns 0 (too early to project meaningfully)
 * - Between 7am-7pm: Returns linear progress through the work window
 * - After 7pm: Returns 1 (day is considered complete)
 *
 * @param localHour - The current hour in the user's local timezone (0-24, e.g., 14.5 for 2:30 PM).
 *                    If not provided, falls back to server's local time.
 * @returns Factor between 0 and 1 representing day completion
 */
export function getWorkingHoursFactor(localHour?: number): number {
  const hour = localHour ?? (new Date().getHours() + new Date().getMinutes() / 60);

  if (hour < WORK_WINDOW_START) {
    return 0; // Too early to project
  }
  if (hour >= WORK_WINDOW_END) {
    return 1; // Day is done
  }

  // Hours into the work window
  const hoursIntoWindow = hour - WORK_WINDOW_START;
  const windowSize = WORK_WINDOW_END - WORK_WINDOW_START; // 12 hours

  // Linear progression through the work window
  return hoursIntoWindow / windowSize;
}

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
 * @param localHour - The current hour in the user's local timezone (0-24) for working hours calculation
 * @returns Data with projection fields added where applicable
 */
export function applyProjections(
  data: DailyUsage[],
  completeness: DataCompleteness,
  todayStr: string,
  localHour?: number
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

    // Calculate time factor for today's projection using working hours model
    let factor = 1;
    if (isToday) {
      factor = getWorkingHoursFactor(localHour);
      if (factor === 0) {
        // Too early to project (before work window), just mark as incomplete
        return result;
      }
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
          // When factor=1 (after work window), day is complete - no projection needed
          if (factor === 1) {
            // No projection - actual value is the final value
            continue;
          }
          result[tool.projectedKey] = currentValue;
          // Blend extrapolation with historical average based on time of day
          // Early day: weight toward historical avg (more conservative)
          // Late day: weight toward extrapolation (more data-driven)
          const extrapolated = currentValue / factor;
          let projection: number;
          if (avg > 0) {
            // Blend: factor weight to extrapolation, (1-factor) weight to historical
            const blended = factor * extrapolated + (1 - factor) * avg;
            // Cap at 1.5x historical average
            projection = Math.min(blended, avg * 1.5);
          } else {
            projection = extrapolated;
          }
          result[tool.key] = Math.round(projection);
        } else if (avg > 0 && factor < 1) {
          // No data yet today, but work day isn't over - use historical average
          result[tool.projectedKey] = 0;
          result[tool.key] = Math.round(avg);
        }
        // If factor=1 and currentValue=0, day is done with no usage - show actual 0
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
