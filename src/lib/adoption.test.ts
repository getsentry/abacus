import { describe, it, expect } from 'vitest';
import {
  calculateAdoptionScore,
  getAdoptionStage,
  getNextStage,
  getProgressToNextStage,
  isInactive,
  getTokensToNextStage,
  formatIntensity,
  INTENSITY_THRESHOLDS,
  INACTIVE_CONFIG,
  type AdoptionMetrics,
} from './adoption';

describe('adoption stages', () => {
  describe('getAdoptionStage', () => {
    it('returns exploring for zero days active', () => {
      const metrics: AdoptionMetrics = {
        totalTokens: 0,
        daysActive: 0,
        daysSinceLastActive: 0,
      };
      expect(getAdoptionStage(metrics)).toBe('exploring');
    });

    it('returns exploring for low intensity usage', () => {
      const metrics: AdoptionMetrics = {
        totalTokens: 100_000, // 100K tokens over 1 day = 100K/day
        daysActive: 1,
        daysSinceLastActive: 0,
      };
      expect(getAdoptionStage(metrics)).toBe('exploring');
    });

    it('returns building_momentum for moderate intensity with enough days', () => {
      const metrics: AdoptionMetrics = {
        totalTokens: 1_000_000, // 1M tokens over 2 days = 500K/day
        daysActive: 2,
        daysSinceLastActive: 0,
      };
      expect(getAdoptionStage(metrics)).toBe('building_momentum');
    });

    it('returns exploring if high intensity but not enough days for building_momentum', () => {
      const metrics: AdoptionMetrics = {
        totalTokens: 500_000, // 500K/day (above threshold)
        daysActive: 1, // but only 1 day (need 2 for building_momentum)
        daysSinceLastActive: 0,
      };
      expect(getAdoptionStage(metrics)).toBe('exploring');
    });

    it('returns in_flow for high intensity with enough days', () => {
      const metrics: AdoptionMetrics = {
        totalTokens: 6_000_000, // 6M tokens over 3 days = 2M/day
        daysActive: 3,
        daysSinceLastActive: 0,
      };
      expect(getAdoptionStage(metrics)).toBe('in_flow');
    });

    it('returns power_user for very high intensity with enough days', () => {
      const metrics: AdoptionMetrics = {
        totalTokens: 15_000_000, // 15M tokens over 3 days = 5M/day
        daysActive: 3,
        daysSinceLastActive: 0,
      };
      expect(getAdoptionStage(metrics)).toBe('power_user');
    });

    it('requires minimum days for higher stages even with high intensity', () => {
      const metrics: AdoptionMetrics = {
        totalTokens: 10_000_000, // 10M tokens over 2 days = 5M/day
        daysActive: 2, // only 2 days (need 3 for power_user AND in_flow)
        daysSinceLastActive: 0,
      };
      // Falls back to building_momentum (requires 2 days, which we meet)
      expect(getAdoptionStage(metrics)).toBe('building_momentum');
    });

    it('handles boundary values correctly', () => {
      // Exactly at building_momentum threshold
      const atThreshold: AdoptionMetrics = {
        totalTokens: INTENSITY_THRESHOLDS.building_momentum * 2,
        daysActive: 2,
        daysSinceLastActive: 0,
      };
      expect(getAdoptionStage(atThreshold)).toBe('building_momentum');

      // Just below threshold
      const belowThreshold: AdoptionMetrics = {
        totalTokens: (INTENSITY_THRESHOLDS.building_momentum - 1) * 2,
        daysActive: 2,
        daysSinceLastActive: 0,
      };
      expect(getAdoptionStage(belowThreshold)).toBe('exploring');
    });
  });

  describe('calculateAdoptionScore', () => {
    it('returns 0 for zero days active', () => {
      const metrics: AdoptionMetrics = {
        totalTokens: 1_000_000,
        daysActive: 0,
        daysSinceLastActive: 5,
      };
      expect(calculateAdoptionScore(metrics)).toBe(0);
    });

    it('returns higher score for higher intensity', () => {
      const lowIntensity: AdoptionMetrics = {
        totalTokens: 100_000,
        daysActive: 1,
        daysSinceLastActive: 0,
      };
      const highIntensity: AdoptionMetrics = {
        totalTokens: 5_000_000,
        daysActive: 1,
        daysSinceLastActive: 0,
      };

      const lowScore = calculateAdoptionScore(lowIntensity);
      const highScore = calculateAdoptionScore(highIntensity);

      expect(highScore).toBeGreaterThan(lowScore);
    });

    it('includes recency bonus for recent activity', () => {
      const recent: AdoptionMetrics = {
        totalTokens: 1_000_000,
        daysActive: 1,
        daysSinceLastActive: 0,
      };
      const notRecent: AdoptionMetrics = {
        totalTokens: 1_000_000,
        daysActive: 1,
        daysSinceLastActive: 14,
      };

      const recentScore = calculateAdoptionScore(recent);
      const notRecentScore = calculateAdoptionScore(notRecent);

      expect(recentScore).toBeGreaterThan(notRecentScore);
    });

    it('caps score at 100', () => {
      const extreme: AdoptionMetrics = {
        totalTokens: 100_000_000, // 100M/day
        daysActive: 1,
        daysSinceLastActive: 0,
      };
      expect(calculateAdoptionScore(extreme)).toBeLessThanOrEqual(100);
    });

    it('returns a rounded integer', () => {
      const metrics: AdoptionMetrics = {
        totalTokens: 1_234_567,
        daysActive: 3,
        daysSinceLastActive: 2,
      };
      const score = calculateAdoptionScore(metrics);
      expect(Number.isInteger(score)).toBe(true);
    });
  });

  describe('getNextStage', () => {
    it('returns building_momentum for exploring', () => {
      expect(getNextStage('exploring')).toBe('building_momentum');
    });

    it('returns in_flow for building_momentum', () => {
      expect(getNextStage('building_momentum')).toBe('in_flow');
    });

    it('returns power_user for in_flow', () => {
      expect(getNextStage('in_flow')).toBe('power_user');
    });

    it('returns null for power_user', () => {
      expect(getNextStage('power_user')).toBeNull();
    });
  });

  describe('getProgressToNextStage', () => {
    it('returns 0 for zero days active', () => {
      const metrics: AdoptionMetrics = {
        totalTokens: 0,
        daysActive: 0,
        daysSinceLastActive: 0,
      };
      expect(getProgressToNextStage(metrics)).toBe(0);
    });

    it('returns percentage progress toward next threshold', () => {
      // Halfway to building_momentum threshold
      const metrics: AdoptionMetrics = {
        totalTokens: INTENSITY_THRESHOLDS.building_momentum / 2,
        daysActive: 1,
        daysSinceLastActive: 0,
      };
      const progress = getProgressToNextStage(metrics);
      expect(progress).toBeCloseTo(50, 0);
    });

    it('caps progress at 100', () => {
      const metrics: AdoptionMetrics = {
        totalTokens: 50_000_000, // Way above power_user
        daysActive: 3,
        daysSinceLastActive: 0,
      };
      expect(getProgressToNextStage(metrics)).toBeLessThanOrEqual(100);
    });
  });

  describe('isInactive', () => {
    it('returns false for recent activity', () => {
      expect(isInactive(0)).toBe(false);
      expect(isInactive(15)).toBe(false);
      expect(isInactive(29)).toBe(false);
    });

    it('returns true at or above inactive threshold', () => {
      expect(isInactive(INACTIVE_CONFIG.thresholdDays)).toBe(true);
      expect(isInactive(31)).toBe(true);
      expect(isInactive(100)).toBe(true);
    });
  });

  describe('getTokensToNextStage', () => {
    it('returns building_momentum threshold for zero days active', () => {
      const metrics: AdoptionMetrics = {
        totalTokens: 0,
        daysActive: 0,
        daysSinceLastActive: 0,
      };
      expect(getTokensToNextStage(metrics)).toBe(INTENSITY_THRESHOLDS.building_momentum);
    });

    it('returns null for power_user', () => {
      const metrics: AdoptionMetrics = {
        totalTokens: 15_000_000,
        daysActive: 3,
        daysSinceLastActive: 0,
      };
      expect(getTokensToNextStage(metrics)).toBeNull();
    });

    it('returns positive value for tokens needed', () => {
      const metrics: AdoptionMetrics = {
        totalTokens: 100_000,
        daysActive: 1,
        daysSinceLastActive: 0,
      };
      const needed = getTokensToNextStage(metrics);
      expect(needed).toBeGreaterThan(0);
    });
  });

  describe('formatIntensity', () => {
    it('formats millions correctly', () => {
      expect(formatIntensity(2_100_000)).toBe('2.1M');
      expect(formatIntensity(1_000_000)).toBe('1.0M');
      expect(formatIntensity(5_500_000)).toBe('5.5M');
    });

    it('formats thousands correctly', () => {
      expect(formatIntensity(450_000)).toBe('450K');
      expect(formatIntensity(1_000)).toBe('1K');
      expect(formatIntensity(999_999)).toBe('1000K');
    });

    it('formats small numbers without suffix', () => {
      expect(formatIntensity(500)).toBe('500');
      expect(formatIntensity(0)).toBe('0');
      expect(formatIntensity(999)).toBe('999');
    });
  });
});
