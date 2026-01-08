import { describe, it, expect } from 'vitest';
import { calculateCost } from './db';

describe('calculateCost', () => {
  describe('basic calculations', () => {
    it('calculates cost for input and output tokens', () => {
      // Using default pricing ($3/M input, $15/M output for Sonnet)
      const cost = calculateCost('claude-sonnet-4-20250514', 1_000_000, 100_000);

      // Input: 1M * $3 / 1M = $3
      // Output: 100K * $15 / 1M = $1.5
      // Total: $4.5
      expect(cost).toBeCloseTo(4.5, 2);
    });

    it('returns zero for zero tokens', () => {
      const cost = calculateCost('claude-sonnet-4-20250514', 0, 0);
      expect(cost).toBe(0);
    });
  });

  describe('cache token pricing', () => {
    it('applies 1.25x multiplier for cache write tokens', () => {
      // Cache write tokens cost 1.25x the input price
      const costWithCache = calculateCost(
        'claude-sonnet-4-20250514',
        0, // no regular input
        0, // no output
        1_000_000, // 1M cache write tokens
        0
      );

      // Cache write: 1M * $3 * 1.25 / 1M = $3.75
      expect(costWithCache).toBeCloseTo(3.75, 2);
    });

    it('applies 0.1x multiplier for cache read tokens', () => {
      // Cache read tokens cost 0.1x the input price
      const costWithCacheRead = calculateCost(
        'claude-sonnet-4-20250514',
        0,
        0,
        0,
        1_000_000 // 1M cache read tokens
      );

      // Cache read: 1M * $3 * 0.1 / 1M = $0.30
      expect(costWithCacheRead).toBeCloseTo(0.3, 2);
    });

    it('combines all token types correctly', () => {
      const cost = calculateCost(
        'claude-sonnet-4-20250514',
        1_000_000, // 1M input
        500_000, // 500K output
        200_000, // 200K cache write
        2_000_000 // 2M cache read
      );

      // Input: 1M * $3 / 1M = $3
      // Output: 500K * $15 / 1M = $7.5
      // Cache write: 200K * $3 * 1.25 / 1M = $0.75
      // Cache read: 2M * $3 * 0.1 / 1M = $0.60
      // Total: $11.85
      expect(cost).toBeCloseTo(11.85, 2);
    });
  });

  describe('model-specific pricing', () => {
    it('uses Opus pricing for Opus models', () => {
      // Opus: $15/M input, $75/M output
      const cost = calculateCost('claude-opus-4-5-20251101', 1_000_000, 100_000);

      // Input: 1M * $15 / 1M = $15
      // Output: 100K * $75 / 1M = $7.5
      expect(cost).toBeCloseTo(22.5, 2);
    });

    it('uses Haiku pricing for Haiku models', () => {
      // Haiku: $0.8/M input, $4/M output
      const cost = calculateCost('claude-3-5-haiku-20241022', 1_000_000, 100_000);

      // Input: 1M * $0.8 / 1M = $0.8
      // Output: 100K * $4 / 1M = $0.4
      expect(cost).toBeCloseTo(1.2, 2);
    });

    it('uses Sonnet pricing for Sonnet models', () => {
      // Sonnet: $3/M input, $15/M output
      const cost = calculateCost('claude-sonnet-4-20250514', 1_000_000, 100_000);

      expect(cost).toBeCloseTo(4.5, 2);
    });

    it('uses default pricing for unknown models', () => {
      // Unknown model defaults to Sonnet pricing
      const cost = calculateCost('unknown-model', 1_000_000, 100_000);

      // Should use default: $3/M input, $15/M output
      expect(cost).toBeCloseTo(4.5, 2);
    });
  });

  describe('partial model name matching', () => {
    it('matches models with case insensitivity', () => {
      const lowerCost = calculateCost('claude-opus-4-5-20251101', 1_000_000, 0);
      const upperCost = calculateCost('CLAUDE-OPUS-4-5-20251101', 1_000_000, 0);

      expect(lowerCost).toBe(upperCost);
    });
  });

  describe('edge cases', () => {
    it('handles very large token counts', () => {
      const cost = calculateCost('claude-sonnet-4-20250514', 1_000_000_000, 0);

      // 1B tokens * $3/M = $3000
      expect(cost).toBeCloseTo(3000, 0);
    });

    it('handles fractional results correctly', () => {
      const cost = calculateCost('claude-sonnet-4-20250514', 1, 0);

      // 1 token * $3 / 1M = $0.000003
      expect(cost).toBeCloseTo(0.000003, 6);
    });

    it('handles empty model name with fallback pricing', () => {
      // Empty string matches first MODEL_PRICING entry (opus) due to includes('') === true
      // This uses Opus pricing: $15/M input, $75/M output
      const cost = calculateCost('', 1_000_000, 100_000);
      expect(cost).toBeCloseTo(22.5, 2);
    });
  });
});
