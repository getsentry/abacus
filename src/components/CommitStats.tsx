'use client';

import { motion } from 'framer-motion';
import { GitCommit } from 'lucide-react';
import { getToolConfig, formatToolName } from '@/lib/tools';
import { AppLink } from '@/components/AppLink';

interface ToolBreakdown {
  tool: string;
  commits: number;
  additions: number;
  deletions: number;
}

interface CommitStatsProps {
  totalCommits: number;
  aiAssistedCommits: number;
  aiAssistanceRate: number;
  aiAdditions: number;
  aiDeletions: number;
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
  aiAdditions,
  aiDeletions,
  toolBreakdown,
  days,
  className = '',
}: CommitStatsProps) {
  if (totalCommits === 0) return null;

  const totalAiCommits = toolBreakdown.reduce((sum, t) => sum + t.commits, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
      className={`rounded-lg border border-white/5 bg-white/[0.02] p-4 ${className}`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <GitCommit className="w-3.5 h-3.5 text-white/40" />
          <p className="font-mono text-[10px] uppercase tracking-wider text-white/40">
            Commits {days && <span className="text-white/20">({days}d)</span>}
          </p>
        </div>
        <AppLink
          href="/commits"
          className="font-mono text-[10px] text-amber-500/70 hover:text-amber-400 transition-colors cursor-pointer"
        >
          View details
        </AppLink>
      </div>

      {/* Main stat: AI Assistance Rate */}
      <div className="mb-4">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-3xl font-light text-white">
            {aiAssistanceRate}%
          </span>
          <span className="font-mono text-xs text-white/40">AI-assisted</span>
        </div>
        <p className="font-mono text-[10px] text-white/30 mt-1">
          {formatNumber(aiAssistedCommits)} of {formatNumber(totalCommits)} commits
        </p>
      </div>

      {/* Lines of code bar */}
      {(aiAdditions > 0 || aiDeletions > 0) && (
        <div className="mb-4">
          <p className="font-mono text-[10px] text-white/40 mb-2">Lines changed with AI</p>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-sm text-emerald-400">+{formatNumber(aiAdditions)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-sm text-rose-400">-{formatNumber(aiDeletions)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Tool breakdown */}
      {toolBreakdown.length > 0 && (
        <div>
          <p className="font-mono text-[10px] text-white/40 mb-2">By tool</p>
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
                  <span className={`font-mono text-[11px] ${config.text} w-20`}>
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
    </motion.div>
  );
}
