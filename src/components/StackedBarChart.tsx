'use client';

import { motion } from 'framer-motion';
import { formatTokens, formatDate, formatCurrency } from '@/lib/utils';

interface DailyUsage {
  date: string;
  claudeCode: number;
  cursor: number;
  cost?: number;
}

interface StackedBarChartProps {
  data: DailyUsage[];
  height?: number;
  showLabels?: boolean;
}

export function StackedBarChart({ data, height = 200, showLabels = true }: StackedBarChartProps) {
  const maxValue = Math.max(...data.map(d => Number(d.claudeCode) + Number(d.cursor)), 1);
  const claudeCodeTotal = data.reduce((sum, d) => sum + Number(d.claudeCode), 0);
  const cursorTotal = data.reduce((sum, d) => sum + Number(d.cursor), 0);

  // Determine label frequency to show max ~10 labels
  const maxLabels = 10;
  const labelEvery = Math.max(1, Math.ceil(data.length / maxLabels));

  return (
    <div className="w-full">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-mono text-xs uppercase tracking-wider text-white/60">
          Daily Usage <span className="text-white/30">({data.length} days)</span>
        </h3>
        <div className="flex gap-4">
          <span className="font-mono text-xs text-amber-400">
            Claude Code: {formatTokens(claudeCodeTotal)}
          </span>
          <span className="font-mono text-xs text-cyan-400">
            Cursor: {formatTokens(cursorTotal)}
          </span>
        </div>
      </div>

      <div className="flex items-end gap-1" style={{ height }}>
        {data.map((item, i) => {
          const total = Number(item.claudeCode) + Number(item.cursor);
          const totalHeight = (total / maxValue) * 100;
          const claudeRatio = total > 0 ? Number(item.claudeCode) / total : 0;

          return (
            <div
              key={item.date}
              className="group relative flex-1 flex flex-col justify-end min-w-[4px]"
              style={{ height: '100%' }}
            >
              {/* Stacked bar */}
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: `${totalHeight}%` }}
                transition={{ duration: 0.6, delay: i * 0.02 }}
                className="w-full flex flex-col overflow-hidden rounded-t"
                style={{ minHeight: total > 0 ? '2px' : '0' }}
              >
                {/* Claude Code (amber) - top portion */}
                <div
                  className="w-full bg-amber-500/80"
                  style={{ height: `${claudeRatio * 100}%` }}
                />
                {/* Cursor (cyan) - bottom portion */}
                <div
                  className="w-full bg-cyan-500/80 flex-1"
                />
              </motion.div>

              {/* Date label */}
              {showLabels && i % labelEvery === 0 && (
                <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 font-mono text-[8px] text-white/30 whitespace-nowrap">
                  {formatDate(item.date)}
                </span>
              )}

              {/* Tooltip */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10 pointer-events-none">
                <div className="rounded bg-black/90 px-2 py-1.5 text-[10px] whitespace-nowrap border border-white/10">
                  <div className="text-white/60 mb-1">{formatDate(item.date)}</div>
                  <div className="text-amber-400">Claude Code: {formatTokens(item.claudeCode)}</div>
                  <div className="text-cyan-400">Cursor: {formatTokens(item.cursor)}</div>
                  {item.cost !== undefined && (
                    <div className="text-green-400 mt-1 pt-1 border-t border-white/10">Cost: {formatCurrency(item.cost)}</div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* X-axis line */}
      {showLabels && <div className="h-px bg-white/10 mt-1" />}
    </div>
  );
}
