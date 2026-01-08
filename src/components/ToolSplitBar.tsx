'use client';

import { getToolConfig, formatToolName } from '@/lib/tools';
import { formatTokens } from '@/lib/utils';
import { TooltipContent } from '@/components/Tooltip';

export interface ToolSplitData {
  tool: string;
  value: number;
}

type ValueType = 'tokens' | 'commits' | 'number';

interface ToolSplitBarProps {
  /** Array of tool data with values */
  data: ToolSplitData[];
  /** Total value for percentage calculation */
  total: number;
  /** How to format values in tooltip. Default: 'number' */
  valueType?: ValueType;
  /** Custom value formatter (overrides valueType) */
  formatValue?: (value: number) => string;
  /** Minimum width of the bar. Default: none */
  minWidth?: string;
  /** Show tooltip on hover. Default: true */
  showTooltip?: boolean;
  /** Additional CSS classes */
  className?: string;
}

const valueFormatters: Record<ValueType, (value: number) => string> = {
  tokens: formatTokens,
  commits: (v) => v.toLocaleString(),
  number: (v) => v.toLocaleString(),
};

/**
 * ToolSplitBar - Horizontal stacked bar showing tool distribution
 * Used in tables to visualize tool usage breakdown.
 *
 * @example
 * // For token usage
 * <ToolSplitBar
 *   data={[{ tool: 'claude_code', value: 1000 }, { tool: 'cursor', value: 500 }]}
 *   total={1500}
 *   valueType="tokens"
 * />
 *
 * // For commit counts
 * <ToolSplitBar
 *   data={[{ tool: 'claude_code', value: 10 }, { tool: 'copilot', value: 5 }]}
 *   total={15}
 *   valueType="commits"
 * />
 */
export function ToolSplitBar({
  data,
  total,
  valueType = 'number',
  formatValue,
  minWidth,
  showTooltip = true,
  className = '',
}: ToolSplitBarProps) {
  if (total === 0 || data.length === 0) {
    return <span className="text-faint">-</span>;
  }

  const formatter = formatValue || valueFormatters[valueType];

  return (
    <div
      className={`group/dist relative flex gap-0.5 w-full ${className}`}
      style={minWidth ? { minWidth } : undefined}
    >
      {/* Stacked bar segments */}
      {data.map((item, idx) => {
        const config = getToolConfig(item.tool);
        const pct = (item.value / total) * 100;
        return (
          <div
            key={item.tool}
            className={`h-1.5 sm:h-2 ${config.bg} ${idx === 0 ? 'rounded-l' : ''} ${idx === data.length - 1 ? 'rounded-r' : ''}`}
            style={{ width: `${pct}%` }}
          />
        );
      })}

      {/* Tooltip */}
      {showTooltip && (
        <TooltipContent groupName="dist">
          {data.map(item => {
            const config = getToolConfig(item.tool);
            const pct = Math.round((item.value / total) * 100);
            return (
              <div key={item.tool} className={config.text}>
                {formatToolName(item.tool)}: {formatter(item.value)} ({pct}%)
              </div>
            );
          })}
        </TooltipContent>
      )}
    </div>
  );
}
