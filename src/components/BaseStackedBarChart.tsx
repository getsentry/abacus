'use client';

import { motion } from 'framer-motion';
import { formatDate } from '@/lib/utils';
import { TooltipContent } from '@/components/Tooltip';
import { InlineLegend } from '@/components/Legend';
import { type ReactNode } from 'react';

export interface StackedBarSegment {
  /** Unique key for this segment */
  key: string;
  /** Display label for legend/tooltip */
  label: string;
  /** Tailwind background color class (e.g., 'bg-amber-500/80') */
  color: string;
  /** Tailwind text color class for legend/tooltip (e.g., 'text-amber-400') */
  textColor: string;
}

export interface StackedBarDataPoint {
  /** Date string (YYYY-MM-DD) */
  date: string;
  /** Values for each segment, keyed by segment key */
  values: Record<string, number>;
}

interface BaseStackedBarChartProps {
  /** Chart title */
  title: string;
  /** Optional subtitle (e.g., "(30 days)") */
  subtitle?: string;
  /** Data points to display */
  data: StackedBarDataPoint[];
  /** Segment definitions (rendered bottom to top) */
  segments: StackedBarSegment[];
  /** Chart height in pixels */
  height?: number;
  /** Whether to show date labels on x-axis */
  showLabels?: boolean;
  /** Format function for tooltip values (defaults to toLocaleString) */
  formatValue?: (value: number) => string;
  /** Optional custom legend content */
  legendContent?: ReactNode;
}

export function BaseStackedBarChart({
  title,
  subtitle,
  data,
  segments,
  height = 128,
  showLabels = true,
  formatValue = (v) => v.toLocaleString(),
  legendContent,
}: BaseStackedBarChartProps) {
  // Calculate max total across all data points
  const maxValue = Math.max(
    ...data.map(d => segments.reduce((sum, seg) => sum + (d.values[seg.key] || 0), 0)),
    1
  );

  // Calculate totals for each segment
  const segmentTotals = segments.map(seg => ({
    ...seg,
    total: data.reduce((sum, d) => sum + (d.values[seg.key] || 0), 0),
  }));

  // Determine label frequency to show max ~10 labels
  const maxLabels = 10;
  const labelEvery = Math.max(1, Math.ceil(data.length / maxLabels));

  return (
    <div className="w-full">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-xs font-medium uppercase tracking-wider text-white/60">
          {title}
          {subtitle && <span className="text-faint"> {subtitle}</span>}
        </h3>
        {legendContent || (
          <InlineLegend
            items={segmentTotals.filter(s => s.total > 0).map(seg => ({
              key: seg.key,
              label: seg.label,
              value: formatValue(seg.total),
              textColor: seg.textColor,
            }))}
          />
        )}
      </div>

      {/* Chart */}
      <div className="flex items-end gap-1" style={{ height }}>
        {data.map((item, i) => {
          const total = segments.reduce((sum, seg) => sum + (item.values[seg.key] || 0), 0);
          const heightPct = (total / maxValue) * 100;

          // Calculate segment heights as percentages of total
          const segmentHeights = segments.map(seg => ({
            ...seg,
            value: item.values[seg.key] || 0,
            heightPct: total > 0 ? ((item.values[seg.key] || 0) / total) * 100 : 0,
          }));

          return (
            <div
              key={item.date}
              className="group relative flex-1 flex flex-col justify-end min-w-[4px]"
              style={{ height: '100%' }}
            >
              {/* Stacked bar */}
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: `${heightPct}%` }}
                transition={{ duration: 0.6, delay: i * 0.02 }}
                className="w-full flex flex-col overflow-hidden rounded-t"
                style={{ minHeight: total > 0 ? '2px' : '0' }}
              >
                {/* Render segments from bottom to top */}
                {segmentHeights.map(seg => (
                  <div
                    key={seg.key}
                    className={`w-full ${seg.color}`}
                    style={{ height: `${seg.heightPct}%` }}
                  />
                ))}
              </motion.div>

              {/* Date label */}
              {showLabels && i % labelEvery === 0 && (
                <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 font-mono text-[10px] text-muted whitespace-nowrap">
                  {formatDate(item.date)}
                </span>
              )}

              {/* Tooltip */}
              <TooltipContent zIndex={10}>
                <div className="text-white/60 mb-1">{formatDate(item.date)}</div>
                <div className="text-white mb-1">{formatValue(total)} total</div>
                {segmentHeights.filter(s => s.value > 0).map(seg => (
                  <div key={seg.key} className={seg.textColor}>
                    {seg.label}: {formatValue(seg.value)}
                  </div>
                ))}
              </TooltipContent>
            </div>
          );
        })}
      </div>

      {/* X-axis line */}
      {showLabels && <div className="h-px bg-white/10 mt-1" />}
    </div>
  );
}
