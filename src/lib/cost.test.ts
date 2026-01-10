import { describe, it, expect } from 'vitest';
import { calculateCost } from '@/lib/db';

describe('calculateCost', () => {
  describe('with known model pricing', () => {
    it('calculates cost for claude-sonnet-4 (input/output)', () => {
      // Sonnet: $3/1M input, $15/1M output
      const cost = calculateCost('claude-sonnet-4-20250514', 1_000_000, 100_000, 0, 0);
      // 1M input * $3/1M + 100K output * $15/1M = $3 + $1.5 = $4.5
      expect(cost).toBeCloseTo(4.5);
    });

    it('calculates cost for claude-opus-4-5 (higher pricing)', () => {
      // Opus: $15/1M input, $75/1M output
      const cost = calculateCost('claude-opus-4-5-20251101', 1_000_000, 100_000, 0, 0);
      // 1M input * $15/1M + 100K output * $75/1M = $15 + $7.5 = $22.5
      expect(cost).toBeCloseTo(22.5);
    });

    it('calculates cost for claude-3-5-haiku (lower pricing)', () => {
      // Haiku: $0.8/1M input, $4/1M output
      const cost = calculateCost('claude-3-5-haiku-20241022', 1_000_000, 100_000, 0, 0);
      // 1M input * $0.8/1M + 100K output * $4/1M = $0.8 + $0.4 = $1.2
      expect(cost).toBeCloseTo(1.2);
    });
  });

  describe('with cache tokens', () => {
    it('applies 1.25x multiplier for cache write tokens', () => {
      // Sonnet: $3/1M input base
      // Cache write = $3 * 1.25 = $3.75/1M
      const cost = calculateCost('claude-sonnet-4-20250514', 0, 0, 1_000_000, 0);
      expect(cost).toBeCloseTo(3.75);
    });

    it('applies 0.1x multiplier for cache read tokens', () => {
      // Sonnet: $3/1M input base
      // Cache read = $3 * 0.1 = $0.3/1M
      const cost = calculateCost('claude-sonnet-4-20250514', 0, 0, 0, 1_000_000);
      expect(cost).toBeCloseTo(0.3);
    });

    it('calculates combined cost with all token types', () => {
      // 500K input + 100K output + 200K cache write + 1M cache read
      // Input: 500K * $3/1M = $1.5
      // Output: 100K * $15/1M = $1.5
      // Cache write: 200K * $3.75/1M = $0.75
      // Cache read: 1M * $0.3/1M = $0.3
      // Total: $4.05
      const cost = calculateCost('claude-sonnet-4-20250514', 500_000, 100_000, 200_000, 1_000_000);
      expect(cost).toBeCloseTo(4.05);
    });
  });

  describe('with unknown models', () => {
    it('uses default pricing (sonnet rates) for unknown models', () => {
      // Default: $3/1M input, $15/1M output (same as sonnet)
      const cost = calculateCost('unknown-model-xyz', 1_000_000, 100_000, 0, 0);
      expect(cost).toBeCloseTo(4.5);
    });

    it('handles partial model name matches', () => {
      // Should match claude-sonnet-4 pricing
      const cost = calculateCost('sonnet-4', 1_000_000, 100_000, 0, 0);
      expect(cost).toBeCloseTo(4.5);
    });
  });

  describe('edge cases', () => {
    it('returns 0 for zero tokens', () => {
      expect(calculateCost('claude-sonnet-4-20250514', 0, 0, 0, 0)).toBe(0);
    });

    it('handles very large token counts', () => {
      // 1 billion tokens
      const cost = calculateCost('claude-sonnet-4-20250514', 1_000_000_000, 0, 0, 0);
      expect(cost).toBeCloseTo(3000); // 1B * $3/1M = $3000
    });

    it('handles default cache token parameters', () => {
      // Should work without providing cache tokens
      const cost = calculateCost('claude-sonnet-4-20250514', 1_000_000, 100_000);
      expect(cost).toBeCloseTo(4.5);
    });
  });
});
