/** Magic string for unknown/default/auto model selections */
export const MODEL_DEFAULT = '(default)';

/**
 * Escape special characters in a string for use in SQL LIKE patterns.
 * Prevents users from injecting wildcards like % or _ to match unintended data.
 */
export function escapeLikePattern(input: string): string {
  return input
    .replace(/\\/g, '\\\\')  // Escape backslashes first
    .replace(/%/g, '\\%')    // Escape percent signs
    .replace(/_/g, '\\_');   // Escape underscores
}

/**
 * Validate that a string is a valid ISO date (YYYY-MM-DD format).
 * Returns true if valid, false otherwise.
 */
export function isValidDateString(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return false;
  }
  const date = new Date(dateStr);
  return !isNaN(date.getTime());
}

export function formatTokens(n: number | bigint | string): string {
  // Convert string (from PostgreSQL bigint) or BigInt to Number
  const num = typeof n === 'string' ? parseFloat(n) :
              typeof n === 'bigint' ? Number(n) : n;

  // Handle invalid/NaN values
  if (!Number.isFinite(num)) return '0';

  const absN = Math.abs(num);
  const sign = num < 0 ? '-' : '';

  // For extremely large values, cap at quintillions
  if (absN >= 1e21) {
    return `${sign}999Qi+`;
  }

  if (absN >= 1e18) return `${sign}${(absN / 1e18).toFixed(1)}Qi`;   // Quintillion
  if (absN >= 1e15) return `${sign}${(absN / 1e15).toFixed(1)}Q`;    // Quadrillion
  if (absN >= 1e12) return `${sign}${(absN / 1e12).toFixed(1)}T`;    // Trillion
  if (absN >= 1e9) return `${sign}${(absN / 1e9).toFixed(1)}B`;      // Billion
  if (absN >= 1e6) return `${sign}${(absN / 1e6).toFixed(1)}M`;      // Million
  if (absN >= 1e3) return `${sign}${(absN / 1e3).toFixed(0)}K`;      // Thousand
  return num.toString();
}

export function formatCurrency(n: number | bigint | string): string {
  // Convert string (from PostgreSQL bigint) or BigInt to Number
  const num = typeof n === 'string' ? parseFloat(n) :
              typeof n === 'bigint' ? Number(n) : n;

  if (!Number.isFinite(num)) return '$0.00';

  const absN = Math.abs(num);
  const sign = num < 0 ? '-' : '';

  if (absN >= 1e9) return `${sign}$${(absN / 1e9).toFixed(1)}B`;
  if (absN >= 1e6) return `${sign}$${(absN / 1e6).toFixed(1)}M`;
  if (absN >= 1e3) return `${sign}$${(absN / 1e3).toFixed(1)}K`;
  return `${sign}$${absN.toFixed(2)}`;
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

/**
 * Normalize model name to canonical form at write-time.
 * Target format: "{family}-{version}" e.g., "sonnet-4", "haiku-3.5", "opus-4.5"
 *
 * Handles:
 * - Full Anthropic names: "claude-3-5-haiku-20241022" → "haiku-3.5"
 * - Reversed short forms: "4-sonnet" → "sonnet-4"
 * - Suffixes: "4-sonnet (T)" → "sonnet-4 (T)"
 */
export function normalizeModelName(model: string): string {
  if (!model) return model;

  let normalized = model.trim().toLowerCase();

  // Normalize default/auto/unknown to standard magic string
  if (['default', 'auto', 'unknown', ''].includes(normalized)) {
    return MODEL_DEFAULT;
  }

  // Extract suffix like (T) or (Thinking) if present
  const suffixMatch = normalized.match(/\s*\(([^)]+)\)\s*$/);
  let suffix = '';
  if (suffixMatch) {
    suffix = suffixMatch[1];
    normalized = normalized.replace(suffixMatch[0], '').trim();
    // Normalize suffix
    if (suffix.toLowerCase() === 'thinking') suffix = 'T';
    suffix = suffix.toUpperCase();
  }

  // Handle full Anthropic model names with dates
  // "claude-3-5-haiku-20241022" → "haiku-3.5"
  let match = normalized.match(/^claude-(\d+)-(\d+)-([a-z]+)-\d{8}$/);
  if (match) {
    normalized = `${match[3]}-${match[1]}.${match[2]}`;
  }

  // "claude-sonnet-4-20250514" → "sonnet-4"
  if (!match) {
    match = normalized.match(/^claude-([a-z]+)-(\d+)-\d{8}$/);
    if (match) {
      normalized = `${match[1]}-${match[2]}`;
    }
  }

  // "claude-opus-4-5-20251101" → "opus-4.5"
  if (!match) {
    match = normalized.match(/^claude-([a-z]+)-(\d+)-(\d+)-\d{8}$/);
    if (match) {
      normalized = `${match[1]}-${match[2]}.${match[3]}`;
    }
  }

  // Handle without claude- prefix: "3-5-haiku-20241022" → "haiku-3.5"
  if (!match) {
    match = normalized.match(/^(\d+)-(\d+)-([a-z]+)-\d{8}$/);
    if (match) {
      normalized = `${match[3]}-${match[1]}.${match[2]}`;
    }
  }

  // "claude-4-sonnet-high-thinking" → "sonnet-4" with suffix HT
  if (!match) {
    match = normalized.match(/^claude-(\d+(?:\.\d+)?)-([a-z]+)-high-thinking$/);
    if (match) {
      normalized = `${match[2]}-${match[1]}`;
      suffix = 'HT';
    }
  }

  // "claude-4-sonnet-thinking" → "sonnet-4" with suffix T
  if (!match) {
    match = normalized.match(/^claude-(\d+(?:\.\d+)?)-([a-z]+)-thinking$/);
    if (match) {
      normalized = `${match[2]}-${match[1]}`;
      suffix = 'T';
    }
  }

  // "claude-4-sonnet" or "claude-4.5-opus" → "sonnet-4" or "opus-4.5"
  if (!match) {
    match = normalized.match(/^claude-(\d+(?:\.\d+)?)-([a-z]+)$/);
    if (match) {
      normalized = `${match[2]}-${match[1]}`;
    }
  }

  // Handle reversed patterns: "4-sonnet" → "sonnet-4", "4.5-opus" → "opus-4.5"
  if (!match) {
    match = normalized.match(/^(\d+(?:\.\d+)?)-([a-z]+)$/);
    if (match) {
      normalized = `${match[2]}-${match[1]}`;
    }
  }

  // Handle standalone version numbers: "4" → "sonnet-4"
  if (normalized.match(/^\d+(\.\d+)?$/)) {
    normalized = `sonnet-${normalized}`;
  }

  // Reconstruct with suffix if present
  if (suffix) {
    normalized = `${normalized} (${suffix})`;
  }

  return normalized;
}

/**
 * Format model name for display (human-readable).
 * Expands abbreviations: "(T)" → "(Thinking)"
 */
export function formatModelName(model: string): string {
  if (!model) return model;

  // Expand (T) to (Thinking)
  let display = model.replace(/\s*\(T\)\s*$/, ' (Thinking)');

  // Clean up claude- prefix for shorter display
  display = display.replace(/^claude-/, '');

  // Format version separators nicely: "sonnet-4" → "Sonnet 4"
  // Only capitalize known model families
  const families = ['sonnet', 'opus', 'haiku'];
  for (const family of families) {
    const regex = new RegExp(`^${family}[- ]?(\\d+(?:\\.\\d+)?)`, 'i');
    const match = display.match(regex);
    if (match) {
      const version = match[1];
      const rest = display.slice(match[0].length);
      display = `${family.charAt(0).toUpperCase()}${family.slice(1)} ${version}${rest}`;
      break;
    }
  }

  return display;
}
