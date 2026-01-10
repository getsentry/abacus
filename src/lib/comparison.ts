/**
 * Utilities for calculating period-over-period comparison deltas.
 */

/** Minimum percentage change required for a delta to be displayed */
export const DELTA_THRESHOLD = 3;

/**
 * Calculate the percentage change between two values.
 * Returns undefined if the change is below the threshold or if the calculation is invalid.
 *
 * @param current - Current period value
 * @param previous - Previous period value
 * @returns Percentage change (e.g., 15.5 for 15.5% increase) or undefined if below threshold
 */
export function calculateDelta(
  current: number,
  previous: number
): number | undefined {
  // Can't calculate meaningful delta from zero
  if (previous === 0) {
    return undefined;
  }

  const delta = ((current - previous) / previous) * 100;

  // Only return if above threshold
  if (Math.abs(delta) < DELTA_THRESHOLD) {
    return undefined;
  }

  // Round to one decimal place
  return Math.round(delta * 10) / 10;
}

/**
 * Calculate the previous period date range for comparison.
 * For a 7-day period ending today, returns the 7 days before that.
 *
 * @param startDate - Start date of current period (YYYY-MM-DD)
 * @param endDate - End date of current period (YYYY-MM-DD)
 * @returns Previous period start and end dates
 */
export function getPreviousPeriodDates(
  startDate: string,
  endDate: string
): { prevStartDate: string; prevEndDate: string } {
  // Parse as UTC to avoid timezone issues
  const start = new Date(startDate + 'T00:00:00Z');
  const end = new Date(endDate + 'T00:00:00Z');

  // Calculate the duration of the period in days
  const durationMs = end.getTime() - start.getTime();
  const durationDays = Math.round(durationMs / (1000 * 60 * 60 * 24)) + 1;

  // Previous period ends the day before current period starts
  const prevEnd = new Date(start);
  prevEnd.setUTCDate(prevEnd.getUTCDate() - 1);

  // Previous period starts durationDays before its end
  const prevStart = new Date(prevEnd);
  prevStart.setUTCDate(prevStart.getUTCDate() - durationDays + 1);

  return {
    prevStartDate: formatDateISO(prevStart),
    prevEndDate: formatDateISO(prevEnd),
  };
}

/**
 * Format a date as YYYY-MM-DD string.
 */
function formatDateISO(date: Date): string {
  return date.toISOString().split('T')[0];
}
