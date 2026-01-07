'use client';

import { motion } from 'framer-motion';
import { formatTokens, formatDate, formatCurrency } from '@/lib/utils';

interface DailyUsage {
  date: string;
  claudeCode: number;
  cursor: number;
  cost?: number;
}

interface UsageChartProps {
  data: DailyUsage[];
}

export function UsageChart({ data }: UsageChartProps) {
  const maxValue = Math.max(...data.map(d => Number(d.claudeCode) + Number(d.cursor)), 1);
  const claudeCodeTotal = data.reduce((sum, d) => sum + Number(d.claudeCode), 0);
  const cursorTotal = data.reduce((sum, d) => sum + Number(d.cursor), 0);

  // Determine label frequency to show max ~10 labels
  const maxLabels = 10;
  const labelEvery = Math.max(1, Math.ceil(data.length / maxLabels));

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
      className="rounded-lg border border-white/5 bg-white/[0.02] p-6 h-full"
    >
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-mono text-xs uppercase tracking-wider text-white/60">
          Daily Usage
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

      <div className="flex items-end gap-0.5" style={{ height: '200px' }}>
        {data.map((item, i) => {
          const claudeHeight = (Number(item.claudeCode) / maxValue) * 100;
          const cursorHeight = (Number(item.cursor) / maxValue) * 100;

          return (
            <div key={item.date} className="group relative flex-1 flex flex-col justify-end min-w-[3px]" style={{ height: '100%' }}>
              <div className="flex w-full flex-col gap-0.5 justify-end" style={{ height: '100%' }}>
                {claudeHeight > 0 && (
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${claudeHeight}%` }}
                    transition={{ duration: 0.6, delay: Math.min(i * 0.02, 1) }}
                    className="w-full rounded-t bg-amber-500/80"
                    style={{ minHeight: '2px' }}
                  />
                )}
                {cursorHeight > 0 && (
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${cursorHeight}%` }}
                    transition={{ duration: 0.6, delay: Math.min(i * 0.02 + 0.02, 1) }}
                    className="w-full rounded-b bg-cyan-500/80"
                    style={{ minHeight: '2px' }}
                  />
                )}
              </div>

              {/* Date label - only show every Nth label */}
              {i % labelEvery === 0 && (
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
      <div className="h-px bg-white/10 mt-1" />
    </motion.div>
  );
}
