'use client';

import { BaseStackedBarChart, type StackedBarSegment, type StackedBarDataPoint } from './BaseStackedBarChart';
import { formatTokens, formatCurrency } from '@/lib/utils';
import { TOOL_CONFIGS } from '@/lib/tools';

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

// Define segments for the usage chart (rendered bottom to top in stack)
const USAGE_SEGMENTS: StackedBarSegment[] = [
  {
    key: 'cursor',
    label: TOOL_CONFIGS.cursor.name,
    color: `${TOOL_CONFIGS.cursor.bg}/80`,
    textColor: TOOL_CONFIGS.cursor.text,
  },
  {
    key: 'claudeCode',
    label: TOOL_CONFIGS.claude_code.name,
    color: `${TOOL_CONFIGS.claude_code.bg}/80`,
    textColor: TOOL_CONFIGS.claude_code.text,
  },
];

export function StackedBarChart({ data, height = 200, showLabels = true }: StackedBarChartProps) {
  // Transform data to BaseStackedBarChart format
  const chartData: StackedBarDataPoint[] = data.map(d => ({
    date: d.date,
    values: {
      claudeCode: Number(d.claudeCode),
      cursor: Number(d.cursor),
    },
  }));

  // Calculate totals for custom legend
  const claudeCodeTotal = data.reduce((sum, d) => sum + Number(d.claudeCode), 0);
  const cursorTotal = data.reduce((sum, d) => sum + Number(d.cursor), 0);

  // Custom legend with token formatting
  const legendContent = (
    <div className="flex gap-4">
      <span className={`font-mono text-xs ${TOOL_CONFIGS.claude_code.text}`}>
        {TOOL_CONFIGS.claude_code.name}: {formatTokens(claudeCodeTotal)}
      </span>
      <span className={`font-mono text-xs ${TOOL_CONFIGS.cursor.text}`}>
        {TOOL_CONFIGS.cursor.name}: {formatTokens(cursorTotal)}
      </span>
    </div>
  );

  return (
    <BaseStackedBarChart
      title="Daily Usage"
      subtitle={`(${data.length} days)`}
      data={chartData}
      segments={USAGE_SEGMENTS}
      height={height}
      showLabels={showLabels}
      formatValue={formatTokens}
      legendContent={legendContent}
    />
  );
}
