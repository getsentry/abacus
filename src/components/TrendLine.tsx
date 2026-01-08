'use client';

import { useMemo } from 'react';
import { linearRegression } from '@/lib/utils';

interface TrendLineProps {
  /** Array of Y values (one per data point) */
  values: number[];
  /** Maximum Y value for scaling (typically the chart's maxValue) */
  maxValue: number;
  /** Whether to show the line (allows conditional rendering) */
  show?: boolean;
}

/**
 * SVG overlay that draws a linear regression trend line
 * Only calculates trend from the first non-zero value to avoid
 * skewing results when early periods have no data
 */
export function TrendLine({
  values,
  maxValue,
  show = true,
}: TrendLineProps) {
  const { startX, startY, endY } = useMemo(() => {
    // Find first non-zero index to skip leading empty periods
    const firstNonZeroIndex = values.findIndex(v => v > 0);
    if (firstNonZeroIndex === -1) {
      return { startX: 0, startY: 0, endY: 0 };
    }

    // Only calculate regression on values from first non-zero onwards
    const activeValues = values.slice(firstNonZeroIndex);
    if (activeValues.length < 2) {
      return { startX: 0, startY: 0, endY: 0 };
    }

    const { predictions } = linearRegression(activeValues);

    // Calculate X position as percentage of total width
    const startXPct = (firstNonZeroIndex / (values.length - 1)) * 100;
    const startYPct = 100 - (Math.max(0, predictions[0]) / maxValue) * 100;
    const endYPct = 100 - (Math.max(0, predictions[predictions.length - 1]) / maxValue) * 100;

    return { startX: startXPct, startY: startYPct, endY: endYPct };
  }, [values, maxValue]);

  if (!show || values.length < 2 || maxValue === 0 || values.every(v => v === 0)) {
    return null;
  }

  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      <line
        x1={startX}
        y1={startY}
        x2={100}
        y2={endY}
        stroke="rgba(255, 255, 255, 0.5)"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
