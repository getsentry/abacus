/**
 * CSV utility functions for exporting data
 */

/**
 * Escape a value for CSV format
 * - Wraps values containing commas, quotes, or newlines in quotes
 * - Doubles any existing quotes
 */
export function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  const str = String(value);

  // Check if we need to escape
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    // Double any existing quotes and wrap in quotes
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * Convert an array of objects to CSV format
 */
export function convertToCsv<T>(
  rows: T[],
  columns: { key: keyof T; label: string }[]
): string {
  if (rows.length === 0) {
    return columns.map(c => escapeCsvValue(c.label)).join(',');
  }

  // Header row
  const header = columns.map(c => escapeCsvValue(c.label)).join(',');

  // Data rows
  const dataRows = rows.map(row =>
    columns.map(col => escapeCsvValue(row[col.key])).join(',')
  );

  return [header, ...dataRows].join('\n');
}

/**
 * Generate a filename with date range
 */
export function generateExportFilename(
  prefix: string,
  startDate: string,
  endDate: string
): string {
  return `${prefix}_${startDate}_to_${endDate}.csv`;
}
