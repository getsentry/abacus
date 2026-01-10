import { describe, it, expect } from 'vitest';
import {
  getAdoptionStage,
  calculateAdoptionScore,
  getNextStage,
  getProgressToNextStage,
  isInactive,
  formatIntensity,
  INTENSITY_THRESHOLDS,
  STAGE_ORDER,
} from '@/lib/adoption';

describe('getAdoptionStage', () => {
  it('returns exploring for zero activity', () => {
    expect(getAdoptionStage({ totalTokens: 0, daysActive: 0, daysSinceLastActive: 0 })).toBe(
      'exploring'
    );
  });

  it('returns exploring for low intensity', () => {
    // Below 250K tokens/day
    expect(
      getAdoptionStage({ totalTokens: 100_000, daysActive: 1, daysSinceLastActive: 0 })
    ).toBe('exploring');
    expect(
      getAdoptionStage({ totalTokens: 400_000, daysActive: 2, daysSinceLastActive: 0 })
    ).toBe('exploring'); // 200K/day
  });

  it('returns building_momentum for moderate intensity with min days', () => {
    // 250K-1M tokens/day, at least 2 days active
    expect(
      getAdoptionStage({ totalTokens: 600_000, daysActive: 2, daysSinceLastActive: 0 })
    ).toBe('building_momentum'); // 300K/day
    expect(
      getAdoptionStage({ totalTokens: 1_500_000, daysActive: 2, daysSinceLastActive: 0 })
    ).toBe('building_momentum'); // 750K/day
  });

  it('returns in_flow for high intensity with min days', () => {
    // 1M-3M tokens/day, at least 3 days active
    expect(
      getAdoptionStage({ totalTokens: 5_000_000, daysActive: 3, daysSinceLastActive: 0 })
    ).toBe('in_flow'); // 1.67M/day
    expect(
      getAdoptionStage({ totalTokens: 8_000_000, daysActive: 3, daysSinceLastActive: 0 })
    ).toBe('in_flow'); // 2.67M/day
  });

  it('returns power_user for very high intensity with min days', () => {
    // 3M+ tokens/day, at least 3 days active
    expect(
      getAdoptionStage({ totalTokens: 15_000_000, daysActive: 3, daysSinceLastActive: 0 })
    ).toBe('power_user'); // 5M/day
    expect(
      getAdoptionStage({ totalTokens: 30_000_000, daysActive: 5, daysSinceLastActive: 0 })
    ).toBe('power_user'); // 6M/day
  });

  it('respects minimum days active requirement', () => {
    // High intensity but only 1 day - building_momentum requires 2 days, so stays at exploring
    expect(
      getAdoptionStage({ totalTokens: 10_000_000, daysActive: 1, daysSinceLastActive: 0 })
    ).toBe('exploring');

    // High intensity but only 2 days - should be building_momentum (in_flow needs 3)
    expect(
      getAdoptionStage({ totalTokens: 6_000_000, daysActive: 2, daysSinceLastActive: 0 })
    ).toBe('building_momentum');
  });

  it('is not affected by days since last active', () => {
    // Stage is based on intensity, not recency
    expect(
      getAdoptionStage({ totalTokens: 15_000_000, daysActive: 3, daysSinceLastActive: 30 })
    ).toBe('power_user');
  });
});

describe('calculateAdoptionScore', () => {
  it('returns 0 for zero activity', () => {
    expect(calculateAdoptionScore({ totalTokens: 0, daysActive: 0, daysSinceLastActive: 0 })).toBe(
      0
    );
  });

  it('returns higher scores for higher intensity', () => {
    const lowIntensity = calculateAdoptionScore({
      totalTokens: 100_000,
      daysActive: 1,
      daysSinceLastActive: 0,
    });
    const highIntensity = calculateAdoptionScore({
      totalTokens: 5_000_000,
      daysActive: 1,
      daysSinceLastActive: 0,
    });
    expect(highIntensity).toBeGreaterThan(lowIntensity);
  });

  it('includes recency bonus', () => {
    const recent = calculateAdoptionScore({
      totalTokens: 1_000_000,
      daysActive: 1,
      daysSinceLastActive: 0,
    });
    const old = calculateAdoptionScore({
      totalTokens: 1_000_000,
      daysActive: 1,
      daysSinceLastActive: 14,
    });
    expect(recent).toBeGreaterThan(old);
  });

  it('returns score between 0 and 100', () => {
    const score = calculateAdoptionScore({
      totalTokens: 100_000_000,
      daysActive: 10,
      daysSinceLastActive: 0,
    });
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});

describe('getNextStage', () => {
  it('returns next stage in progression', () => {
    expect(getNextStage('exploring')).toBe('building_momentum');
    expect(getNextStage('building_momentum')).toBe('in_flow');
    expect(getNextStage('in_flow')).toBe('power_user');
  });

  it('returns null for power_user', () => {
    expect(getNextStage('power_user')).toBeNull();
  });
});

describe('getProgressToNextStage', () => {
  it('returns 0 for zero activity', () => {
    expect(
      getProgressToNextStage({ totalTokens: 0, daysActive: 0, daysSinceLastActive: 0 })
    ).toBe(0);
  });

  it('returns progress percentage within stage', () => {
    // At exploring, progress to building_momentum (250K threshold)
    const progress = getProgressToNextStage({
      totalTokens: 125_000,
      daysActive: 1,
      daysSinceLastActive: 0,
    });
    expect(progress).toBeGreaterThan(0);
    expect(progress).toBeLessThan(100);
  });

  it('returns bounded values', () => {
    const progress = getProgressToNextStage({
      totalTokens: 500_000,
      daysActive: 1,
      daysSinceLastActive: 0,
    });
    expect(progress).toBeGreaterThanOrEqual(0);
    expect(progress).toBeLessThanOrEqual(100);
  });
});

describe('isInactive', () => {
  it('returns false for recent activity', () => {
    expect(isInactive(0)).toBe(false);
    expect(isInactive(15)).toBe(false);
    expect(isInactive(29)).toBe(false);
  });

  it('returns true for 30+ days inactive', () => {
    expect(isInactive(30)).toBe(true);
    expect(isInactive(60)).toBe(true);
    expect(isInactive(365)).toBe(true);
  });
});

describe('formatIntensity', () => {
  it('formats millions with M suffix', () => {
    expect(formatIntensity(2_100_000)).toBe('2.1M');
    expect(formatIntensity(1_000_000)).toBe('1.0M');
  });

  it('formats thousands with K suffix', () => {
    expect(formatIntensity(450_000)).toBe('450K');
    expect(formatIntensity(1_000)).toBe('1K');
  });

  it('formats small numbers without suffix', () => {
    expect(formatIntensity(500)).toBe('500');
    expect(formatIntensity(0)).toBe('0');
  });
});

describe('INTENSITY_THRESHOLDS', () => {
  it('has correct threshold values', () => {
    expect(INTENSITY_THRESHOLDS.power_user).toBe(3_000_000);
    expect(INTENSITY_THRESHOLDS.in_flow).toBe(1_000_000);
    expect(INTENSITY_THRESHOLDS.building_momentum).toBe(250_000);
  });

  it('thresholds are in descending order', () => {
    expect(INTENSITY_THRESHOLDS.power_user).toBeGreaterThan(INTENSITY_THRESHOLDS.in_flow);
    expect(INTENSITY_THRESHOLDS.in_flow).toBeGreaterThan(INTENSITY_THRESHOLDS.building_momentum);
  });
});

describe('STAGE_ORDER', () => {
  it('has stages in correct progression order', () => {
    expect(STAGE_ORDER).toEqual(['exploring', 'building_momentum', 'in_flow', 'power_user']);
  });
});
