'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { StatCard } from '@/components/StatCard';
import { UsageChart } from '@/components/UsageChart';
import { ModelBreakdown } from '@/components/ModelBreakdown';
import { UserTable } from '@/components/UserTable';
import { UserDetailPanel } from '@/components/UserDetailPanel';
import { SearchInput } from '@/components/SearchInput';
import { TimeRangeSelector } from '@/components/TimeRangeSelector';
import { MainNav } from '@/components/MainNav';
import { UserMenu } from '@/components/UserMenu';
import { formatTokens, formatCurrency } from '@/lib/utils';
import { useTimeRange } from '@/contexts/TimeRangeContext';

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

function DashboardContent() {
  const { days, setDays, isPending } = useTimeRange();

  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [trends, setTrends] = useState<DailyUsage[]>([]);
  const [models, setModels] = useState<ModelData[]>([]);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Show refreshing state when pending or loading with existing data
  const isRefreshing = isPending || (loading && stats !== null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, usersRes, trendsRes, modelsRes] = await Promise.all([
        fetch(`/api/stats?days=${days}`),
        fetch(`/api/users?limit=10&days=${days}`),
        fetch(`/api/trends?days=${days}`),
        fetch(`/api/models?days=${days}`),
      ]);

      const [statsData, usersData, trendsData, modelsData] = await Promise.all([
        statsRes.json(),
        usersRes.json(),
        trendsRes.json(),
        modelsRes.json(),
      ]);

      setStats(statsData);
      setUsers(usersData);
      setTrends(trendsData);
      setModels(modelsData);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  }, [days]);

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
      <header className="relative z-10 border-b border-white/5 px-4 sm:px-8 py-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <MainNav days={days} />
          <div className="flex items-center gap-3">
            <SearchInput days={days} placeholder="Search users..." />
            <TimeRangeSelector value={days} onChange={setDays} isPending={isPending} />
            <div className="w-px h-6 bg-white/10 mx-1" />
            <UserMenu />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className={`relative z-10 p-4 sm:p-8 transition-opacity duration-300 ${
        isRefreshing ? 'opacity-60' : 'opacity-100'
      }`}>
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
            {/* Unattributed Usage Alert */}
            {stats.unattributed && stats.unattributed.totalTokens > 0 && (
              <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 sm:px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="text-white/40 text-lg">⚠</span>
                  <div>
                    <p className="font-mono text-xs sm:text-sm text-white/60">
                      {formatTokens(stats.unattributed.totalTokens)} unattributed tokens ({formatCurrency(stats.unattributed.totalCost)})
                    </p>
                    <p className="font-mono text-[10px] sm:text-xs text-white/40">
                      Usage from API keys that aren't mapped to users
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Stats Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <StatCard
                label="Total Tokens"
                value={formatTokens(stats.totalTokens)}
                subValue="all time"
                delay={0}
              />
              <StatCard
                label="Estimated Cost"
                value={formatCurrency(stats.totalCost)}
                accentColor="#06b6d4"
                delay={0.1}
              />
              <StatCard
                label="Active Users"
                value={stats.activeUsers.toString()}
                subValue="with usage"
                accentColor="#10b981"
                delay={0.2}
              />
              <StatCard
                label="Avg per User"
                value={formatTokens(stats.activeUsers > 0 ? Math.round(stats.totalTokens / stats.activeUsers) : 0)}
                subValue="tokens"
                accentColor="#8b5cf6"
                delay={0.3}
              />
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
              <div className="lg:col-span-2">
                <UsageChart data={trends} />
              </div>
              <ModelBreakdown data={models} />
            </div>

            {/* Users Table */}
            <UserTable users={users} onUserClick={setSelectedUser} days={days} />
          </div>
        )}
      </main>

      {/* User Detail Panel */}
      <UserDetailPanel email={selectedUser} onClose={() => setSelectedUser(null)} days={days} />
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
