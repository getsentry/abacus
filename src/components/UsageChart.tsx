'use client';

import { motion } from 'framer-motion';
import { formatTokens, formatDate, formatCurrency } from '@/lib/utils';
import { Card } from '@/components/Card';
import { SectionLabel } from '@/components/SectionLabel';
import { TooltipContent } from '@/components/Tooltip';
import { TOOL_CONFIGS } from '@/lib/tools';

interface DailyUsage {
  date: string;
  claudeCode: number;
  cursor: number;
  cost?: number;
}

interface UsageChartProps {
  data: DailyUsage[];
  days?: number;
}

export function UsageChart({ data, days }: UsageChartProps) {
  const maxValue = Math.max(...data.map(d => Number(d.claudeCode) + Number(d.cursor)), 1);
  const claudeCodeTotal = data.reduce((sum, d) => sum + Number(d.claudeCode), 0);
  const cursorTotal = data.reduce((sum, d) => sum + Number(d.cursor), 0);

  // Determine label frequency to show max ~10 labels
  const maxLabels = 10;
  const labelEvery = Math.max(1, Math.ceil(data.length / maxLabels));

  return (
    <Card animate delay={0.4} padding="lg" className="h-full">
      <div className="mb-4 flex items-center justify-between">
        <SectionLabel days={days}>Daily Usage</SectionLabel>
        <div className="flex gap-4">
          <span className={`font-mono text-xs ${TOOL_CONFIGS.claude_code.text}`}>
            {TOOL_CONFIGS.claude_code.name}: {formatTokens(claudeCodeTotal)}
          </span>
          <span className={`font-mono text-xs ${TOOL_CONFIGS.cursor.text}`}>
            {TOOL_CONFIGS.cursor.name}: {formatTokens(cursorTotal)}
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
                    className={`w-full rounded-t ${TOOL_CONFIGS.claude_code.bgChart}`}
                    style={{ minHeight: '2px' }}
                  />
                )}
                {cursorHeight > 0 && (
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${cursorHeight}%` }}
                    transition={{ duration: 0.6, delay: Math.min(i * 0.02 + 0.02, 1) }}
                    className={`w-full rounded-b ${TOOL_CONFIGS.cursor.bgChart}`}
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
              <TooltipContent>
                <div className="text-white/60 mb-1">{formatDate(item.date)}</div>
                <div className={TOOL_CONFIGS.claude_code.text}>{TOOL_CONFIGS.claude_code.name}: {formatTokens(item.claudeCode)}</div>
                <div className={TOOL_CONFIGS.cursor.text}>{TOOL_CONFIGS.cursor.name}: {formatTokens(item.cursor)}</div>
                {item.cost !== undefined && (
                  <div className="text-green-400 mt-1 pt-1 border-t border-white/10">Cost: {formatCurrency(item.cost)}</div>
                )}
              </TooltipContent>
            </div>
          );
        })}
      </div>

      {/* X-axis line */}
      <div className="h-px bg-white/10 mt-1" />
    </Card>
  );
}
