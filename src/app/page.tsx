'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { StatCard } from '@/components/StatCard';
import { UsageChart } from '@/components/UsageChart';
import { ModelBreakdown } from '@/components/ModelBreakdown';
import { UserTable } from '@/components/UserTable';
import { SearchInput } from '@/components/SearchInput';
import { TipBar } from '@/components/TipBar';
import { TimeRangeSelector } from '@/components/TimeRangeSelector';
import { MainNav } from '@/components/MainNav';
import { MobileNav } from '@/components/MobileNav';
import { UserMenu } from '@/components/UserMenu';
import { LifetimeStats } from '@/components/LifetimeStats';
import { AdoptionDistribution } from '@/components/AdoptionDistribution';
import { ToolDistribution } from '@/components/ToolDistribution';
import { CommitStats } from '@/components/CommitStats';
import { PageContainer } from '@/components/PageContainer';
import { formatTokens, formatCurrency } from '@/lib/utils';
import { useTimeRange } from '@/contexts/TimeRangeContext';
import { type AdoptionStage, STAGE_CONFIG, STAGE_ORDER } from '@/lib/adoption';
import { calculateDelta } from '@/lib/comparison';
import { Compass, Flame, Zap, Star, Users, Target } from 'lucide-react';

const STAGE_ICONS = {
  exploring: Compass,
  building_momentum: Flame,
  in_flow: Zap,
  power_user: Star,
} as const;

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
}

interface ModelData {
  model: string;
  tokens: number;
  percentage: number;
  tool: string;
}

interface AdoptionData {
  stages: Record<AdoptionStage, { count: number; percentage: number; users: string[] }>;
  avgScore: number;
  inactive: { count: number; users: string[] };
  totalUsers: number;
  activeUsers: number;
  previousPeriod?: {
    avgScore: number;
    activeUsers: number;
    inFlowCount: number;
    powerUserCount: number;
  };
}

interface CommitStatsData {
  totalCommits: number;
  aiAssistedCommits: number;
  aiAssistanceRate: number;
  totalAdditions: number;
  totalDeletions: number;
  aiAdditions: number;
  aiDeletions: number;
  toolBreakdown: {
    tool: string;
    commits: number;
    additions: number;
    deletions: number;
  }[];
  repositoryCount: number;
}

function DashboardContent() {
  const { range, setRange, days, isPending, getDateParams, getDisplayLabel } = useTimeRange();
  const rangeLabel = getDisplayLabel();

  const [stats, setStats] = useState<Stats | null>(null);
  const [lifetimeStats, setLifetimeStats] = useState<LifetimeStatsData | null>(null);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [trends, setTrends] = useState<DailyUsage[]>([]);
  const [models, setModels] = useState<ModelData[]>([]);
  const [adoptionData, setAdoptionData] = useState<AdoptionData | null>(null);
  const [commitStats, setCommitStats] = useState<CommitStatsData | null>(null);
  const [loading, setLoading] = useState(true);

  // Show refreshing state when pending or loading with existing data
  const isRefreshing = isPending || (loading && stats !== null);

  // Fetch lifetime stats once on mount
  useEffect(() => {
    fetch('/api/stats/lifetime')
      .then(res => res.json())
      .then(data => setLifetimeStats(data))
      .catch(err => console.error('Failed to fetch lifetime stats:', err));
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { startDate, endDate } = getDateParams();
      const params = new URLSearchParams({ startDate, endDate });

      const [statsRes, usersRes, trendsRes, modelsRes, adoptionRes, commitsRes] = await Promise.all([
        fetch(`/api/stats?${params}&comparison=true`),
        fetch(`/api/users?limit=10&${params}`),
        fetch(`/api/trends?${params}`),
        fetch(`/api/models?${params}`),
        fetch(`/api/adoption?${params}&comparison=true`),
        fetch(`/api/stats/commits?${params}`),
      ]);

      const [statsData, usersData, trendsData, modelsData, adoptionDataRes, commitsData] = await Promise.all([
        statsRes.json(),
        usersRes.json(),
        trendsRes.json(),
        modelsRes.json(),
        adoptionRes.json(),
        commitsRes.json(),
      ]);

      setStats(statsData);
      setUsers(usersData);
      setTrends(trendsData);
      setModels(modelsData);
      setAdoptionData(adoptionDataRes);
      setCommitStats(commitsData.totalCommits > 0 ? commitsData : null);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  }, [getDateParams]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const hasData = stats && stats.totalTokens > 0;

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white grid-bg">
      {/* Loading Progress Bar */}
      {isRefreshing && (
        <div className="fixed top-0 left-0 right-0 z-50 h-0.5 bg-amber-500/20 overflow-hidden">
          <div className="h-full bg-amber-500 animate-progress" />
        </div>
      )}

      {/* Header */}
      <header className="relative z-20 border-b border-white/5">
        <PageContainer className="py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <MobileNav days={days} />
              <MainNav days={days} />
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden sm:block">
                <SearchInput days={days} placeholder="Search users..." />
              </div>
              <UserMenu />
            </div>
          </div>
        </PageContainer>
      </header>

      <TipBar />

      {/* Lifetime Stats Strip */}
      {lifetimeStats && (
        <LifetimeStats
          totalCost={lifetimeStats.totalCost}
          totalTokens={lifetimeStats.totalTokens}
          firstRecordDate={lifetimeStats.firstRecordDate}
        />
      )}

      {/* Main Content */}
      <main className={`relative z-10 py-4 sm:py-8 transition-opacity duration-300 ${
        isRefreshing ? 'opacity-60' : 'opacity-100'
      }`}>
        <PageContainer>
        {loading && !stats ? (
          <div className="flex h-64 items-center justify-center">
            <div className="font-mono text-sm text-white/40">Loading...</div>
          </div>
        ) : !hasData ? (
          <div className="flex flex-col items-center justify-center py-20 px-4">
            <div className="text-6xl mb-4">📊</div>
            <h2 className="font-display text-2xl text-white mb-2 text-center">No usage data yet</h2>
            <p className="font-mono text-sm text-white/40 text-center">
              Usage data will appear here once synced from Anthropic and Cursor APIs
            </p>
          </div>
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
              >
                {adoptionData && (
                  <div className="flex gap-3">
                    {STAGE_ORDER.map(stage => {
                      const Icon = STAGE_ICONS[stage];
                      const count = adoptionData.stages[stage]?.count || 0;
                      const config = STAGE_CONFIG[stage];
                      return (
                        <div key={stage} className="flex items-center gap-1">
                          <Icon className={`w-3 h-3 ${config.textColor}`} />
                          <span className={`font-mono text-xs ${config.textColor}`}>{count}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </StatCard>
              {(() => {
                const inFlowCount = adoptionData?.stages.in_flow?.count || 0;
                const powerUserCount = adoptionData?.stages.power_user?.count || 0;
                const productiveCount = inFlowCount + powerUserCount;
                const productivePercent = stats.activeUsers > 0
                  ? Math.round((productiveCount / stats.activeUsers) * 100)
                  : 0;
                // Calculate previous period productive percentage for trend
                const prev = adoptionData?.previousPeriod;
                const prevProductiveCount = prev ? (prev.inFlowCount + prev.powerUserCount) : 0;
                const prevProductivePercent = prev && prev.activeUsers > 0
                  ? Math.round((prevProductiveCount / prev.activeUsers) * 100)
                  : 0;
                return (
                  <StatCard
                    label="Productive"
                    days={days}
                    value={`${productivePercent}%`}
                    suffix="of active users"
                    icon={Target}
                    accentColor="#8b5cf6"
                    trend={prev ? calculateDelta(productivePercent, prevProductivePercent) : undefined}
                    delay={0.3}
                  >
                    <p className="font-mono text-xs text-white/50">
                      {productiveCount} in flow or power user
                    </p>
                  </StatCard>
                );
              })()}
            </div>

            {/* Adoption & Tool Distribution - Side by Side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {adoptionData && (
                <AdoptionDistribution
                  stages={adoptionData.stages}
                  totalUsers={adoptionData.totalUsers}
                  days={days}
                />
              )}

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
                />
              )}

              {commitStats && (
                <CommitStats
                  totalCommits={commitStats.totalCommits}
                  aiAssistedCommits={commitStats.aiAssistedCommits}
                  aiAssistanceRate={commitStats.aiAssistanceRate}
                  aiAdditions={commitStats.aiAdditions}
                  aiDeletions={commitStats.aiDeletions}
                  toolBreakdown={commitStats.toolBreakdown}
                  days={days}
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
      <div className="min-h-screen bg-[#0a0a0f] text-white grid-bg flex items-center justify-center">
        <div className="font-mono text-sm text-white/40">Loading...</div>
      </div>
    }>
      <DashboardContent />
    </Suspense>
  );
}
