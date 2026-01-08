'use client';

import { type ReactNode } from 'react';

export interface LegendItem {
  /** Unique key for this item */
  key: string;
  /** Display label */
  label: string;
  /** Value to display (already formatted) */
  value?: string;
  /** Optional percentage */
  percentage?: number;
  /** Tailwind text color class (e.g., 'text-amber-400') */
  textColor?: string;
  /** Tailwind background color class for dot (e.g., 'bg-amber-500') */
  dotColor?: string;
  /** Optional icon component */
  icon?: React.ComponentType<{ className?: string }>;
}

interface LegendProps {
  /** Items to display in legend */
  items: LegendItem[];
  /** Additional CSS classes */
  className?: string;
}

/**
 * Legend - Consistent horizontal legend for charts and distributions.
 * Uses text-xs font-mono for values, text-muted for labels.
 *
 * @example
 * // With dots
 * <Legend items={[
 *   { key: 'claude', label: 'Claude Code', value: '1.2M', dotColor: 'bg-amber-500', textColor: 'text-amber-400' },
 *   { key: 'cursor', label: 'Cursor', value: '500K', dotColor: 'bg-cyan-500', textColor: 'text-cyan-400' },
 * ]} />
 *
 * // With icons and percentages
 * <Legend items={[
 *   { key: 'exploring', label: 'Exploring', value: '25', percentage: 25, icon: Compass, textColor: 'text-slate-400' },
 * ]} />
 */
export function Legend({ items, className = '' }: LegendProps) {
  return (
    <div className={`flex flex-wrap gap-x-4 gap-y-1 ${className}`}>
      {items.map(item => (
        <LegendItemDisplay key={item.key} item={item} />
      ))}
    </div>
  );
}

function LegendItemDisplay({ item }: { item: LegendItem }) {
  const Icon = item.icon;

  return (
    <div className="flex items-center gap-1.5">
      {/* Dot or Icon */}
      {Icon ? (
        <Icon className={`w-3.5 h-3.5 ${item.textColor || 'text-muted'}`} />
      ) : item.dotColor ? (
        <div className={`w-2 h-2 rounded-full ${item.dotColor}`} />
      ) : null}

      {/* Label */}
      <span className={`font-mono text-xs ${item.textColor || 'text-muted'}`}>
        {item.label}
        {item.value && `: ${item.value}`}
      </span>

      {/* Percentage (if separate from value) */}
      {item.percentage !== undefined && !item.value?.includes('%') && (
        <span className="font-mono text-xs text-muted">
          ({Math.round(item.percentage)}%)
        </span>
      )}
    </div>
  );
}

/**
 * InlineLegend - Single-line legend typically used in chart headers.
 * Slightly more compact, used for summary totals.
 */
interface InlineLegendProps {
  items: LegendItem[];
  className?: string;
}

export function InlineLegend({ items, className = '' }: InlineLegendProps) {
  return (
    <div className={`flex gap-4 ${className}`}>
      {items.map(item => (
        <span key={item.key} className={`text-xs ${item.textColor || 'text-muted'}`}>
          {item.label}: <span className="font-mono">{item.value}</span>
        </span>
      ))}
    </div>
  );
}
