'use client';

import { type ReactNode } from 'react';

type MarginSize = 'none' | 'sm' | 'md' | 'lg';

interface SectionLabelProps {
  /** Main label text */
  children: ReactNode;
  /** Optional time range in days to display as "(Nd)" */
  days?: number;
  /** Optional count to display after label */
  count?: number | string;
  /** Bottom margin: none, sm (mb-2), md (mb-3), lg (mb-4). Default: none */
  margin?: MarginSize;
  /** Additional CSS classes */
  className?: string;
  /** HTML element to render. Default: h3 */
  as?: 'h2' | 'h3' | 'p' | 'span';
}

const marginClasses: Record<MarginSize, string> = {
  none: '',
  sm: 'mb-2',
  md: 'mb-3',
  lg: 'mb-4',
};

/**
 * SectionLabel component for consistent section headers across the app.
 * Uses the standard mono font, uppercase, tracking-wider style.
 *
 * @example
 * // Basic label
 * <SectionLabel>Daily Usage</SectionLabel>
 *
 * // With days annotation
 * <SectionLabel days={30}>Daily Usage</SectionLabel>
 * // Renders: "Daily Usage (30d)"
 *
 * // With count
 * <SectionLabel count={1234}>Total Commits</SectionLabel>
 * // Renders: "Total Commits (1,234)"
 *
 * // With margin
 * <SectionLabel margin="lg">Model Distribution</SectionLabel>
 */
export function SectionLabel({
  children,
  days,
  count,
  margin = 'none',
  className = '',
  as: Component = 'h3',
}: SectionLabelProps) {
  const baseClasses = `font-mono text-xs uppercase tracking-wider text-white/60 ${marginClasses[margin]} ${className}`.trim();

  const formattedCount = typeof count === 'number' ? count.toLocaleString() : count;

  return (
    <Component className={baseClasses}>
      {children}
      {days !== undefined && (
        <span className="text-white/20"> ({days}d)</span>
      )}
      {count !== undefined && (
        <span className="text-white/30"> ({formattedCount})</span>
      )}
    </Component>
  );
}

/**
 * CardTitle - SectionLabel with default margin for use inside Cards
 * Convenience wrapper with margin="lg" default
 */
export function CardTitle(props: Omit<SectionLabelProps, 'margin'> & { margin?: MarginSize }) {
  return <SectionLabel margin="lg" {...props} />;
}
