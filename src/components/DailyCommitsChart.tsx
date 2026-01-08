'use client';

import { BaseStackedBarChart, type StackedBarSegment, type StackedBarDataPoint } from './BaseStackedBarChart';
import { TOOL_CONFIGS, HUMAN_CONFIG } from '@/lib/tools';

export interface DailyCommitData {
  date: string;
  claudeCode: number;
  cursor: number;
  copilot: number;
  windsurf: number;
  human: number;
}

interface DailyCommitsChartProps {
  data: DailyCommitData[];
  height?: number;
  showLabels?: boolean;
}

// Define segments for the commit chart (rendered bottom to top in stack)
// Uses centralized tool colors from lib/tools.ts
const COMMIT_SEGMENTS: StackedBarSegment[] = [
  {
    key: 'human',
    label: HUMAN_CONFIG.name,
    color: HUMAN_CONFIG.bgChart,
    textColor: HUMAN_CONFIG.text,
  },
  {
    key: 'claudeCode',
    label: TOOL_CONFIGS.claude_code.name,
    color: TOOL_CONFIGS.claude_code.bgChart,
    textColor: TOOL_CONFIGS.claude_code.text,
  },
  {
    key: 'cursor',
    label: TOOL_CONFIGS.cursor.name,
    color: TOOL_CONFIGS.cursor.bgChart,
    textColor: TOOL_CONFIGS.cursor.text,
  },
  {
    key: 'copilot',
    label: TOOL_CONFIGS.github_copilot.name,
    color: TOOL_CONFIGS.github_copilot.bgChart,
    textColor: TOOL_CONFIGS.github_copilot.text,
  },
  {
    key: 'windsurf',
    label: TOOL_CONFIGS.windsurf.name,
    color: TOOL_CONFIGS.windsurf.bgChart,
    textColor: TOOL_CONFIGS.windsurf.text,
  },
];

export function DailyCommitsChart({ data, height = 128, showLabels = true }: DailyCommitsChartProps) {
  // Transform data to BaseStackedBarChart format
  const chartData: StackedBarDataPoint[] = data.map(d => ({
    date: d.date,
    values: {
      human: d.human,
      claudeCode: d.claudeCode,
      cursor: d.cursor,
      copilot: d.copilot,
      windsurf: d.windsurf,
    },
  }));

  // Filter segments to only show those with data
  const activeSegments = COMMIT_SEGMENTS.filter(seg =>
    data.some(d => {
      const value = d[seg.key as keyof DailyCommitData];
      return typeof value === 'number' && value > 0;
    })
  );

  return (
    <BaseStackedBarChart
      title="Daily Commits"
      subtitle={`(${data.length} days)`}
      data={chartData}
      segments={activeSegments}
      height={height}
      showLabels={showLabels}
      formatValue={(v) => v.toLocaleString()}
    />
  );
}
