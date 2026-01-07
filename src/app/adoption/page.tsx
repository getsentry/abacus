'use client';

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Compass, Flame, Zap, Star, Users, TrendingUp, Target } from 'lucide-react';
import { StatCard } from '@/components/StatCard';
import { MainNav } from '@/components/MainNav';
import { UserMenu } from '@/components/UserMenu';
import { TimeRangeSelector } from '@/components/TimeRangeSelector';
import { AdoptionFunnel } from '@/components/AdoptionFunnel';
import { AdoptionBadge } from '@/components/AdoptionBadge';
import { UserLink } from '@/components/UserLink';
import { TipBar } from '@/components/TipBar';
import { PageContainer } from '@/components/PageContainer';
import { useTimeRange } from '@/contexts/TimeRangeContext';
import { formatTokens } from '@/lib/utils';
import { type AdoptionStage, STAGE_CONFIG, STAGE_ORDER, isInactive } from '@/lib/adoption';

interface AdoptionSummary {
  stages: Record<AdoptionStage, { count: number; percentage: number; users: string[] }>;
  avgScore: number;
  inactive: { count: number; users: string[] };
  totalUsers: number;
  activeUsers: number;
}

interface UserPivotData {
  email: string;
  totalTokens: number;
  lastActive: string;
  adoptionStage: AdoptionStage;
  adoptionScore: number;
  daysSinceLastActive: number;
}

const STAGE_ICONS = {
  exploring: Compass,
  building_momentum: Flame,
  in_flow: Zap,
  power_user: Star,
} as const;

function AdoptionPageContent() {
  const { range, setRange, days, isPending, getDateParams } = useTimeRange();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [summary, setSummary] = useState<AdoptionSummary | null>(null);
  const [users, setUsers] = useState<UserPivotData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Get filter from URL or default to 'active' (hides inactive)
  const filterParam = searchParams.get('filter');
  const selectedStage: AdoptionStage | 'all' | 'active' | 'inactive' =
    filterParam === 'inactive' ? 'inactive' :
    filterParam === 'all' ? 'all' :
    STAGE_ORDER.includes(filterParam as AdoptionStage) ? filterParam as AdoptionStage :
    'active';

  // Update URL when filter changes
  const setSelectedStage = useCallback((stage: AdoptionStage | 'all' | 'active' | 'inactive') => {
    const params = new URLSearchParams(searchParams.toString());
    if (stage === 'active') {
      params.delete('filter'); // Default, no need to store
    } else {
      params.set('filter', stage);
    }
    router.push(`/adoption?${params.toString()}`, { scroll: false });
  }, [router, searchParams]);

  const isRefreshing = isPending || (loading && summary !== null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { startDate, endDate } = getDateParams();
      const [summaryRes, usersRes] = await Promise.all([
        fetch(`/api/adoption?startDate=${startDate}&endDate=${endDate}`),
        fetch(`/api/users/pivot?startDate=${startDate}&endDate=${endDate}`),
      ]);

      if (!summaryRes.ok || !usersRes.ok) {
        throw new Error('Failed to fetch adoption data');
      }

      const [summaryData, usersData] = await Promise.all([
        summaryRes.json(),
        usersRes.json(),
      ]);

      setSummary(summaryData);
      setUsers(usersData.users || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch data';
      console.error('Failed to fetch adoption data:', err);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [getDateParams]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Filter users based on selected stage (memoized)
  const filteredUsers = useMemo(() => {
    if (selectedStage === 'all') return users;
    if (selectedStage === 'active') {
      // Default: hide inactive users (30+ days)
      return users.filter(u => !isInactive(u.daysSinceLastActive));
    }
    if (selectedStage === 'inactive') {
      return users.filter(u => isInactive(u.daysSinceLastActive));
    }
    // Filter by specific stage AND only show active users
    return users.filter(u => u.adoptionStage === selectedStage && !isInactive(u.daysSinceLastActive));
  }, [users, selectedStage]);

  // Prepare funnel data
  const funnelData = summary
    ? STAGE_ORDER.map(stage => ({
        stage,
        count: summary.stages[stage]?.count || 0,
        percentage: summary.stages[stage]?.percentage || 0,
      }))
    : [];

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white grid-bg">
      {/* Loading Progress Bar */}
      {isRefreshing && (
        <div className="fixed top-0 left-0 right-0 z-50 h-0.5 bg-emerald-500/20 overflow-hidden">
          <div className="h-full bg-emerald-500 animate-progress" />
        </div>
      )}

      {/* Header */}
      <header className="relative z-20 border-b border-white/5">
        <PageContainer className="py-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <MainNav days={days} />
            <UserMenu />
          </div>
        </PageContainer>
      </header>

      <TipBar />

      {/* Page Title with Time Range Selector */}
      <div className="border-b border-white/5">
        <PageContainer className="py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-display text-2xl text-white">Adoption Overview</h1>
              <p className="font-mono text-xs text-white/40 mt-1">
                Track team progress across AI tool adoption stages
              </p>
            </div>
            <TimeRangeSelector value={range} onChange={setRange} isPending={isPending} />
          </div>
        </PageContainer>
      </div>

      {/* Main Content */}
      <main className={`relative z-10 py-4 sm:py-8 transition-opacity duration-300 ${
        isRefreshing ? 'opacity-60' : 'opacity-100'
      }`}>
        <PageContainer>
        {loading && !summary ? (
          <div className="flex h-64 items-center justify-center">
            <div className="font-mono text-sm text-white/40">Loading adoption data...</div>
          </div>
        ) : error ? (
          <div className="flex h-64 items-center justify-center">
            <div className="text-center">
              <div className="font-mono text-sm text-red-400 mb-2">Error loading data</div>
              <div className="font-mono text-xs text-white/40">{error}</div>
            </div>
          </div>
        ) : summary && (
          <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-3">
              {/* Average Score Card */}
              <StatCard
                label="Avg Adoption Score"
                days={days}
                value={summary.avgScore.toString()}
                suffix="/100"
                icon={TrendingUp}
                accentColor="#10b981"
                delay={0}
              >
                <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${summary.avgScore}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                    className="h-full rounded-full bg-gradient-to-r from-slate-500 via-amber-500 via-cyan-500 to-emerald-500"
                  />
                </div>
              </StatCard>

              {/* Active Users Card */}
              <StatCard
                label="Active Users"
                days={days}
                value={summary.activeUsers.toString()}
                suffix="users"
                icon={Users}
                accentColor="#06b6d4"
                delay={0.1}
              >
                <div className="flex gap-3">
                  {STAGE_ORDER.map(stage => {
                    const Icon = STAGE_ICONS[stage];
                    const count = summary.stages[stage]?.count || 0;
                    const config = STAGE_CONFIG[stage];
                    return (
                      <div key={stage} className="flex items-center gap-1">
                        <Icon className={`w-3 h-3 ${config.textColor}`} />
                        <span className={`font-mono text-xs ${config.textColor}`}>{count}</span>
                      </div>
                    );
                  })}
                </div>
              </StatCard>

              {/* Productive Users Card */}
              {(() => {
                const inFlowCount = summary.stages.in_flow?.count || 0;
                const powerUserCount = summary.stages.power_user?.count || 0;
                const productiveCount = inFlowCount + powerUserCount;
                const productivePercent = summary.activeUsers > 0
                  ? Math.round((productiveCount / summary.activeUsers) * 100)
                  : 0;
                return (
                  <StatCard
                    label="Productive"
                    days={days}
                    value={`${productivePercent}%`}
                    suffix="of active users"
                    subValue={`${productiveCount} users in flow or power user stage`}
                    icon={Target}
                    accentColor="#06b6d4"
                    delay={0.2}
                  />
                );
              })()}
            </div>

            {/* Funnel Visualization */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="rounded-lg border border-white/5 bg-white/[0.02] p-6"
            >
              <p className="font-mono text-[10px] uppercase tracking-wider text-white/40 mb-4">
                Adoption Funnel
              </p>
              <AdoptionFunnel
                data={funnelData}
                onStageClick={(stage) => setSelectedStage(stage === 'all' ? 'active' : stage)}
                selectedStage={selectedStage === 'all' || selectedStage === 'active' || selectedStage === 'inactive' ? null : selectedStage}
              />
            </motion.div>

            {/* User Table */}
            <div className="rounded-lg border border-white/5 bg-white/[0.02] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/[0.02]">
                      <th className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-wider text-white/60">
                        User
                      </th>
                      <th className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-wider text-white/60 w-32">
                        Stage
                      </th>
                      <th className="px-4 py-3 text-right font-mono text-[10px] uppercase tracking-wider text-white/60 w-20">
                        Score
                      </th>
                      <th className="px-4 py-3 text-right font-mono text-[10px] uppercase tracking-wider text-white/60 w-24">
                        Tokens
                      </th>
                      <th className="px-4 py-3 text-right font-mono text-[10px] uppercase tracking-wider text-white/60 w-28">
                        Last Active
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center">
                          <span className="font-mono text-sm text-white/30">
                            No users in this category
                          </span>
                        </td>
                      </tr>
                    ) : (
                      filteredUsers.slice(0, 50).map((user) => (
                        <tr
                          key={user.email}
                          className="border-b border-white/5 hover:bg-white/[0.02] transition-colors"
                        >
                          <td className="px-4 py-3">
                            <UserLink
                              email={user.email}
                              className="font-mono text-xs text-white truncate block"
                            />
                          </td>
                          <td className="px-4 py-3 w-32">
                            <AdoptionBadge
                              stage={user.adoptionStage}
                              size="sm"
                              isInactive={isInactive(user.daysSinceLastActive)}
                            />
                          </td>
                          <td className="px-4 py-3 text-right w-20 whitespace-nowrap">
                            <span className="font-mono text-xs text-white/60">{user.adoptionScore}</span>
                          </td>
                          <td className="px-4 py-3 text-right w-24 whitespace-nowrap">
                            <span className="font-mono text-xs text-white/60">
                              {formatTokens(user.totalTokens)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right w-28 whitespace-nowrap">
                            <span className="font-mono text-xs text-white/40">{user.lastActive}</span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
                {filteredUsers.length > 50 && (
                  <div className="px-4 py-3 border-t border-white/5 text-center">
                    <span className="font-mono text-xs text-white/30">
                      Showing 50 of {filteredUsers.length} users
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        </PageContainer>
      </main>
    </div>
  );
}

export default function AdoptionPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0a0a0f] text-white grid-bg flex items-center justify-center">
        <div className="font-mono text-sm text-white/40">Loading...</div>
      </div>
    }>
      <AdoptionPageContent />
    </Suspense>
  );
}
