'use client';

import { motion } from 'framer-motion';
import { GitCommit } from 'lucide-react';
import { getToolConfig, formatToolName } from '@/lib/tools';
import { AppLink } from '@/components/AppLink';
import { Card } from '@/components/Card';
import { SectionLabel } from '@/components/SectionLabel';

interface ToolBreakdown {
  tool: string;
  commits: number;
}

interface CommitStatsProps {
  totalCommits: number;
  aiAssistedCommits: number;
  aiAssistanceRate: number;
  toolBreakdown: ToolBreakdown[];
  days?: number;
  className?: string;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export function CommitStats({
  totalCommits,
  aiAssistedCommits,
  aiAssistanceRate,
  toolBreakdown,
  days,
  className = '',
}: CommitStatsProps) {
  if (totalCommits === 0) return null;

  const totalAiCommits = toolBreakdown.reduce((sum, t) => sum + t.commits, 0);

  return (
    <Card animate delay={0.4} className={className}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <GitCommit className="w-4 h-4 text-white/50" />
          <SectionLabel days={days}>Commits</SectionLabel>
        </div>
        <AppLink
          href="/commits"
          className="font-mono text-xs text-amber-500 hover:text-amber-400 transition-colors cursor-pointer"
        >
          View details
        </AppLink>
      </div>

      {/* Main stat: AI Attribution Rate */}
      <div className="mb-4">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-3xl font-light text-white">
            {aiAssistanceRate}%
          </span>
          <span className="font-mono text-xs text-white/40">AI Attributed</span>
        </div>
        <p className="font-mono text-[10px] text-white/30 mt-1">
          {formatNumber(aiAssistedCommits)} of {formatNumber(totalCommits)} commits
        </p>
      </div>

      {/* Tool breakdown */}
      {toolBreakdown.length > 0 && (
        <div>
          <div className="space-y-1.5">
            {toolBreakdown.map((tool, i) => {
              const config = getToolConfig(tool.tool);
              const percentage = totalAiCommits > 0 ? (tool.commits / totalAiCommits) * 100 : 0;

              return (
                <motion.div
                  key={tool.tool}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5 + i * 0.05 }}
                  className="flex items-center gap-2"
                >
                  <div className={`w-1.5 h-1.5 rounded-full ${config.bg}`} />
                  <span className={`font-mono text-[11px] ${config.text} w-24`}>
                    {formatToolName(tool.tool)}
                  </span>
                  <div className="flex-1 h-1 rounded-full bg-white/5 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${percentage}%` }}
                      transition={{ duration: 0.6, delay: 0.55 + i * 0.05 }}
                      className={`h-full rounded-full ${config.bg}`}
                    />
                  </div>
                  <span className="font-mono text-[10px] text-white/40 w-12 text-right">
                    {tool.commits}
                  </span>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}
