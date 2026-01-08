'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { formatTokens } from '@/lib/utils';
import { getToolConfig, formatToolName } from '@/lib/tools';
import { AnimatedCard } from './Card';
import { SectionLabel } from './SectionLabel';
import { TooltipBox } from './Tooltip';

interface ToolData {
  tool: string;
  tokens: number;
  tokenPercentage: number;
  users: number;
  userPercentage: number;
}

interface CommitToolData {
  tool: string;
  commits: number;
}

interface ToolDistributionProps {
  tools: ToolData[];
  totalTokens: number;
  totalUsers: number;
  className?: string;
  days?: number;
  commitTools?: CommitToolData[];
  totalCommits?: number;
}

// Extended colors for hover states
const TOOL_HOVER_COLORS: Record<string, { bar: string; barHover: string }> = {
  claude_code: { bar: 'bg-amber-500', barHover: 'bg-amber-400' },
  cursor: { bar: 'bg-cyan-500', barHover: 'bg-cyan-400' },
  windsurf: { bar: 'bg-emerald-500', barHover: 'bg-emerald-400' },
  github_copilot: { bar: 'bg-sky-500', barHover: 'bg-sky-400' },
  codex: { bar: 'bg-teal-500', barHover: 'bg-teal-400' },
};

const DEFAULT_HOVER_COLORS = { bar: 'bg-rose-500', barHover: 'bg-rose-400' };

function getToolHoverColors(tool: string) {
  return TOOL_HOVER_COLORS[tool] || DEFAULT_HOVER_COLORS;
}

export function ToolDistribution({
  tools,
  totalTokens,
  totalUsers,
  className = '',
  days,
  commitTools = [],
  totalCommits = 0,
}: ToolDistributionProps) {
  const [hoveredTool, setHoveredTool] = useState<string | null>(null);
  const [hoveredBar, setHoveredBar] = useState<'tokens' | 'users' | 'commits' | null>(null);

  // Calculate segment positions for tooltip placement
  const tokenPositions = useMemo(() => {
    const positions: Record<string, { left: number; width: number }> = {};
    let cumulative = 0;
    for (const tool of tools) {
      if (tool.tokenPercentage > 0) {
        positions[tool.tool] = { left: cumulative, width: tool.tokenPercentage };
        cumulative += tool.tokenPercentage;
      }
    }
    return positions;
  }, [tools]);

  const userPositions = useMemo(() => {
    const positions: Record<string, { left: number; width: number }> = {};
    let cumulative = 0;
    for (const tool of tools) {
      if (tool.userPercentage > 0) {
        positions[tool.tool] = { left: cumulative, width: tool.userPercentage };
        cumulative += tool.userPercentage;
      }
    }
    return positions;
  }, [tools]);

  const commitPositions = useMemo(() => {
    const positions: Record<string, { left: number; width: number; commits: number; percentage: number }> = {};
    if (totalCommits === 0) return positions;
    let cumulative = 0;
    for (const tool of commitTools) {
      const percentage = (tool.commits / totalCommits) * 100;
      if (percentage > 0) {
        positions[tool.tool] = { left: cumulative, width: percentage, commits: tool.commits, percentage };
        cumulative += percentage;
      }
    }
    return positions;
  }, [commitTools, totalCommits]);

  if (totalTokens === 0 || tools.length === 0) return null;

  const positions = hoveredBar === 'users' ? userPositions : hoveredBar === 'commits' ? commitPositions : tokenPositions;

  // Get tooltip content based on hovered bar type
  const getTooltipContent = () => {
    if (!hoveredTool) return null;

    if (hoveredBar === 'commits') {
      const pos = commitPositions[hoveredTool];
      if (!pos) return null;
      return `${pos.commits} commits (${Math.round(pos.percentage)}%)`;
    } else if (hoveredBar === 'users') {
      const tool = tools.find(t => t.tool === hoveredTool);
      if (!tool) return null;
      return `${tool.users} users (${Math.round(tool.userPercentage)}%)`;
    } else {
      const tool = tools.find(t => t.tool === hoveredTool);
      if (!tool) return null;
      return `${formatTokens(tool.tokens)} (${Math.round(tool.tokenPercentage)}%)`;
    }
  };

  return (
    <AnimatedCard delay={0.35} padding="md" className={className}>
      <div className="flex items-center justify-between mb-3">
        <SectionLabel days={days}>Tools</SectionLabel>
      </div>

      {/* Stacked bars with tooltips */}
      <div className="relative space-y-2">
        {/* Tooltip */}
        {hoveredTool && positions[hoveredTool] && (
          <div
            className="absolute bottom-full mb-2 z-10 pointer-events-none"
            style={{
              left: `${positions[hoveredTool].left + positions[hoveredTool].width / 2}%`,
              transform: 'translateX(-50%)',
            }}
          >
            <TooltipBox>
              <div className="text-white/60 mb-1">{formatToolName(hoveredTool)}</div>
              <div className={getToolConfig(hoveredTool).text}>
                {getTooltipContent()}
              </div>
            </TooltipBox>
          </div>
        )}

        {/* Tokens Bar */}
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-muted w-14 shrink-0">Tokens</span>
          <div className="h-2 rounded-full bg-white/5 overflow-hidden flex flex-1">
            {tools.map((tool, i) => {
              if (tool.tokens === 0) return null;
              const colors = getToolHoverColors(tool.tool);
              const isHovered = hoveredTool === tool.tool && hoveredBar === 'tokens';

              return (
                <motion.div
                  key={tool.tool}
                  initial={{ width: 0 }}
                  animate={{ width: `${tool.tokenPercentage}%` }}
                  transition={{ duration: 0.6, delay: 0.45 + i * 0.1 }}
                  onMouseEnter={() => { setHoveredTool(tool.tool); setHoveredBar('tokens'); }}
                  onMouseLeave={() => { setHoveredTool(null); setHoveredBar(null); }}
                  className={`h-full transition-colors cursor-default ${isHovered ? colors.barHover : colors.bar} ${i === 0 ? 'rounded-l-full' : ''} ${i === tools.length - 1 ? 'rounded-r-full' : ''}`}
                  style={{ minWidth: tool.tokenPercentage > 0 ? '4px' : 0 }}
                />
              );
            })}
          </div>
        </div>

        {/* Users Bar */}
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-muted w-14 shrink-0">Users</span>
          <div className="h-2 rounded-full bg-white/5 overflow-hidden flex flex-1">
            {tools.map((tool, i) => {
              if (tool.users === 0) return null;
              const colors = getToolHoverColors(tool.tool);
              const isHovered = hoveredTool === tool.tool && hoveredBar === 'users';

              return (
                <motion.div
                  key={tool.tool}
                  initial={{ width: 0 }}
                  animate={{ width: `${tool.userPercentage}%` }}
                  transition={{ duration: 0.6, delay: 0.55 + i * 0.1 }}
                  onMouseEnter={() => { setHoveredTool(tool.tool); setHoveredBar('users'); }}
                  onMouseLeave={() => { setHoveredTool(null); setHoveredBar(null); }}
                  className={`h-full transition-colors cursor-default ${isHovered ? colors.barHover : colors.bar} ${i === 0 ? 'rounded-l-full' : ''} ${i === tools.length - 1 ? 'rounded-r-full' : ''}`}
                  style={{ minWidth: tool.userPercentage > 0 ? '4px' : 0 }}
                />
              );
            })}
          </div>
        </div>

        {/* Commits Bar (only if commit data provided) */}
        {commitTools.length > 0 && totalCommits > 0 && (
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-muted w-14 shrink-0">Commits</span>
            <div className="h-2 rounded-full bg-white/5 overflow-hidden flex flex-1">
              {commitTools.map((tool, i) => {
                if (tool.commits === 0) return null;
                const colors = getToolHoverColors(tool.tool);
                const isHovered = hoveredTool === tool.tool && hoveredBar === 'commits';
                const percentage = (tool.commits / totalCommits) * 100;

                return (
                  <motion.div
                    key={tool.tool}
                    initial={{ width: 0 }}
                    animate={{ width: `${percentage}%` }}
                    transition={{ duration: 0.6, delay: 0.65 + i * 0.1 }}
                    onMouseEnter={() => { setHoveredTool(tool.tool); setHoveredBar('commits'); }}
                    onMouseLeave={() => { setHoveredTool(null); setHoveredBar(null); }}
                    className={`h-full transition-colors cursor-default ${isHovered ? colors.barHover : colors.bar} ${i === 0 ? 'rounded-l-full' : ''} ${i === commitTools.length - 1 ? 'rounded-r-full' : ''}`}
                    style={{ minWidth: percentage > 0 ? '4px' : 0 }}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>
    </AnimatedCard>
  );
}
