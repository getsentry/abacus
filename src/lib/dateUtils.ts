/**
 * Date utilities for time range management
 * All dates are formatted as YYYY-MM-DD strings for consistency with the database
 */

export type TimeRange =
  | { type: 'relative'; days: number }
  | { type: 'absolute'; startDate: string; endDate: string };

export type QuickRangeKey = 'thisWeek' | 'thisMonth' | 'lastMonth' | 'thisYear' | 'allTime';

/**
 * Format a Date object to YYYY-MM-DD string
 */
export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parse a YYYY-MM-DD string to a Date object (in local timezone)
 */
export function parseDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Get today's date as YYYY-MM-DD
 */
export function today(): string {
  return formatDate(new Date());
}

/**
 * Get start of week (Monday) for a given date
 */
export function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday = 1
  d.setDate(diff);
  return d;
}

/**
 * Get start of month for a given date
 */
export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/**
 * Get end of month for a given date
 */
export function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

/**
 * Get start of quarter for a given date
 */
export function startOfQuarter(date: Date): Date {
  const quarter = Math.floor(date.getMonth() / 3);
  return new Date(date.getFullYear(), quarter * 3, 1);
}

/**
 * Get start of year for a given date
 */
export function startOfYear(date: Date): Date {
  return new Date(date.getFullYear(), 0, 1);
}

/**
 * Subtract months from a date
 */
export function subMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() - months);
  return d;
}

/**
 * Subtract days from a date
 */
export function subDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - days);
  return d;
}

/**
 * Add days to a date
 */
export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Add months to a date
 */
export function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

/**
 * Check if two dates are the same day
 */
export function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

/**
 * Check if a date is between two dates (inclusive)
 */
export function isDateInRange(date: Date, start: Date, end: Date): boolean {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const s = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const e = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  return d >= s && d <= e;
}

/**
 * Check if a date is before another date
 */
export function isBefore(date: Date, compareDate: Date): boolean {
  return date.getTime() < compareDate.getTime();
}

/**
 * Check if a date is after another date
 */
export function isAfter(date: Date, compareDate: Date): boolean {
  return date.getTime() > compareDate.getTime();
}

/**
 * Get the number of days in a month
 */
export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * Quick range presets that return absolute date ranges
 */
export const quickRanges: Record<QuickRangeKey, () => { startDate: string; endDate: string }> = {
  thisWeek: () => {
    const now = new Date();
    return {
      startDate: formatDate(startOfWeek(now)),
      endDate: formatDate(now),
    };
  },
  thisMonth: () => {
    const now = new Date();
    return {
      startDate: formatDate(startOfMonth(now)),
      endDate: formatDate(now),
    };
  },
  lastMonth: () => {
    const now = new Date();
    const lastMonthDate = subMonths(now, 1);
    return {
      startDate: formatDate(startOfMonth(lastMonthDate)),
      endDate: formatDate(endOfMonth(lastMonthDate)),
    };
  },
  thisYear: () => {
    const now = new Date();
    return {
      startDate: formatDate(startOfYear(now)),
      endDate: formatDate(now),
    };
  },
  allTime: () => {
    const now = new Date();
    return {
      startDate: '2020-01-01',
      endDate: formatDate(now),
    };
  },
};

/**
 * Convert a TimeRange to startDate/endDate for API calls
 * For relative ranges, "N days" means today plus the previous N-1 days (N total days)
 */
export function getDateRange(range: TimeRange): { startDate: string; endDate: string } {
  if (range.type === 'absolute') {
    return { startDate: range.startDate, endDate: range.endDate };
  }
  // Relative: last N days (today + previous N-1 days)
  const now = new Date();
  const start = subDays(now, range.days - 1);
  return {
    startDate: formatDate(start),
    endDate: formatDate(now),
  };
}

/**
 * Format a date range for display
 */
export function formatDateRange(startDate: string, endDate: string): string {
  const start = parseDate(startDate);
  const end = parseDate(endDate);

  const startMonth = start.toLocaleDateString('en-US', { month: 'short' });
  const endMonth = end.toLocaleDateString('en-US', { month: 'short' });

  // Same month
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `${startMonth} ${start.getDate()} – ${end.getDate()}`;
  }

  // Same year
  if (start.getFullYear() === end.getFullYear()) {
    return `${startMonth} ${start.getDate()} – ${endMonth} ${end.getDate()}`;
  }

  // Different years
  return `${startMonth} ${start.getDate()}, ${start.getFullYear()} – ${endMonth} ${end.getDate()}, ${end.getFullYear()}`;
}

/**
 * Aggregate daily data points into weekly buckets (Monday-Sunday)
 * Used when displaying charts with large date ranges (>90 days)
 */
export function aggregateToWeekly<T extends { date: string }>(data: T[]): T[] {
  if (data.length === 0) return [];

  const weekMap = new Map<string, T>();

  for (const item of data) {
    const date = parseDate(item.date);
    const weekStart = startOfWeek(date);
    const weekKey = formatDate(weekStart);

    if (!weekMap.has(weekKey)) {
      // Initialize with the week start date and zero values for numeric fields
      const initial = { ...item, date: weekKey } as T;
      for (const key of Object.keys(item) as (keyof T)[]) {
        if (key !== 'date' && typeof item[key] === 'number') {
          (initial as Record<string, unknown>)[key as string] = 0;
        }
      }
      weekMap.set(weekKey, initial);
    }

    // Sum numeric values
    const weekData = weekMap.get(weekKey)!;
    for (const key of Object.keys(item) as (keyof T)[]) {
      if (key !== 'date' && typeof item[key] === 'number') {
        const currentVal = (weekData as Record<string, unknown>)[key as string] as number || 0;
        const addVal = item[key] as number;
        (weekData as Record<string, unknown>)[key as string] = currentVal + addVal;
      }
    }
  }

  // Sort by date and return
  return Array.from(weekMap.values()).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Get display label for a time range (compact form for buttons)
 */
export function getTimeRangeLabel(range: TimeRange): string {
  if (range.type === 'relative') {
    return `${range.days}d`;
  }
  return formatDateRange(range.startDate, range.endDate);
}

/**
 * Get a descriptive label for a time range (for section headers)
 * Returns "Last 7 days", "Last 30 days", or "Jan 1 – Jan 15" for custom ranges
 */
export function getTimeRangeDescription(range: TimeRange): string {
  if (range.type === 'relative') {
    return `Last ${range.days} days`;
  }
  return formatDateRange(range.startDate, range.endDate);
}

/**
 * Check if a range matches one of the preset relative days
 */
export function isPresetDays(range: TimeRange, presets: number[] = [7, 30, 90]): boolean {
  return range.type === 'relative' && presets.includes(range.days);
}

/**
 * Serialize a TimeRange to URL search params
 */
export function serializeTimeRange(range: TimeRange): URLSearchParams {
  const params = new URLSearchParams();
  if (range.type === 'relative') {
    params.set('days', range.days.toString());
  } else {
    params.set('start', range.startDate);
    params.set('end', range.endDate);
  }
  return params;
}

/**
 * Parse URL search params to a TimeRange
 */
export function parseTimeRangeFromParams(
  searchParams: URLSearchParams,
  defaultDays: number
): TimeRange {
  const start = searchParams.get('start');
  const end = searchParams.get('end');

  if (start && end) {
    return { type: 'absolute', startDate: start, endDate: end };
  }

  const days = parseInt(searchParams.get('days') || String(defaultDays), 10) || defaultDays;
  return { type: 'relative', days };
}
