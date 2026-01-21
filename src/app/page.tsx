'use client';

import { useState, useEffect, useCallback, Suspense, useMemo } from 'react';
import { StatCard } from '@/components/StatCard';
import { UsageChart } from '@/components/UsageChart';
import { ModelBreakdown } from '@/components/ModelBreakdown';
import { UserTable } from '@/components/UserTable';
import { SearchInput } from '@/components/SearchInput';
import { TipBar } from '@/components/TipBar';
import { TimeRangeSelector } from '@/components/TimeRangeSelector';
import { AppHeader } from '@/components/AppHeader';
import { LifetimeStats } from '@/components/LifetimeStats';
import { ToolDistribution } from '@/components/ToolDistribution';
import { CommitStats } from '@/components/CommitStats';
import { PageContainer } from '@/components/PageContainer';
import { LoadingBar } from '@/components/LoadingBar';
import { LoadingState, EmptyState } from '@/components/PageState';
import { formatTokens, formatCurrency } from '@/lib/utils';
import { useTimeRange } from '@/contexts/TimeRangeContext';
import { calculateDelta } from '@/lib/comparison';
import { Users, BarChart3, Zap, DollarSign, TrendingUp } from 'lucide-react';

interface Stats {
  totalTokens: number;
  totalCost: number;
  activeUsers: number;
  claudeCodeTokens: number;
  cursorTokens: number;
  claudeCodeUsers: number;
  cursorUsers: number;
  unattributed?: {
    totalTokens: number;
    totalCost: number;
  };
  previousPeriod?: {
    totalTokens: number;
    totalCost: number;
    activeUsers: number;
    claudeCodeTokens: number;
    cursorTokens: number;
    claudeCodeUsers: number;
    cursorUsers: number;
  };
}

interface LifetimeStatsData {
  totalTokens: number;
  totalCost: number;
  totalUsers: number;
  firstRecordDate: string | null;
  totalCommits: number;
  aiAttributedCommits: number;
}

interface UserSummary {
  email: string;
  totalTokens: number;
  totalCost: number;
  claudeCodeTokens: number;
  cursorTokens: number;
  favoriteModel: string;
  lastActive: string;
}

interface DailyUsage {
  date: string;
  claudeCode: number;
  cursor: number;
  cost: number;
  // Projection fields
  isIncomplete?: boolean;
  projectedClaudeCode?: number;
  projectedCursor?: number;
}

interface ModelData {
  model: string;
  tokens: number;
  percentage: number;
  tool: string;
}

interface CommitStatsData {
  totalCommits: number;
  aiAssistedCommits: number;
  aiAssistanceRate: number;
  toolBreakdown: {
    tool: string;
    commits: number;
  }[];
  repositoryCount: number;
  previousPeriod?: {
    totalCommits: number;
    aiAssistedCommits: number;
    aiAssistanceRate: number;
    repositoryCount: number;
  };
}

function DashboardContent() {
  const { range, setRange, days, isPending, getDateParams, getDisplayLabel } = useTimeRange();
  const rangeLabel = getDisplayLabel();

  const daysInPeriod = useMemo(() => {
    const { startDate, endDate } = getDateParams();
    const start = new Date(startDate);
    const end = new Date(endDate);
    return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
  }, [getDateParams]);

  const [stats, setStats] = useState<Stats | null>(null);
  const [lifetimeStats, setLifetimeStats] = useState<LifetimeStatsData | null>(null);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [trends, setTrends] = useState<DailyUsage[]>([]);
  const [models, setModels] = useState<ModelData[]>([]);
  const [commitStats, setCommitStats] = useState<CommitStatsData | null>(null);
  const [loading, setLoading] = useState(true);

  // Show refreshing state when pending or loading with existing data
  const isRefreshing = isPending || (loading && stats !== null);

  // Fetch lifetime stats once on mount
  useEffect(() => {
    fetch('/api/stats/lifetime')
      .then(res => res.json())
      .then(data => setLifetimeStats(data))
      .catch(() => { /* Lifetime stats are optional, fail silently */ });
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { startDate, endDate } = getDateParams();
      const params = new URLSearchParams({ startDate, endDate });

      const [statsRes, usersRes, trendsRes, modelsRes, commitsRes] = await Promise.all([
        fetch(`/api/stats?${params}&comparison=true`),
        fetch(`/api/users?limit=10&${params}`),
        fetch(`/api/trends?${params}`),
        fetch(`/api/models?${params}`),
        fetch(`/api/stats/commits?${params}&comparison=true`),
      ]);

      const [statsData, usersData, trendsData, modelsData, commitsData] = await Promise.all([
        statsRes.json(),
        usersRes.json(),
        trendsRes.json(),
        modelsRes.json(),
        commitsRes.json(),
      ]);

      setStats(statsData);
      setUsers(usersData);
      setTrends(trendsData.data);
      setModels(modelsData);
      setCommitStats(commitsData.totalCommits > 0 ? commitsData : null);
    } catch {
      // Errors are tracked by Sentry, no need for console logging
    } finally {
      setLoading(false);
    }
  }, [getDateParams]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const hasData = stats && stats.totalTokens > 0;

  return (
    <div className="min-h-screen bg-[#050507] text-white grid-bg">
      <LoadingBar isLoading={isRefreshing} />

      <AppHeader search={<SearchInput days={days} placeholder="Search users..." />} />

      <TipBar />

      {/* Lifetime Stats Strip */}
      {lifetimeStats && (
        <LifetimeStats
          totalCost={lifetimeStats.totalCost}
          totalTokens={lifetimeStats.totalTokens}
          firstRecordDate={lifetimeStats.firstRecordDate}
          totalCommits={lifetimeStats.totalCommits}
          aiAttributedCommits={lifetimeStats.aiAttributedCommits}
        />
      )}

      {/* Main Content */}
      <main className={`relative z-10 py-4 sm:py-8 transition-opacity duration-300 ${
        isRefreshing ? 'opacity-60' : 'opacity-100'
      }`}>
        <PageContainer>
        {loading && !stats ? (
          <LoadingState />
        ) : !hasData ? (
          <EmptyState
            icon={BarChart3}
            title="No usage data yet"
            description="Usage data will appear here once synced from Anthropic and Cursor APIs"
          />
        ) : (
          <div className="space-y-4 sm:space-y-6">
            {/* Time Range Selector */}
            <div className="flex items-center justify-end">
              <TimeRangeSelector value={range} onChange={setRange} isPending={isPending} />
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <StatCard
                label="Total Tokens"
                days={days}
                value={formatTokens(stats.totalTokens)}
                icon={Zap}
                trend={stats.previousPeriod ? calculateDelta(stats.totalTokens, stats.previousPeriod.totalTokens) : undefined}
                delay={0}
              >
                <p className="font-mono text-xs text-white/50">
                  {formatTokens(stats.activeUsers > 0 ? Math.round(stats.totalTokens / stats.activeUsers) : 0)} avg per user
                </p>
              </StatCard>
              <StatCard
                label="Estimated Cost"
                days={days}
                value={formatCurrency(stats.totalCost)}
                icon={DollarSign}
                trend={stats.previousPeriod ? calculateDelta(stats.totalCost, stats.previousPeriod.totalCost) : undefined}
                accentColor="#06b6d4"
                delay={0.1}
              >
                <p className="font-mono text-xs text-white/50">
                  {formatCurrency(stats.activeUsers > 0 ? stats.totalCost / stats.activeUsers : 0)} per user
                </p>
              </StatCard>
              <StatCard
                label="Active Users"
                days={days}
                value={stats.activeUsers.toString()}
                suffix="users"
                icon={Users}
                trend={stats.previousPeriod ? calculateDelta(stats.activeUsers, stats.previousPeriod.activeUsers) : undefined}
                accentColor="#10b981"
                delay={0.2}
              />
              <StatCard
                label="Avg per Day"
                days={days}
                value={formatTokens(Math.round(stats.totalTokens / daysInPeriod))}
                suffix="tokens"
                icon={TrendingUp}
                trend={stats.previousPeriod ? calculateDelta(
                  Math.round(stats.totalTokens / daysInPeriod),
                  Math.round(stats.previousPeriod.totalTokens / daysInPeriod)
                ) : undefined}
                accentColor="#8b5cf6"
                delay={0.3}
              />
            </div>

            {/* Tool Distribution & Commit Stats */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {stats && stats.totalTokens > 0 && (
                <ToolDistribution
                  tools={[
                    ...(stats.claudeCodeTokens > 0 || stats.claudeCodeUsers > 0 ? [{
                      tool: 'claude_code',
                      tokens: stats.claudeCodeTokens,
                      tokenPercentage: (stats.claudeCodeTokens / stats.totalTokens) * 100,
                      users: stats.claudeCodeUsers,
                      userPercentage: stats.activeUsers > 0 ? (stats.claudeCodeUsers / stats.activeUsers) * 100 : 0,
                    }] : []),
                    ...(stats.cursorTokens > 0 || stats.cursorUsers > 0 ? [{
                      tool: 'cursor',
                      tokens: stats.cursorTokens,
                      tokenPercentage: (stats.cursorTokens / stats.totalTokens) * 100,
                      users: stats.cursorUsers,
                      userPercentage: stats.activeUsers > 0 ? (stats.cursorUsers / stats.activeUsers) * 100 : 0,
                    }] : []),
                  ].sort((a, b) => b.tokens - a.tokens)}
                  totalTokens={stats.totalTokens}
                  totalUsers={stats.activeUsers}
                  days={days}
                  commitTools={commitStats?.toolBreakdown}
                  totalCommits={commitStats?.aiAssistedCommits}
                />
              )}

              {commitStats && (
                <CommitStats
                  totalCommits={commitStats.totalCommits}
                  aiAssistedCommits={commitStats.aiAssistedCommits}
                  aiAssistanceRate={commitStats.aiAssistanceRate}
                  days={days}
                  hideToolBreakdown
                  trend={commitStats.previousPeriod ? calculateDelta(commitStats.aiAssistanceRate, commitStats.previousPeriod.aiAssistanceRate) : undefined}
                />
              )}
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
              <div className="lg:col-span-2">
                <UsageChart data={trends} days={days} />
              </div>
              <ModelBreakdown data={models} days={days} />
            </div>

            {/* Users Table */}
            <UserTable users={users} days={days} />
          </div>
        )}
        </PageContainer>
      </main>
    </div>
  );
}

export default function Dashboard() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#050507] text-white grid-bg flex items-center justify-center">
        <div className="font-mono text-sm text-white/40">Loading...</div>
      </div>
    }>
      <DashboardContent />
    </Suspense>
  );
}
