import { describe, it, expect } from 'vitest';
import {
  normalizeModelName,
  isValidDateString,
  formatTokens,
  formatCurrency,
  escapeLikePattern,
  linearRegression,
  MODEL_DEFAULT,
} from '@/lib/utils';

describe('normalizeModelName', () => {
  it('normalizes full Anthropic names with dates', () => {
    expect(normalizeModelName('claude-3-5-haiku-20241022')).toBe('haiku-3.5');
    expect(normalizeModelName('claude-sonnet-4-20250514')).toBe('sonnet-4');
    expect(normalizeModelName('claude-opus-4-5-20251101')).toBe('opus-4.5');
  });

  it('normalizes reversed patterns', () => {
    expect(normalizeModelName('4-sonnet')).toBe('sonnet-4');
    expect(normalizeModelName('4.5-opus')).toBe('opus-4.5');
  });

  it('normalizes claude- prefixed names', () => {
    expect(normalizeModelName('claude-4-sonnet')).toBe('sonnet-4');
    expect(normalizeModelName('claude-4.5-opus')).toBe('opus-4.5');
  });

  it('handles thinking variants', () => {
    expect(normalizeModelName('claude-4-sonnet-thinking')).toBe('sonnet-4');
    expect(normalizeModelName('claude-4-sonnet-high-thinking')).toBe('sonnet-4');
    expect(normalizeModelName('sonnet-4 (T)')).toBe('sonnet-4');
  });

  it('strips bracketed suffixes like [1m]', () => {
    expect(normalizeModelName('claude-sonnet-4-5-20250929[1m]')).toBe('sonnet-4.5');
    expect(normalizeModelName('sonnet-4[test]')).toBe('sonnet-4');
  });

  it('returns default magic string for auto/default/unknown', () => {
    expect(normalizeModelName('default')).toBe(MODEL_DEFAULT);
    expect(normalizeModelName('auto')).toBe(MODEL_DEFAULT);
    expect(normalizeModelName('unknown')).toBe(MODEL_DEFAULT);
  });

  it('returns empty string for empty input', () => {
    expect(normalizeModelName('')).toBe('');
  });

  it('handles standalone version numbers', () => {
    expect(normalizeModelName('4')).toBe('sonnet-4');
    expect(normalizeModelName('4.5')).toBe('sonnet-4.5');
  });

  it('handles names without claude- prefix', () => {
    expect(normalizeModelName('3-5-haiku-20241022')).toBe('haiku-3.5');
  });

  it('returns original for unrecognized patterns', () => {
    expect(normalizeModelName('gpt-4')).toBe('gpt-4');
    expect(normalizeModelName('some-random-model')).toBe('some-random-model');
  });
});

describe('isValidDateString', () => {
  it('accepts valid ISO dates', () => {
    expect(isValidDateString('2025-01-01')).toBe(true);
    expect(isValidDateString('2024-12-31')).toBe(true);
    expect(isValidDateString('2020-06-15')).toBe(true);
  });

  it('rejects invalid formats', () => {
    expect(isValidDateString('01-01-2025')).toBe(false);
    expect(isValidDateString('2025/01/01')).toBe(false);
    expect(isValidDateString('not-a-date')).toBe(false);
    expect(isValidDateString('2025-1-1')).toBe(false);
    expect(isValidDateString('')).toBe(false);
  });

  it('rejects invalid calendar dates', () => {
    expect(isValidDateString('2024-02-30')).toBe(false);
    expect(isValidDateString('2025-13-01')).toBe(false);
    expect(isValidDateString('2025-00-01')).toBe(false);
    expect(isValidDateString('2025-01-32')).toBe(false);
  });

  it('handles leap years correctly', () => {
    expect(isValidDateString('2024-02-29')).toBe(true); // Leap year
    expect(isValidDateString('2023-02-29')).toBe(false); // Not a leap year
  });
});

describe('formatTokens', () => {
  it('formats millions with M suffix', () => {
    expect(formatTokens(1000000)).toBe('1.0M');
    expect(formatTokens(1500000)).toBe('1.5M');
    expect(formatTokens(2500000)).toBe('2.5M');
  });

  it('formats billions with B suffix', () => {
    expect(formatTokens(1000000000)).toBe('1.0B');
    expect(formatTokens(2500000000)).toBe('2.5B');
  });

  it('formats thousands with K suffix', () => {
    expect(formatTokens(1000)).toBe('1K');
    expect(formatTokens(5000)).toBe('5K');
    expect(formatTokens(999999)).toBe('1000K');
  });

  it('returns raw number for small values', () => {
    expect(formatTokens(0)).toBe('0');
    expect(formatTokens(100)).toBe('100');
    expect(formatTokens(999)).toBe('999');
  });

  it('handles edge cases', () => {
    expect(formatTokens(NaN)).toBe('0');
    expect(formatTokens(Infinity)).toBe('0');
    expect(formatTokens('1000000')).toBe('1.0M'); // String input
  });

  it('handles bigint values', () => {
    expect(formatTokens(BigInt(1000000))).toBe('1.0M');
  });

  it('handles negative values', () => {
    expect(formatTokens(-1000000)).toBe('-1.0M');
  });
});

describe('formatCurrency', () => {
  it('formats with dollar sign and two decimals', () => {
    expect(formatCurrency(0)).toBe('$0.00');
    expect(formatCurrency(1.5)).toBe('$1.50');
    expect(formatCurrency(99.99)).toBe('$99.99');
  });

  it('formats thousands with K suffix', () => {
    expect(formatCurrency(1000)).toBe('$1.0K');
    expect(formatCurrency(5500)).toBe('$5.5K');
  });

  it('formats millions with M suffix', () => {
    expect(formatCurrency(1000000)).toBe('$1.0M');
    expect(formatCurrency(2500000)).toBe('$2.5M');
  });

  it('handles edge cases', () => {
    expect(formatCurrency(NaN)).toBe('$0.00');
    expect(formatCurrency('100')).toBe('$100.00');
  });
});

describe('escapeLikePattern', () => {
  it('escapes percent signs', () => {
    expect(escapeLikePattern('50%')).toBe('50\\%');
    expect(escapeLikePattern('100% complete')).toBe('100\\% complete');
  });

  it('escapes underscores', () => {
    expect(escapeLikePattern('user_name')).toBe('user\\_name');
  });

  it('escapes backslashes', () => {
    expect(escapeLikePattern('path\\to\\file')).toBe('path\\\\to\\\\file');
  });

  it('handles mixed special characters', () => {
    expect(escapeLikePattern('50%_test\\')).toBe('50\\%\\_test\\\\');
  });

  it('leaves normal strings unchanged', () => {
    expect(escapeLikePattern('normal string')).toBe('normal string');
    expect(escapeLikePattern('test@example.com')).toBe('test@example.com');
  });
});

describe('linearRegression', () => {
  it('returns zeros for empty array', () => {
    const result = linearRegression([]);
    expect(result.slope).toBe(0);
    expect(result.intercept).toBe(0);
    expect(result.predictions).toEqual([]);
  });

  it('handles single value', () => {
    const result = linearRegression([5]);
    expect(result.slope).toBe(0);
    expect(result.intercept).toBe(5);
    expect(result.predictions).toEqual([5]);
  });

  it('calculates correct slope for linear data', () => {
    const result = linearRegression([1, 2, 3, 4, 5]);
    expect(result.slope).toBeCloseTo(1);
    expect(result.intercept).toBeCloseTo(1);
  });

  it('calculates correct slope for negative trend', () => {
    const result = linearRegression([5, 4, 3, 2, 1]);
    expect(result.slope).toBeCloseTo(-1);
    expect(result.intercept).toBeCloseTo(5);
  });

  it('returns predictions for each point', () => {
    const result = linearRegression([1, 2, 3]);
    expect(result.predictions.length).toBe(3);
  });

  it('handles constant values', () => {
    const result = linearRegression([5, 5, 5, 5]);
    expect(result.slope).toBe(0);
    expect(result.intercept).toBe(5);
  });
});
