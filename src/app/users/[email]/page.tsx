'use client';

import { useState, useEffect, useCallback, Suspense, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useTimeRange } from '@/contexts/TimeRangeContext';
import { motion } from 'framer-motion';
import { StatCard } from '@/components/StatCard';
import { StackedBarChart } from '@/components/StackedBarChart';
import { TimeRangeSelector } from '@/components/TimeRangeSelector';
import { MainNav } from '@/components/MainNav';
import { UserMenu } from '@/components/UserMenu';
import { formatTokens, formatCurrency, formatDate, formatModelName } from '@/lib/utils';

// Tool color palette - extensible for future tools
const TOOL_COLORS: Record<string, { bg: string; text: string; gradient: string }> = {
  claude_code: {
    bg: 'bg-amber-500',
    text: 'text-amber-400',
    gradient: 'from-amber-500/80 to-amber-400/60',
  },
  cursor: {
    bg: 'bg-cyan-500',
    text: 'text-cyan-400',
    gradient: 'from-cyan-500/80 to-cyan-400/60',
  },
  // Future tools
  windsurf: {
    bg: 'bg-emerald-500',
    text: 'text-emerald-400',
    gradient: 'from-emerald-500/80 to-emerald-400/60',
  },
  copilot: {
    bg: 'bg-violet-500',
    text: 'text-violet-400',
    gradient: 'from-violet-500/80 to-violet-400/60',
  },
  default: {
    bg: 'bg-rose-500',
    text: 'text-rose-400',
    gradient: 'from-rose-500/80 to-rose-400/60',
  },
};

function getToolColor(tool: string) {
  return TOOL_COLORS[tool] || TOOL_COLORS.default;
}

function formatToolName(tool: string): string {
  const names: Record<string, string> = {
    claude_code: 'Claude Code',
    cursor: 'Cursor',
    windsurf: 'Windsurf',
    copilot: 'Copilot',
  };
  return names[tool] || tool.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

interface ToolBreakdown {
  tool: string;
  tokens: number;
  cost: number;
  percentage: number;
}

interface UserDetails {
  summary: {
    email: string;
    totalTokens: number;
    totalCost: number;
    claudeCodeTokens: number;
    cursorTokens: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    lastActive: string;
    firstActive: string;
    daysActive: number;
  };
  modelBreakdown: {
    model: string;
    tokens: number;
    inputTokens: number;
    outputTokens: number;
    cost: number;
    tool: string;
  }[];
  dailyUsage: {
    date: string;
    claudeCode: number;
    cursor: number;
    inputTokens: number;
    outputTokens: number;
    cost: number;
  }[];
}

function UserDetailContent() {
  const params = useParams();
  const { days, setDays, isPending } = useTimeRange();

  // URL uses username (e.g., /users/david), API resolves to full email
  const username = decodeURIComponent(params.email as string);

  const [data, setData] = useState<UserDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Show refreshing state when pending or loading with existing data
  const isRefreshing = isPending || (loading && data !== null);

  // Get full email from loaded data, fallback to username for display during load
  const email = data?.summary?.email || username;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(username)}?days=${days}`);
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || `Error: ${res.status}`);
      }
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load user data');
    } finally {
      setLoading(false);
    }
  }, [username, days]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const totalTokens = Number(data?.summary?.totalTokens || 0);
  const inputTokens = Number(data?.summary?.inputTokens || 0);
  const outputTokens = Number(data?.summary?.outputTokens || 0);
  const inputRatio = totalTokens > 0 ? (inputTokens / totalTokens) * 100 : 0;
  const outputRatio = totalTokens > 0 ? (outputTokens / totalTokens) * 100 : 0;

  // Calculate tool breakdown from model data (aggregated by tool)
  const toolBreakdown = useMemo<ToolBreakdown[]>(() => {
    if (!data?.modelBreakdown) return [];

    const byTool = data.modelBreakdown.reduce((acc, m) => {
      if (!acc[m.tool]) {
        acc[m.tool] = { tokens: 0, cost: 0 };
      }
      acc[m.tool].tokens += Number(m.tokens);
      acc[m.tool].cost += Number(m.cost);
      return acc;
    }, {} as Record<string, { tokens: number; cost: number }>);

    const total = Object.values(byTool).reduce((sum, t) => sum + t.tokens, 0);

    return Object.entries(byTool)
      .map(([tool, { tokens, cost }]) => ({
        tool,
        tokens,
        cost,
        percentage: total > 0 ? (tokens / total) * 100 : 0,
      }))
      .sort((a, b) => b.tokens - a.tokens);
  }, [data?.modelBreakdown]);

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white grid-bg">
      {/* Loading Progress Bar */}
      {isRefreshing && (
        <div className="fixed top-0 left-0 right-0 z-50 h-0.5 bg-amber-500/20 overflow-hidden">
          <div className="h-full bg-amber-500 animate-progress" />
        </div>
      )}

      {/* Header */}
      <header className="relative z-10 border-b border-white/5 px-4 sm:px-8 py-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <MainNav days={days} />
          <div className="flex items-center gap-3">
            <TimeRangeSelector value={days} onChange={setDays} isPending={isPending} />
            <div className="w-px h-6 bg-white/10 mx-1" />
            <UserMenu />
          </div>
        </div>
      </header>

      {/* User Breadcrumb */}
      <div className="border-b border-white/5 px-4 sm:px-8 py-3">
        <div className="flex items-center gap-2">
          <Link
            href={`/users?days=${days}`}
            className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/40 hover:text-white/60 transition-colors"
          >
            Users
          </Link>
          <span className="text-white/20">/</span>
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="font-mono text-[10px] uppercase tracking-[0.2em] text-amber-400"
          >
            {email}
          </motion.span>
        </div>
      </div>

      {/* Main Content */}
      <main className={`relative z-10 p-4 sm:p-8 transition-opacity duration-300 ${
        isRefreshing ? 'opacity-60' : 'opacity-100'
      }`}>
        {loading && !data ? (
          <div className="flex h-64 items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
              <span className="font-mono text-sm text-white/40">Loading...</span>
            </div>
          </div>
        ) : error ? (
          <div className="flex h-64 items-center justify-center">
            <div className="text-center">
              <div className="font-mono text-sm text-red-400 mb-2">Error loading user</div>
              <div className="font-mono text-xs text-white/40">{error}</div>
            </div>
          </div>
        ) : data?.summary ? (
          <div className="space-y-4 sm:space-y-6">
            {/* Stats Row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <StatCard
                label="Total Tokens"
                value={formatTokens(data.summary.totalTokens)}
                subValue={`across ${data.summary.daysActive} days`}
                accentColor="#ffffff"
                delay={0}
              />
              <StatCard
                label="Total Cost"
                value={formatCurrency(data.summary.totalCost)}
                subValue={`$${(data.summary.totalCost / Math.max(data.summary.daysActive, 1)).toFixed(2)}/day avg`}
                accentColor="#22c55e"
                delay={0.05}
              />
              <StatCard
                label="Avg per Day"
                value={formatTokens(Math.round(totalTokens / Math.max(data.summary.daysActive, 1)))}
                subValue="tokens"
                accentColor="#06b6d4"
                delay={0.15}
              />
            </div>

            {/* Tool Usage Breakdown */}
            {toolBreakdown.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="rounded-lg border border-white/5 bg-white/[0.02] p-4 sm:p-6"
              >
                <h3 className="font-mono text-xs uppercase tracking-wider text-white/60 mb-4">
                  Tool Usage
                </h3>

                {/* Stacked bar visualization */}
                <div className="mb-6">
                  <div className="h-3 rounded-full bg-white/5 overflow-hidden flex">
                    {toolBreakdown.map((t, i) => (
                      <motion.div
                        key={t.tool}
                        initial={{ width: 0 }}
                        animate={{ width: `${t.percentage}%` }}
                        transition={{ duration: 0.8, delay: 0.25 + i * 0.1 }}
                        className={`h-full ${getToolColor(t.tool).bg} ${i === 0 ? 'rounded-l-full' : ''} ${i === toolBreakdown.length - 1 ? 'rounded-r-full' : ''}`}
                      />
                    ))}
                  </div>
                </div>

                {/* Tool breakdown list */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {toolBreakdown.map((t, i) => {
                    const colors = getToolColor(t.tool);
                    return (
                      <motion.div
                        key={t.tool}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.3 + i * 0.05 }}
                        className="flex items-center justify-between p-3 rounded-lg bg-white/[0.02] border border-white/5"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-2 h-2 rounded-full ${colors.bg}`} />
                          <div>
                            <p className={`font-mono text-sm ${colors.text}`}>
                              {formatToolName(t.tool)}
                            </p>
                            <p className="font-mono text-[10px] text-white/40">
                              {t.percentage.toFixed(1)}% of usage
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-mono text-sm text-white">
                            {formatTokens(t.tokens)}
                          </p>
                          <p className="font-mono text-[10px] text-white/40">
                            {formatCurrency(t.cost)}
                          </p>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* Daily Usage Chart */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="rounded-lg border border-white/5 bg-white/[0.02] p-6"
            >
              <StackedBarChart
                data={data.dailyUsage}
                height={180}
              />
            </motion.div>

            {/* Two Column Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
              {/* Input/Output Breakdown */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
                className="rounded-lg border border-white/5 bg-white/[0.02] p-4 sm:p-6"
              >
                <h3 className="font-mono text-xs uppercase tracking-wider text-white/60 mb-6">
                  Token Breakdown
                </h3>

                <div className="space-y-5">
                  {/* Input Tokens */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-xs text-white/70">Input Tokens</span>
                      <span className="font-mono text-xs text-white">{formatTokens(inputTokens)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${inputRatio}%` }}
                        transition={{ duration: 0.8, delay: 0.3 }}
                        className="h-full rounded-full bg-gradient-to-r from-white/60 to-white/40"
                      />
                    </div>
                    <div className="mt-1 font-mono text-[10px] text-white/40">
                      {inputRatio.toFixed(1)}% of total tokens
                    </div>
                  </div>

                  {/* Output Tokens */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-xs text-white/70">Output Tokens</span>
                      <span className="font-mono text-xs text-white">{formatTokens(outputTokens)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${outputRatio}%` }}
                        transition={{ duration: 0.8, delay: 0.35 }}
                        className="h-full rounded-full bg-gradient-to-r from-emerald-500/80 to-emerald-400/60"
                      />
                    </div>
                    <div className="mt-1 font-mono text-[10px] text-white/40">
                      {outputRatio.toFixed(1)}% of total tokens
                    </div>
                  </div>

                  {/* Cache Read Tokens */}
                  {data.summary.cacheReadTokens > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-mono text-xs text-white/70">Cache Read</span>
                        <span className="font-mono text-xs text-white">{formatTokens(data.summary.cacheReadTokens)}</span>
                      </div>
                      <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min((data.summary.cacheReadTokens / totalTokens) * 100, 100)}%` }}
                          transition={{ duration: 0.8, delay: 0.4 }}
                          className="h-full rounded-full bg-gradient-to-r from-purple-500/80 to-purple-400/60"
                        />
                      </div>
                      <div className="mt-1 font-mono text-[10px] text-white/40">
                        Cached tokens (not counted in total)
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>

              {/* Model Breakdown */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="rounded-lg border border-white/5 bg-white/[0.02] p-4 sm:p-6"
              >
                <h3 className="font-mono text-xs uppercase tracking-wider text-white/60 mb-4 sm:mb-6">
                  Models Used
                </h3>

                <div className="space-y-3">
                  {data.modelBreakdown.slice(0, 6).map((model, i) => {
                    const maxTokens = data.modelBreakdown[0]?.tokens || 1;
                    const percentage = (model.tokens / maxTokens) * 100;
                    const displayName = formatModelName(model.model);
                    const colors = getToolColor(model.tool);

                    return (
                      <motion.div
                        key={`${model.model}-${model.tool}`}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.35 + i * 0.03 }}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <div className={`w-1.5 h-1.5 rounded-full ${colors.bg}`} />
                            <span className="font-mono text-xs text-white/80 truncate max-w-[180px]">
                              {displayName}
                            </span>
                          </div>
                          <span className="font-mono text-xs text-white/50">
                            {formatTokens(model.tokens)}
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${percentage}%` }}
                            transition={{ duration: 0.6, delay: 0.4 + i * 0.03 }}
                            className={`h-full rounded-full bg-gradient-to-r ${colors.gradient}`}
                          />
                        </div>
                      </motion.div>
                    );
                  })}
                  {data.modelBreakdown.length > 6 && (
                    <div className="font-mono text-[10px] text-white/30 pt-2">
                      +{data.modelBreakdown.length - 6} more models
                    </div>
                  )}
                </div>
              </motion.div>
            </div>

            {/* Activity Metadata */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 }}
              className="rounded-lg border border-white/5 bg-white/[0.02] p-4 sm:p-6"
            >
              <h3 className="font-mono text-xs uppercase tracking-wider text-white/60 mb-4">
                Activity
              </h3>
              <div className="grid grid-cols-3 gap-4 sm:gap-8">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-wider text-white/40 mb-1">First Active</p>
                  <p className="font-mono text-xs sm:text-sm text-white">{formatDate(data.summary.firstActive)}</p>
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-wider text-white/40 mb-1">Last Active</p>
                  <p className="font-mono text-xs sm:text-sm text-white">{formatDate(data.summary.lastActive)}</p>
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-wider text-white/40 mb-1">Days Active</p>
                  <p className="font-mono text-xs sm:text-sm text-white">{data.summary.daysActive}</p>
                </div>
              </div>
            </motion.div>
          </div>
        ) : (
          <div className="flex h-64 items-center justify-center">
            <div className="font-mono text-sm text-white/40">No data found for this user</div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function UserDetailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0a0a0f] text-white grid-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
          <span className="font-mono text-sm text-white/40">Loading...</span>
        </div>
      </div>
    }>
      <UserDetailContent />
    </Suspense>
  );
}
