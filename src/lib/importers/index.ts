import { isClaudeCodeCsv, importClaudeCodeCsv } from './claude-code';
import { isCursorCsv, importCursorCsv } from './cursor';

export type CsvType = 'claude_code' | 'cursor' | 'unknown';

export function detectCsvType(csvContent: string): CsvType {
  // Get first line to check headers
  const firstLine = csvContent.split('\n')[0];
  const headers = firstLine.split(',').map(h => h.trim().replace(/"/g, ''));

  if (isClaudeCodeCsv(headers)) {
    return 'claude_code';
  }

  if (isCursorCsv(headers)) {
    return 'cursor';
  }

  return 'unknown';
}

export async function importCsv(csvContent: string, forceType?: CsvType) {
  const type = forceType || detectCsvType(csvContent);

  switch (type) {
    case 'claude_code':
      return { type, result: await importClaudeCodeCsv(csvContent) };
    case 'cursor':
      return { type, result: await importCursorCsv(csvContent) };
    default:
      return {
        type: 'unknown' as const,
        result: {
          success: false,
          recordsImported: 0,
          recordsSkipped: 0,
          errors: ['Unknown CSV format. Expected Claude Code or Cursor export.']
        }
      };
  }
}

export { extractEmailFromApiKey } from './claude-code';
