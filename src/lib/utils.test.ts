import { describe, it, expect } from 'vitest';
import {
  escapeLikePattern,
  isValidDateString,
  formatTokens,
  formatCurrency,
  formatDate,
  cn,
  normalizeModelName,
  formatModelName,
  MODEL_DEFAULT,
} from './utils';

describe('escapeLikePattern', () => {
  it('escapes percent signs', () => {
    expect(escapeLikePattern('50% done')).toBe('50\\% done');
  });

  it('escapes underscores', () => {
    expect(escapeLikePattern('user_name')).toBe('user\\_name');
  });

  it('escapes backslashes', () => {
    expect(escapeLikePattern('path\\to\\file')).toBe('path\\\\to\\\\file');
  });

  it('escapes all special characters together', () => {
    expect(escapeLikePattern('50%_test\\path')).toBe('50\\%\\_test\\\\path');
  });

  it('returns empty string unchanged', () => {
    expect(escapeLikePattern('')).toBe('');
  });

  it('returns normal strings unchanged', () => {
    expect(escapeLikePattern('normal string')).toBe('normal string');
  });
});

describe('isValidDateString', () => {
  it('accepts valid ISO dates', () => {
    expect(isValidDateString('2024-01-15')).toBe(true);
    expect(isValidDateString('2025-12-31')).toBe(true);
    expect(isValidDateString('1999-06-01')).toBe(true);
  });

  it('rejects invalid formats', () => {
    expect(isValidDateString('01-15-2024')).toBe(false); // MM-DD-YYYY
    expect(isValidDateString('2024/01/15')).toBe(false); // slashes
    expect(isValidDateString('Jan 15, 2024')).toBe(false); // named month
    expect(isValidDateString('2024-1-15')).toBe(false); // single digit month
    expect(isValidDateString('2024-01-5')).toBe(false); // single digit day
  });

  it('rejects invalid dates', () => {
    expect(isValidDateString('2024-13-01')).toBe(false); // month 13
    // Note: JS Date auto-corrects Feb 30 to March 1, so this passes format check
    // The function validates format + parseable, not calendar correctness
    expect(isValidDateString('not-a-date')).toBe(false);
  });

  it('rejects empty strings', () => {
    expect(isValidDateString('')).toBe(false);
  });
});

describe('formatTokens', () => {
  it('formats quintillions', () => {
    expect(formatTokens(1.5e18)).toBe('1.5Qi');
  });

  it('formats quadrillions', () => {
    expect(formatTokens(2.3e15)).toBe('2.3Q');
  });

  it('formats trillions', () => {
    expect(formatTokens(1.2e12)).toBe('1.2T');
  });

  it('formats billions', () => {
    expect(formatTokens(5.5e9)).toBe('5.5B');
  });

  it('formats millions', () => {
    expect(formatTokens(2_500_000)).toBe('2.5M');
  });

  it('formats thousands', () => {
    expect(formatTokens(1500)).toBe('2K'); // rounds to nearest K
  });

  it('formats small numbers as-is', () => {
    expect(formatTokens(500)).toBe('500');
    expect(formatTokens(0)).toBe('0');
  });

  it('handles string input (PostgreSQL bigint)', () => {
    expect(formatTokens('5000000')).toBe('5.0M');
  });

  it('handles BigInt input', () => {
    expect(formatTokens(BigInt(2_000_000))).toBe('2.0M');
  });

  it('handles negative numbers', () => {
    expect(formatTokens(-1_000_000)).toBe('-1.0M');
  });

  it('handles NaN/Infinity', () => {
    expect(formatTokens(NaN)).toBe('0');
    expect(formatTokens(Infinity)).toBe('0');
  });

  it('caps extremely large values', () => {
    expect(formatTokens(1e22)).toBe('999Qi+');
  });
});

describe('formatCurrency', () => {
  it('formats billions', () => {
    expect(formatCurrency(2.5e9)).toBe('$2.5B');
  });

  it('formats millions', () => {
    expect(formatCurrency(1_500_000)).toBe('$1.5M');
  });

  it('formats thousands', () => {
    expect(formatCurrency(5000)).toBe('$5.0K');
  });

  it('formats small amounts with cents', () => {
    expect(formatCurrency(123.45)).toBe('$123.45');
    expect(formatCurrency(0)).toBe('$0.00');
    expect(formatCurrency(0.99)).toBe('$0.99');
  });

  it('handles string input', () => {
    expect(formatCurrency('1000000')).toBe('$1.0M');
  });

  it('handles BigInt input', () => {
    expect(formatCurrency(BigInt(5000))).toBe('$5.0K');
  });

  it('handles negative values', () => {
    expect(formatCurrency(-500)).toBe('-$500.00');
  });

  it('handles NaN/Infinity', () => {
    expect(formatCurrency(NaN)).toBe('$0.00');
  });
});

describe('formatDate', () => {
  it('formats dates as "Mon D" format', () => {
    expect(formatDate('2024-01-15')).toBe('Jan 15');
    expect(formatDate('2024-12-25')).toBe('Dec 25');
  });
});

describe('cn', () => {
  it('joins class names with space', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('filters out falsy values', () => {
    expect(cn('foo', false, 'bar', null, undefined)).toBe('foo bar');
  });

  it('handles conditional classes', () => {
    const isActive = true;
    const isDisabled = false;
    expect(cn('base', isActive && 'active', isDisabled && 'disabled')).toBe('base active');
  });

  it('returns empty string for no truthy values', () => {
    expect(cn(false, null, undefined)).toBe('');
  });
});

describe('normalizeModelName', () => {
  it('returns empty string unchanged', () => {
    // Empty string returns as-is (falsy check returns early)
    expect(normalizeModelName('')).toBe('');
  });

  it('normalizes default/auto/unknown to magic string', () => {
    expect(normalizeModelName('default')).toBe(MODEL_DEFAULT);
    expect(normalizeModelName('auto')).toBe(MODEL_DEFAULT);
    expect(normalizeModelName('unknown')).toBe(MODEL_DEFAULT);
    expect(normalizeModelName('Default')).toBe(MODEL_DEFAULT);
  });

  describe('full Anthropic model names', () => {
    it('normalizes claude-3-5-haiku-20241022', () => {
      expect(normalizeModelName('claude-3-5-haiku-20241022')).toBe('haiku-3.5');
    });

    it('normalizes claude-sonnet-4-20250514', () => {
      expect(normalizeModelName('claude-sonnet-4-20250514')).toBe('sonnet-4');
    });

    it('normalizes claude-opus-4-5-20251101', () => {
      expect(normalizeModelName('claude-opus-4-5-20251101')).toBe('opus-4.5');
    });
  });

  describe('short forms', () => {
    it('normalizes reversed patterns like 4-sonnet', () => {
      expect(normalizeModelName('4-sonnet')).toBe('sonnet-4');
      expect(normalizeModelName('4.5-opus')).toBe('opus-4.5');
    });

    it('normalizes claude prefixed short forms', () => {
      expect(normalizeModelName('claude-4-sonnet')).toBe('sonnet-4');
      expect(normalizeModelName('claude-4.5-opus')).toBe('opus-4.5');
    });
  });

  describe('thinking suffixes', () => {
    it('extracts (T) suffix', () => {
      expect(normalizeModelName('4-sonnet (T)')).toBe('sonnet-4 (T)');
      expect(normalizeModelName('sonnet-4 (thinking)')).toBe('sonnet-4 (T)');
    });

    it('extracts (HT) suffix from high-thinking', () => {
      expect(normalizeModelName('claude-4-sonnet-high-thinking')).toBe('sonnet-4 (HT)');
    });

    it('extracts (T) suffix from -thinking', () => {
      expect(normalizeModelName('claude-4-sonnet-thinking')).toBe('sonnet-4 (T)');
    });
  });

  describe('standalone version numbers', () => {
    it('defaults to sonnet for bare version numbers', () => {
      expect(normalizeModelName('4')).toBe('sonnet-4');
      expect(normalizeModelName('4.5')).toBe('sonnet-4.5');
    });
  });

  it('is case insensitive', () => {
    expect(normalizeModelName('CLAUDE-SONNET-4-20250514')).toBe('sonnet-4');
    expect(normalizeModelName('Claude-Opus-4-5-20251101')).toBe('opus-4.5');
  });

  it('trims whitespace', () => {
    expect(normalizeModelName('  sonnet-4  ')).toBe('sonnet-4');
  });
});

describe('formatModelName', () => {
  it('expands (T) to (Thinking)', () => {
    expect(formatModelName('sonnet-4 (T)')).toBe('Sonnet 4 (Thinking)');
  });

  it('capitalizes model family names', () => {
    expect(formatModelName('sonnet-4')).toBe('Sonnet 4');
    expect(formatModelName('opus-4.5')).toBe('Opus 4.5');
    expect(formatModelName('haiku-3.5')).toBe('Haiku 3.5');
  });

  it('removes claude- prefix', () => {
    expect(formatModelName('claude-sonnet-4')).toBe('Sonnet 4');
  });

  it('handles empty string', () => {
    expect(formatModelName('')).toBe('');
  });
});
