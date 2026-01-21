/**
 * Projection utilities for handling incomplete data in charts.
 *
 * Data from tools like Claude Code can have ~24h lag, and Cursor ~1-2h lag.
 * For incomplete days (no data yet), we show same-day-of-week historical average.
 *
 * This is a simple approach that works for global companies where users are
 * distributed across timezones - we don't try to extrapolate based on time of day.
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
    // Exclude today since today's data may be incomplete
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
 * Simple approach:
 * - If we have data for a day → use it as-is
 * - If no data yet (date > lastDataDate) → use historical same-day-of-week average
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
    // Check which tools have incomplete data for this day
    const toolIncomplete: Record<ToolKey, boolean> = { claudeCode: false, cursor: false };
    let anyIncomplete = false;

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

    // For each incomplete tool, project using historical average
    for (const tool of TOOLS) {
      if (!toolIncomplete[tool.key]) continue;

      const currentValue = Number(dayData[tool.key]);
      const avg = historicalAvg[tool.key];

      if (avg > 0) {
        // Store actual value, project to historical average
        // For global companies, historical average is our best estimate
        // since we can't use time-based extrapolation
        result[tool.projectedKey] = currentValue;
        result[tool.key] = Math.round(avg);
      }
      // If no historical average, just show current value as-is
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
 * Projected means we used historical average; incomplete means we just marked it.
 */
export function hasProjectedData(data: DailyUsage[]): boolean {
  return data.some(d => d.projectedClaudeCode !== undefined || d.projectedCursor !== undefined);
}

/**
 * Check if any data in the array has estimated values (using historical average).
 * For incomplete days, we always use historical average as the projection.
 */
export function hasEstimatedData(data: DailyUsage[]): boolean {
  return data.some(d => d.projectedClaudeCode !== undefined || d.projectedCursor !== undefined);
}
