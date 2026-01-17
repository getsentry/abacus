'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, ArrowRight } from 'lucide-react';
import { formatTokens, formatDate, formatCurrency } from '@/lib/utils';
import { aggregateToWeekly } from '@/lib/dateUtils';
import { Card } from '@/components/Card';
import { SectionLabel } from '@/components/SectionLabel';
import { TooltipContent } from '@/components/Tooltip';
import { TrendLine } from '@/components/TrendLine';
import { AppLink } from '@/components/AppLink';
import { InlineLegend } from '@/components/Legend';
import { TOOL_CONFIGS } from '@/lib/tools';
import { hasProjectedData } from '@/lib/projection';
import type { DailyUsage } from '@/lib/queries';

interface UsageChartProps {
  data: DailyUsage[];
  days?: number;
}

const AGGREGATION_THRESHOLD = 90;

export function UsageChart({ data, days }: UsageChartProps) {
  const [showTrend, setShowTrend] = useState(true);

  // Auto-aggregate to weekly when >90 data points
  const { chartData, isWeekly } = useMemo(() => {
    if (data.length > AGGREGATION_THRESHOLD) {
      return { chartData: aggregateToWeekly(data), isWeekly: true };
    }
    return { chartData: data, isWeekly: false };
  }, [data]);

  // Calculate totals per data point for trend line
  const totalValues = useMemo(
    () => chartData.map(d => Number(d.claudeCode) + Number(d.cursor)),
    [chartData]
  );

  const maxValue = Math.max(...totalValues, 1);
  const claudeCodeTotal = chartData.reduce((sum, d) => sum + Number(d.claudeCode), 0);
  const cursorTotal = chartData.reduce((sum, d) => sum + Number(d.cursor), 0);
  const showProjectedLegend = hasProjectedData(chartData);

  // Determine label frequency to show max ~10 labels
  const maxLabels = 10;
  const labelEvery = Math.max(1, Math.ceil(chartData.length / maxLabels));

  return (
    <Card animate delay={0.4} padding="lg" className="h-full">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <SectionLabel days={days}>{isWeekly ? 'Weekly Usage' : 'Daily Usage'}</SectionLabel>
          <AppLink
            href="/usage"
            className="p-1 rounded hover:bg-white/5 text-white/40 hover:text-amber-400 transition-colors"
            aria-label="View more"
          >
            <ArrowRight className="w-4 h-4" />
          </AppLink>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setShowTrend(!showTrend)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors cursor-pointer ${
              showTrend
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                : 'bg-white/5 text-white/40 border border-white/10 hover:bg-white/10'
            }`}
          >
            <TrendingUp className="w-3 h-3" />
            <span>Trend</span>
          </button>
          <div className="flex items-center gap-4">
            <InlineLegend
              items={[
                { key: 'claude_code', label: TOOL_CONFIGS.claude_code.name, value: formatTokens(claudeCodeTotal), textColor: TOOL_CONFIGS.claude_code.text },
                { key: 'cursor', label: TOOL_CONFIGS.cursor.name, value: formatTokens(cursorTotal), textColor: TOOL_CONFIGS.cursor.text },
              ]}
            />
            {showProjectedLegend && (
              <div className="flex items-center gap-1.5 text-xs text-white/40">
                <div className="w-3 h-3 bg-white/10 bg-stripes rounded-sm" />
                <span>Projected</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="relative" style={{ height: '200px' }}>
{showTrend && <TrendLine values={totalValues} maxValue={maxValue} />}
        <div className="flex items-end gap-0.5 h-full">
        {chartData.map((item, i) => {
          const claudeHeight = (Number(item.claudeCode) / maxValue) * 100;
          const cursorHeight = (Number(item.cursor) / maxValue) * 100;
          const isIncomplete = item.isIncomplete;
          const claudeCodeProjected = item.projectedClaudeCode !== undefined;
          const cursorProjected = item.projectedCursor !== undefined;

          return (
            <div key={item.date} className="group relative flex-1 flex flex-col justify-end min-w-[3px]" style={{ height: '100%' }}>
              <div className="flex w-full flex-col gap-0.5 justify-end" style={{ height: '100%' }}>
                {claudeHeight > 0 && (
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${claudeHeight}%` }}
                    transition={{ duration: 0.6, delay: Math.min(i * 0.02, 1) }}
                    className={`w-full rounded-t relative overflow-hidden ${claudeCodeProjected ? 'bg-white/20' : TOOL_CONFIGS.claude_code.bgChart}`}
                    style={{ minHeight: '2px' }}
                  >
                    {claudeCodeProjected && <div className="absolute inset-0 bg-stripes" />}
                  </motion.div>
                )}
                {cursorHeight > 0 && (
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${cursorHeight}%` }}
                    transition={{ duration: 0.6, delay: Math.min(i * 0.02 + 0.02, 1) }}
                    className={`w-full rounded-b relative overflow-hidden ${cursorProjected ? 'bg-white/20' : TOOL_CONFIGS.cursor.bgChart}`}
                    style={{ minHeight: '2px' }}
                  >
                    {cursorProjected && <div className="absolute inset-0 bg-stripes" />}
                  </motion.div>
                )}
              </div>

              {/* Date label - only show every Nth label */}
              {i % labelEvery === 0 && (
                <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 font-mono text-[10px] text-muted whitespace-nowrap">
                  {formatDate(item.date)}
                </span>
              )}

              {/* Tooltip */}
              <TooltipContent>
                <div className="text-white/60 mb-1">{formatDate(item.date)}</div>
                <div className={TOOL_CONFIGS.claude_code.text}>
                  {TOOL_CONFIGS.claude_code.name}: {formatTokens(item.claudeCode)}
                  {item.projectedClaudeCode !== undefined && item.projectedClaudeCode > 0 && (
                    <span className="text-white/40 ml-1">(actual: {formatTokens(item.projectedClaudeCode)})</span>
                  )}
                  {item.projectedClaudeCode === 0 && (
                    <span className="text-white/40 ml-1">(est. from avg)</span>
                  )}
                </div>
                <div className={TOOL_CONFIGS.cursor.text}>
                  {TOOL_CONFIGS.cursor.name}: {formatTokens(item.cursor)}
                  {item.projectedCursor !== undefined && item.projectedCursor > 0 && (
                    <span className="text-white/40 ml-1">(actual: {formatTokens(item.projectedCursor)})</span>
                  )}
                  {item.projectedCursor === 0 && (
                    <span className="text-white/40 ml-1">(est. from avg)</span>
                  )}
                </div>
                {item.cost !== undefined && item.cost > 0 && (
                  <div className="text-emerald-400 mt-1 pt-1 border-t border-white/10">Cost: {formatCurrency(item.cost)}</div>
                )}
                {isIncomplete && (
                  <div className="text-white/40 text-xs mt-1 pt-1 border-t border-white/10">
                    {item.projectedClaudeCode !== undefined || item.projectedCursor !== undefined
                      ? 'Projected (data still syncing)'
                      : 'Data incomplete'}
                  </div>
                )}
              </TooltipContent>
            </div>
          );
        })}
        </div>
      </div>

      {/* X-axis line */}
      <div className="h-px bg-white/10 mt-1" />
    </Card>
  );
}
