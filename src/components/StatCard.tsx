'use client';

import { motion } from 'framer-motion';
import { type LucideIcon } from 'lucide-react';
import { type ReactNode } from 'react';
import { SectionLabel } from './SectionLabel';

interface StatCardProps {
  /** Card label/title */
  label: string;
  /** Optional time range to display after label */
  days?: number;
  /** Main value to display */
  value: string;
  /** Optional suffix after value (e.g., "/100", "users") */
  suffix?: string;
  /** Optional sub-value text below the main value */
  subValue?: string;
  /** Optional trend percentage */
  trend?: number;
  /** Accent color - used for left bar or icon */
  accentColor?: string;
  /** Optional icon to show next to label */
  icon?: LucideIcon;
  /** Animation delay */
  delay?: number;
  /** Optional custom children to render below the value */
  children?: ReactNode;
}

export function StatCard({
  label,
  days,
  value,
  suffix,
  subValue,
  trend,
  accentColor = '#f59e0b',
  icon: Icon,
  delay = 0,
  children,
}: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      className="relative overflow-hidden rounded-lg border border-white/5 bg-white/[0.02] p-5"
    >
      {/* Left accent bar - only show if no icon */}
      {!Icon && (
        <div
          className="absolute left-0 top-0 h-full w-1"
          style={{ backgroundColor: accentColor }}
        />
      )}

      {/* Corner gradient decoration - only show if icon provided */}
      {Icon && (
        <div
          className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl to-transparent"
          style={{ background: `linear-gradient(to bottom left, ${accentColor}08, transparent)` }}
        />
      )}

      <div className="relative">
        {/* Label row with optional icon */}
        <div className={`flex items-center gap-2 ${Icon ? 'mb-3' : ''}`}>
          {Icon && <Icon className="w-4 h-4" style={{ color: accentColor }} />}
          <SectionLabel days={days}>{label}</SectionLabel>
        </div>

        {/* Value row */}
        <div className={`flex items-baseline gap-2 ${!Icon ? 'mt-2' : ''}`}>
          <span className="font-display text-3xl font-light tracking-tight text-white">
            {value}
          </span>
          {suffix && (
            <span className="font-mono text-sm text-muted">{suffix}</span>
          )}
        </div>

        {/* Sub-value and trend row */}
        {(subValue || trend !== undefined) && (
          <div className="mt-2 flex items-center gap-3">
            {subValue && (
              <span className="text-xs text-muted">{subValue}</span>
            )}
            {trend !== undefined && (
              <span className={`font-mono text-xs ${trend >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}%
              </span>
            )}
          </div>
        )}

        {/* Custom children */}
        {children && <div className="mt-2">{children}</div>}
      </div>
    </motion.div>
  );
}
