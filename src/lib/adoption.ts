// Adoption stage identification - helps understand user engagement levels
//
// Stages are based primarily on intensity (avg tokens per active day):
// - Power User: 3M+ tokens/day when active (AI is core to workflow)
// - In the Flow: 1M-3M tokens/day (heavy, regular usage)
// - Building Momentum: 250K-1M tokens/day (developing habits)
// - Exploring: <250K tokens/day (trying things out)
//
// Minimum activity thresholds prevent one-off heavy usage from inflating stage.
// "Ready to Return" is a separate overlay for 14+ days inactive.

export type AdoptionStage = 'exploring' | 'building_momentum' | 'in_flow' | 'power_user';

export interface AdoptionMetrics {
  totalTokens: number;
  daysActive: number;
  daysSinceLastActive: number;
}

export interface StageConfig {
  label: string;
  description: string;
  color: string;
  bgColor: string;
  borderColor: string;
  textColor: string;
  icon: 'compass' | 'flame' | 'zap' | 'star';
}

export const STAGE_CONFIG: Record<AdoptionStage, StageConfig> = {
  exploring: {
    label: 'Exploring',
    description: 'Just getting started with AI tools',
    color: 'slate',
    bgColor: 'bg-slate-500/10',
    borderColor: 'border-slate-500/20',
    textColor: 'text-slate-400',
    icon: 'compass',
  },
  building_momentum: {
    label: 'Building Momentum',
    description: 'Building consistent habits',
    color: 'amber',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/20',
    textColor: 'text-amber-400',
    icon: 'flame',
  },
  in_flow: {
    label: 'In the Flow',
    description: 'Regular, engaged usage',
    color: 'cyan',
    bgColor: 'bg-cyan-500/10',
    borderColor: 'border-cyan-500/20',
    textColor: 'text-cyan-400',
    icon: 'zap',
  },
  power_user: {
    label: 'Power User',
    description: 'Heavy, sophisticated usage',
    color: 'emerald',
    bgColor: 'bg-emerald-500/10',
    borderColor: 'border-emerald-500/20',
    textColor: 'text-emerald-400',
    icon: 'star',
  },
};

// Ordered stages for progression display
export const STAGE_ORDER: AdoptionStage[] = ['exploring', 'building_momentum', 'in_flow', 'power_user'];

// Inactive state for users with no recent activity
export const INACTIVE_CONFIG = {
  label: 'Inactive',
  description: 'No recent activity',
  color: 'zinc',
  bgColor: 'bg-zinc-500/10',
  borderColor: 'border-zinc-500/20',
  textColor: 'text-zinc-400',
  icon: 'pause' as const,
  thresholdDays: 30, // Days of inactivity before considered inactive
};

// Stage guidance content - what defines each level and what's expected
export interface StageGuidance {
  headline: string;        // Third-person headline (for viewing others)
  description: string;     // What this stage means
  traits: string[];        // What people at this level typically do
  suggestion: string;      // One actionable suggestion
}

export const STAGE_GUIDANCE: Record<AdoptionStage, StageGuidance> = {
  exploring: {
    headline: "Getting started",
    description: "Early stages of AI tool exploration",
    traits: [
      "Trying out AI for specific tasks",
      "Building familiarity with prompting",
      "Starting with low-risk use cases",
    ],
    suggestion: "Try asking AI to explain unfamiliar code or write tests",
  },
  building_momentum: {
    headline: "Building momentum",
    description: "Developing consistent AI-assisted habits",
    traits: [
      "Using AI regularly for coding tasks",
      "Experimenting with different models",
      "Finding what works for their workflow",
    ],
    suggestion: "Try using AI for code reviews before submitting PRs",
  },
  in_flow: {
    headline: "In the flow",
    description: "AI is a natural part of their workflow",
    traits: [
      "AI-first approach to many tasks",
      "Comfortable with advanced features",
      "Starting to develop personal best practices",
    ],
    suggestion: "Consider sharing workflow tips with teammates",
  },
  power_user: {
    headline: "Power User",
    description: "AI is core to how they work",
    traits: [
      "Heavy, sophisticated usage patterns",
      "Deep familiarity with AI capabilities",
      "Natural resource for teammates",
    ],
    suggestion: "Help onboard others or share your workflow",
  },
};

// Intensity thresholds (tokens per active day)
export const INTENSITY_THRESHOLDS = {
  power_user: 3_000_000,      // 3M+ tokens/day when active
  in_flow: 1_000_000,       // 1M-3M tokens/day
  building_momentum: 250_000, // 250K-1M tokens/day
  // exploring: below 250K
};

// Minimum days active to qualify for each stage (prevents one-off inflation)
const MIN_DAYS_ACTIVE = {
  power_user: 3,
  in_flow: 3,
  building_momentum: 2,
  exploring: 0,
};

/**
 * Calculate adoption score (0-100) based on intensity (avg tokens per active day)
 *
 * Score is primarily based on avgTokensPerDay with recency as a modifier.
 * This represents "when you use AI, how heavily do you use it?"
 */
export function calculateAdoptionScore(metrics: AdoptionMetrics): number {
  if (metrics.daysActive === 0) {
    return 0;
  }

  const avgTokensPerDay = metrics.totalTokens / metrics.daysActive;

  // Intensity score (0-80 points) - logarithmic scale centered around thresholds
  // 250K = ~40pts, 1M = ~55pts, 3M = ~70pts, 5M+ = ~80pts
  let intensityScore = 0;
  if (avgTokensPerDay > 0) {
    // Log scale: log10(250K) ≈ 5.4, log10(1M) ≈ 6, log10(3M) ≈ 6.5, log10(10M) ≈ 7
    // Map to 0-80 range
    intensityScore = Math.max(0, (Math.log10(avgTokensPerDay) - 4) * 26.67);
    intensityScore = Math.min(80, intensityScore);
  }

  // Recency score (0-20 points)
  // Full points for active today/yesterday, decays over 14 days
  const recencyScore = Math.max(0, 20 - (metrics.daysSinceLastActive * (20 / 14)));

  return Math.round(Math.min(100, Math.max(0, intensityScore + recencyScore)));
}

/**
 * Get adoption stage based on intensity (avg tokens per active day) and activity
 *
 * Stage is determined by avgTokensPerDay thresholds, with minimum days active
 * to prevent one-off heavy usage from inflating stage.
 */
export function getAdoptionStage(metrics: AdoptionMetrics): AdoptionStage {
  if (metrics.daysActive === 0) {
    return 'exploring';
  }

  const avgTokensPerDay = metrics.totalTokens / metrics.daysActive;

  // Check each stage from highest to lowest
  if (avgTokensPerDay >= INTENSITY_THRESHOLDS.power_user && metrics.daysActive >= MIN_DAYS_ACTIVE.power_user) {
    return 'power_user';
  }
  if (avgTokensPerDay >= INTENSITY_THRESHOLDS.in_flow && metrics.daysActive >= MIN_DAYS_ACTIVE.in_flow) {
    return 'in_flow';
  }
  if (avgTokensPerDay >= INTENSITY_THRESHOLDS.building_momentum && metrics.daysActive >= MIN_DAYS_ACTIVE.building_momentum) {
    return 'building_momentum';
  }

  return 'exploring';
}

/**
 * Get the next stage in progression (or null if at power_user)
 */
export function getNextStage(currentStage: AdoptionStage): AdoptionStage | null {
  const currentIndex = STAGE_ORDER.indexOf(currentStage);
  if (currentIndex < STAGE_ORDER.length - 1) {
    return STAGE_ORDER[currentIndex + 1];
  }
  return null;
}

/**
 * Calculate progress percentage to the next stage based on intensity
 */
export function getProgressToNextStage(metrics: AdoptionMetrics): number {
  if (metrics.daysActive === 0) {
    return 0;
  }

  const avgTokensPerDay = metrics.totalTokens / metrics.daysActive;
  const stage = getAdoptionStage(metrics);
  const nextStage = getNextStage(stage);

  // Threshold lookup (exploring has 0 threshold)
  const thresholds: Record<AdoptionStage, number> = {
    exploring: 0,
    building_momentum: INTENSITY_THRESHOLDS.building_momentum,
    in_flow: INTENSITY_THRESHOLDS.in_flow,
    power_user: INTENSITY_THRESHOLDS.power_user,
  };

  if (!nextStage) {
    // Already at power_user, show progress toward 10M (arbitrary "max")
    const progress = (avgTokensPerDay - thresholds.power_user) / (10_000_000 - thresholds.power_user);
    return Math.min(100, Math.max(0, progress * 100));
  }

  const currentThreshold = thresholds[stage];
  const nextThreshold = thresholds[nextStage];
  const range = nextThreshold - currentThreshold;
  const progress = avgTokensPerDay - currentThreshold;

  return Math.min(100, Math.max(0, (progress / range) * 100));
}

/**
 * Check if user is inactive (30+ days since last activity)
 */
export function isInactive(daysSinceLastActive: number): boolean {
  return daysSinceLastActive >= INACTIVE_CONFIG.thresholdDays;
}

/**
 * Get stage guidance content
 */
export function getStageGuidance(stage: AdoptionStage): StageGuidance {
  return STAGE_GUIDANCE[stage];
}

/**
 * Get tokens/day needed to reach next stage (or null if at power_user)
 */
export function getTokensToNextStage(metrics: AdoptionMetrics): number | null {
  if (metrics.daysActive === 0) {
    return INTENSITY_THRESHOLDS.building_momentum;
  }

  const avgTokensPerDay = metrics.totalTokens / metrics.daysActive;
  const stage = getAdoptionStage(metrics);
  const nextStage = getNextStage(stage);

  if (!nextStage) {
    return null; // Already at power_user
  }

  // Type-safe threshold lookup (exploring is never a next stage)
  const thresholdMap: Record<AdoptionStage, number> = {
    exploring: 0,
    building_momentum: INTENSITY_THRESHOLDS.building_momentum,
    in_flow: INTENSITY_THRESHOLDS.in_flow,
    power_user: INTENSITY_THRESHOLDS.power_user,
  };

  const nextThreshold = thresholdMap[nextStage];
  const needed = nextThreshold - avgTokensPerDay;

  return Math.max(0, needed);
}

/**
 * Format intensity (avg tokens per day) for display
 * e.g., 2100000 -> "2.1M", 450000 -> "450K"
 */
export function formatIntensity(avgTokensPerDay: number): string {
  if (avgTokensPerDay >= 1_000_000) {
    return `${(avgTokensPerDay / 1_000_000).toFixed(1)}M`;
  }
  if (avgTokensPerDay >= 1_000) {
    return `${Math.round(avgTokensPerDay / 1_000)}K`;
  }
  return String(Math.round(avgTokensPerDay));
}
