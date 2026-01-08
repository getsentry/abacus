'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { formatTokens } from '@/lib/utils';
import { getToolConfig, formatToolName } from '@/lib/tools';

interface ToolData {
  tool: string;
  tokens: number;
  percentage: number;
}

interface ToolDistributionProps {
  tools: ToolData[];
  totalTokens: number;
  className?: string;
  days?: number;
}

// Extended colors for hover states
const TOOL_HOVER_COLORS: Record<string, { bar: string; barHover: string }> = {
  claude_code: { bar: 'bg-amber-500', barHover: 'bg-amber-400' },
  cursor: { bar: 'bg-cyan-500', barHover: 'bg-cyan-400' },
  windsurf: { bar: 'bg-emerald-500', barHover: 'bg-emerald-400' },
  copilot: { bar: 'bg-violet-500', barHover: 'bg-violet-400' },
};

const DEFAULT_HOVER_COLORS = { bar: 'bg-rose-500', barHover: 'bg-rose-400' };

function getToolHoverColors(tool: string) {
  return TOOL_HOVER_COLORS[tool] || DEFAULT_HOVER_COLORS;
}

export function ToolDistribution({
  tools,
  totalTokens,
  className = '',
  days,
}: ToolDistributionProps) {
  const [hoveredTool, setHoveredTool] = useState<string | null>(null);

  // Calculate segment positions for tooltip placement
  const segmentPositions = useMemo(() => {
    const positions: Record<string, { left: number; width: number }> = {};
    let cumulative = 0;
    for (const tool of tools) {
      if (tool.percentage > 0) {
        positions[tool.tool] = { left: cumulative, width: tool.percentage };
        cumulative += tool.percentage;
      }
    }
    return positions;
  }, [tools]);

  if (totalTokens === 0 || tools.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.35 }}
      className={`rounded-lg border border-white/5 bg-white/[0.02] p-4 ${className}`}
    >
      <div className="flex items-center justify-between mb-3">
        <p className="font-mono text-[10px] uppercase tracking-wider text-white/40">
          Tool Distribution {days && <span className="text-white/20">({days}d)</span>}
        </p>
      </div>

      {/* Stacked bar with tooltips */}
      <div className="relative mb-3">
        {/* Tooltip */}
        {hoveredTool && segmentPositions[hoveredTool] && (
          <div
            className="absolute bottom-full mb-2 z-10 pointer-events-none"
            style={{
              left: `${segmentPositions[hoveredTool].left + segmentPositions[hoveredTool].width / 2}%`,
              transform: 'translateX(-50%)',
            }}
          >
            <div className="rounded bg-black/90 px-2 py-1.5 text-[10px] whitespace-nowrap border border-white/10">
              <div className="text-white/60 mb-1">{formatToolName(hoveredTool)}</div>
              <div className={getToolConfig(hoveredTool).text}>
                {formatTokens(tools.find(t => t.tool === hoveredTool)?.tokens || 0)} ({Math.round(tools.find(t => t.tool === hoveredTool)?.percentage || 0)}%)
              </div>
            </div>
          </div>
        )}

        {/* Bar */}
        <div className="h-2 rounded-full bg-white/5 overflow-hidden flex">
          {tools.map((tool, i) => {
            if (tool.tokens === 0) return null;
            const colors = getToolHoverColors(tool.tool);
            const isHovered = hoveredTool === tool.tool;

            return (
              <motion.div
                key={tool.tool}
                initial={{ width: 0 }}
                animate={{ width: `${tool.percentage}%` }}
                transition={{ duration: 0.6, delay: 0.45 + i * 0.1 }}
                onMouseEnter={() => setHoveredTool(tool.tool)}
                onMouseLeave={() => setHoveredTool(null)}
                className={`h-full transition-colors cursor-default ${isHovered ? colors.barHover : colors.bar} ${i === 0 ? 'rounded-l-full' : ''} ${i === tools.length - 1 ? 'rounded-r-full' : ''}`}
                style={{ minWidth: tool.percentage > 0 ? '4px' : 0 }}
              />
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {tools.map(tool => {
          const config = getToolConfig(tool.tool);

          return (
            <div key={tool.tool} className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full ${config.bg}`} />
              <span className={`font-mono text-[10px] ${config.text}`}>
                {formatToolName(tool.tool)}
              </span>
              <span className="font-mono text-[10px] text-white/50">
                {formatTokens(tool.tokens)}
              </span>
              <span className="font-mono text-[10px] text-white/30">
                ({Math.round(tool.percentage)}%)
              </span>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
