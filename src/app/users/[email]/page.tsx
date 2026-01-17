'use client';

import { useState, useEffect, useCallback, Suspense, useMemo } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { useTimeRange } from '@/contexts/TimeRangeContext';
import { motion } from 'framer-motion';
import { RawUsageTable } from '@/components/RawUsageTable';
import { StatCard } from '@/components/StatCard';
import { UsageChart } from '@/components/UsageChart';
import { TimeRangeSelector } from '@/components/TimeRangeSelector';
import { TooltipContent } from '@/components/Tooltip';
import { AppHeader } from '@/components/AppHeader';
import { UserProfileHeader } from '@/components/UserProfileHeader';
import { TipBar } from '@/components/TipBar';
import { PageContainer } from '@/components/PageContainer';
import { formatTokens, formatCurrency, formatDate, formatModelName } from '@/lib/utils';
import { DOMAIN } from '@/lib/constants';
import { calculateDelta } from '@/lib/comparison';

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
  windsurf: {
    bg: 'bg-emerald-500',
    text: 'text-emerald-400',
    gradient: 'from-emerald-500/80 to-emerald-400/60',
  },
  github_copilot: {
    bg: 'bg-sky-500',
    text: 'text-sky-400',
    gradient: 'from-sky-500/80 to-sky-400/60',
  },
  codex: {
    bg: 'bg-teal-500',
    text: 'text-teal-400',
    gradient: 'from-teal-500/80 to-teal-400/60',
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
    github_copilot: 'GitHub Copilot',
    codex: 'Codex',
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
    lastActive: string;
    firstActive: string;
    daysActive: number;
  };
  lifetime: {
    totalTokens: number;
    totalCost: number;
    firstRecordDate: string | null;
    favoriteTool: string | null;
    recordDay: { date: string; tokens: number } | null;
  };
  commitStats?: {
    totalCommits: number;
    aiAssistedCommits: number;
    aiAssistanceRate: number;
    toolBreakdown: {
      tool: string;
      commits: number;
    }[];
  };
  modelBreakdown: {
    model: string;
    tokens: number;
    cost: number;
    tool: string;
  }[];
  dailyUsage: {
    date: string;
    claudeCode: number;
    cursor: number;
    cost: number;
  }[];
  previousPeriod?: {
    totalTokens: number;
    totalCost: number;
  };
}

function UserDetailContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { range, setRange, days, isPending, getDateParams } = useTimeRange();

  // URL uses username (e.g., /users/david), API resolves to full email
  const username = decodeURIComponent(params.email as string);

  // Tab state from URL
  const activeTab = searchParams.get('tab') || 'overview';

  const setActiveTab = useCallback((tab: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (tab === 'overview') {
      params.delete('tab');
      // Clear raw usage specific params
      params.delete('tool');
      params.delete('model');
      params.delete('page');
    } else {
      params.set('tab', tab);
    }
    router.push(`?${params.toString()}`, { scroll: false });
  }, [searchParams, router]);

  const [data, setData] = useState<UserDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Show refreshing state when pending or loading with existing data
  const isRefreshing = isPending || (loading && data !== null);

  // Get full email from loaded data, fallback to username@domain for display during load
  const email = data?.summary?.email || (username.includes('@') ? username : DOMAIN ? `${username}@${DOMAIN}` : username);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { startDate, endDate } = getDateParams();
      const params = new URLSearchParams({ startDate, endDate, comparison: 'true' });
      const res = await fetch(`/api/users/${encodeURIComponent(username)}?${params}`);
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
  }, [username, getDateParams]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const totalTokens = Number(data?.summary?.totalTokens || 0);

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
    <div className="min-h-screen bg-[#050507] text-white grid-bg">
      {/* Loading Progress Bar */}
      {isRefreshing && (
        <div className="fixed top-0 left-0 right-0 z-50 h-0.5 bg-amber-500/20 overflow-hidden">
          <div className="h-full bg-amber-500 animate-progress" />
        </div>
      )}

      <AppHeader />

      <TipBar />

      {/* User Profile Header */}
      <UserProfileHeader
        email={email}
        lifetime={data?.lifetime || null}
        days={days}
      />

      {/* Main Content */}
      <main className={`relative z-10 py-4 sm:py-8 transition-opacity duration-300 ${
        isRefreshing ? 'opacity-60' : 'opacity-100'
      }`}>
        <PageContainer>
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
            {/* Time Range Selector and Tab Navigation */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              {/* Tab Navigation */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setActiveTab('overview')}
                  className={`px-4 py-2 rounded font-mono text-xs transition-colors cursor-pointer ${
                    activeTab === 'overview'
                      ? 'bg-white/[0.08] text-white border-b-2 border-amber-500'
                      : 'text-white/50 hover:text-white/70 hover:bg-white/[0.04]'
                  }`}
                >
                  Overview
                </button>
                <button
                  onClick={() => setActiveTab('raw')}
                  className={`px-4 py-2 rounded font-mono text-xs transition-colors cursor-pointer ${
                    activeTab === 'raw'
                      ? 'bg-white/[0.08] text-white border-b-2 border-amber-500'
                      : 'text-white/50 hover:text-white/70 hover:bg-white/[0.04]'
                  }`}
                >
                  Raw Usage
                </button>
              </div>
              <TimeRangeSelector value={range} onChange={setRange} isPending={isPending} />
            </div>

            {/* Tab Content */}
            {activeTab === 'raw' ? (
              <RawUsageTable
                email={email}
                startDate={getDateParams().startDate}
                endDate={getDateParams().endDate}
              />
            ) : (
            <>
            {/* Stats Row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <StatCard
                label="Total Tokens"
                days={days}
                value={formatTokens(data.summary.totalTokens)}
                subValue={`across ${data.summary.daysActive} days`}
                trend={data.previousPeriod ? calculateDelta(Number(data.summary.totalTokens), data.previousPeriod.totalTokens) : undefined}
                accentColor="#ffffff"
                delay={0}
              />
              <StatCard
                label="Total Cost"
                days={days}
                value={formatCurrency(data.summary.totalCost)}
                subValue={`$${(data.summary.totalCost / Math.max(data.summary.daysActive, 1)).toFixed(2)}/day avg`}
                trend={data.previousPeriod ? calculateDelta(Number(data.summary.totalCost), data.previousPeriod.totalCost) : undefined}
                accentColor="#22c55e"
                delay={0.05}
              />
              <StatCard
                label="Avg per Day"
                days={days}
                value={formatTokens(Math.round(totalTokens / Math.max(data.summary.daysActive, 1)))}
                subValue="tokens"
                accentColor="#06b6d4"
                delay={0.15}
              />
              {data.commitStats && data.commitStats.totalCommits > 0 && (
                <StatCard
                  label="AI Attributed"
                  days={days}
                  value={`${data.commitStats.aiAssistanceRate}%`}
                  subValue={`${data.commitStats.aiAssistedCommits} of ${data.commitStats.totalCommits}`}
                  accentColor="#f59e0b"
                  delay={0.2}
                />
              )}
            </div>

            {/* Tool Usage Breakdown */}
            {toolBreakdown.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="rounded-lg border border-white/5 bg-white/[0.02] p-4 sm:p-6"
              >
                <h3 className="font-mono text-[11px] uppercase tracking-wider text-white/60 mb-4">
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
            >
              <UsageChart data={data.dailyUsage} days={days} />
            </motion.div>

            {/* Models Used - Full Width */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="rounded-lg border border-white/5 bg-white/[0.02] p-4 sm:p-6"
            >
              <h3 className="font-mono text-[11px] uppercase tracking-wider text-white/60 mb-4 sm:mb-6">
                Models Used
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {data.modelBreakdown.slice(0, 9).map((model, i) => {
                  const totalModelTokens = data.modelBreakdown.reduce((sum, m) => sum + Number(m.tokens), 0);
                  const percentage = totalModelTokens > 0 ? (Number(model.tokens) / totalModelTokens) * 100 : 0;
                  const displayName = formatModelName(model.model);
                  const colors = getToolColor(model.tool);

                  return (
                    <motion.div
                      key={`${model.model}-${model.tool}`}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.3 + i * 0.03 }}
                      className="p-3 rounded-lg bg-white/[0.02] border border-white/5"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`w-2 h-2 rounded-full ${colors.bg} shrink-0`} />
                          <span className="font-mono text-xs text-white/70 truncate">
                            {displayName}
                          </span>
                        </div>
                        <span className="font-mono text-[10px] text-white/40 shrink-0 ml-2">
                          {percentage.toFixed(1)}%
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between">
                        <span className="font-mono text-sm text-white">
                          {formatTokens(model.tokens)}
                        </span>
                        <span className="font-mono text-[10px] text-white/40">
                          {formatCurrency(model.cost)}
                        </span>
                      </div>
                      <div className="mt-2 h-1 rounded-full bg-white/5 overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${percentage}%` }}
                          transition={{ duration: 0.6, delay: 0.35 + i * 0.03 }}
                          className={`h-full rounded-full bg-gradient-to-r ${colors.gradient}`}
                        />
                      </div>
                    </motion.div>
                  );
                })}
              </div>
              {data.modelBreakdown.length > 9 && (
                <div className="font-mono text-[10px] text-faint pt-4 text-center">
                  +{data.modelBreakdown.length - 9} more models
                </div>
              )}
            </motion.div>

            {/* Weekly Activity Pattern */}
            {data.dailyUsage && data.dailyUsage.length > 0 && (() => {
              // Calculate tokens by day of week
              const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
              const byDayOfWeek = data.dailyUsage.reduce((acc, d) => {
                const dayIndex = new Date(d.date).getDay();
                acc[dayIndex] = (acc[dayIndex] || 0) + Number(d.claudeCode) + Number(d.cursor);
                return acc;
              }, {} as Record<number, number>);

              const maxDayTokens = Math.max(...Object.values(byDayOfWeek), 1);

              return (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="rounded-lg border border-white/5 bg-white/[0.02] p-4 sm:p-6"
                >
                  <h3 className="font-mono text-[11px] uppercase tracking-wider text-white/60 mb-4">
                    Weekly Pattern
                  </h3>
                  <div className="flex items-end justify-between gap-2">
                    {dayNames.map((day, i) => {
                      const tokens = byDayOfWeek[i] || 0;
                      const heightPx = maxDayTokens > 0 ? Math.round((tokens / maxDayTokens) * 64) : 0;
                      const isWeekend = i === 0 || i === 6;

                      return (
                        <div key={day} className="group relative flex-1 flex flex-col items-center gap-2">
                          <div className="h-16 w-full flex items-end">
                            <motion.div
                              initial={{ height: 0 }}
                              animate={{ height: heightPx }}
                              transition={{ duration: 0.6, delay: 0.35 + i * 0.05 }}
                              className={`w-full rounded-t ${isWeekend ? 'bg-white/20' : 'bg-gradient-to-t from-amber-500/60 to-amber-500'}`}
                              style={{ minHeight: tokens > 0 ? 4 : 0 }}
                            />
                          </div>
                          <span className={`font-mono text-[10px] ${isWeekend ? 'text-faint' : 'text-white/50'}`}>
                            {day}
                          </span>
                          {/* Tooltip */}
                          <TooltipContent zIndex={10}>
                            <div className="text-white/60">{day}</div>
                            <div className="text-amber-400">{formatTokens(tokens)}</div>
                          </TooltipContent>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              );
            })()}

            {/* Activity Metadata */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 }}
              className="rounded-lg border border-white/5 bg-white/[0.02] p-4 sm:p-6"
            >
              <h3 className="font-mono text-[11px] uppercase tracking-wider text-white/60 mb-4">
                Activity
              </h3>
              <div className="grid grid-cols-3 gap-4 sm:gap-8">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-wider text-white/60 mb-1">First Active</p>
                  <p className="font-mono text-xs sm:text-sm text-white">{formatDate(data.summary.firstActive)}</p>
                </div>
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-wider text-white/60 mb-1">Last Active</p>
                  <p className="font-mono text-xs sm:text-sm text-white">{formatDate(data.summary.lastActive)}</p>
                </div>
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-wider text-white/60 mb-1">Days Active</p>
                  <p className="font-mono text-xs sm:text-sm text-white">{data.summary.daysActive}</p>
                </div>
              </div>
            </motion.div>
            </>
            )}
          </div>
        ) : (
          <div className="flex h-64 items-center justify-center">
            <div className="font-mono text-sm text-white/40">No data found for this user</div>
          </div>
        )}
        </PageContainer>
      </main>
    </div>
  );
}

export default function UserDetailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#050507] text-white grid-bg flex items-center justify-center">
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
