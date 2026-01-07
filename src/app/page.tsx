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
import { UserMenu } from '@/components/UserMenu';
import { LifetimeStats } from '@/components/LifetimeStats';
import { AdoptionDistribution } from '@/components/AdoptionDistribution';
import { PageContainer } from '@/components/PageContainer';
import { formatTokens, formatCurrency } from '@/lib/utils';
import { useTimeRange } from '@/contexts/TimeRangeContext';
import { type AdoptionStage } from '@/lib/adoption';

interface Stats {
  totalTokens: number;
  totalCost: number;
  activeUsers: number;
  claudeCodeTokens: number;
  cursorTokens: number;
  unattributed?: {
    totalTokens: number;
    totalCost: number;
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

      const [statsRes, usersRes, trendsRes, modelsRes, adoptionRes] = await Promise.all([
        fetch(`/api/stats?${params}`),
        fetch(`/api/users?limit=10&${params}`),
        fetch(`/api/trends?${params}`),
        fetch(`/api/models?${params}`),
        fetch(`/api/adoption?${params}`),
      ]);

      const [statsData, usersData, trendsData, modelsData, adoptionDataRes] = await Promise.all([
        statsRes.json(),
        usersRes.json(),
        trendsRes.json(),
        modelsRes.json(),
        adoptionRes.json(),
      ]);

      setStats(statsData);
      setUsers(usersData);
      setTrends(trendsData);
      setModels(modelsData);
      setAdoptionData(adoptionDataRes);
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
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <MainNav days={days} />
            <div className="flex items-center gap-3">
              <SearchInput days={days} placeholder="Search users..." />
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
                value={formatTokens(stats.totalTokens)}
                subValue={rangeLabel}
                delay={0}
              />
              <StatCard
                label="Estimated Cost"
                value={formatCurrency(stats.totalCost)}
                subValue={rangeLabel}
                accentColor="#06b6d4"
                delay={0.1}
              />
              <StatCard
                label="Active Users"
                value={stats.activeUsers.toString()}
                subValue={rangeLabel}
                accentColor="#10b981"
                delay={0.2}
              />
              <StatCard
                label="Avg per User"
                value={formatTokens(stats.activeUsers > 0 ? Math.round(stats.totalTokens / stats.activeUsers) : 0)}
                subValue={rangeLabel}
                accentColor="#8b5cf6"
                delay={0.3}
              />
            </div>

            {/* Adoption Distribution */}
            {adoptionData && (
              <AdoptionDistribution
                stages={adoptionData.stages}
                totalUsers={adoptionData.totalUsers}
                days={days}
              />
            )}

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
