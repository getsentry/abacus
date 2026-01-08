'use client';

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Users, TrendingUp, Target } from 'lucide-react';
import { StatCard } from '@/components/StatCard';
import { InlineSearchInput } from '@/components/SearchInput';
import { AppHeader } from '@/components/AppHeader';
import { TimeRangeSelector } from '@/components/TimeRangeSelector';
import { AdoptionFunnel } from '@/components/AdoptionFunnel';
import { AdoptionBadge } from '@/components/AdoptionBadge';
import { UserLink } from '@/components/UserLink';
import { TipBar } from '@/components/TipBar';
import { PageContainer } from '@/components/PageContainer';
import { LoadingBar } from '@/components/LoadingBar';
import { LoadingState, ErrorState } from '@/components/PageState';
import { AnimatedCard } from '@/components/Card';
import { ToolSplitBar, type ToolSplitData } from '@/components/ToolSplitBar';
import { useTimeRange } from '@/contexts/TimeRangeContext';
import { formatTokens, formatCurrency } from '@/lib/utils';
import { type AdoptionStage, STAGE_CONFIG, STAGE_ORDER, STAGE_ICONS, isInactive } from '@/lib/adoption';
import { calculateDelta } from '@/lib/comparison';

interface AdoptionSummary {
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

interface UserPivotData {
  email: string;
  totalTokens: number;
  totalCost: number;
  claudeCodeTokens: number;
  cursorTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  firstActive: string;
  lastActive: string;
  daysActive: number;
  avgTokensPerDay: number;
  toolCount: number;
  hasThinkingModels: boolean;
  adoptionScore: number;
  adoptionStage: AdoptionStage;
  daysSinceLastActive: number;
}

type SortKey = keyof UserPivotData;
type ColumnKey = SortKey | 'split';

type FilterType = AdoptionStage | 'all' | 'active' | 'inactive';

// Build tool breakdown from user data
function getToolBreakdownFromUser(user: UserPivotData): ToolSplitData[] {
  const tools: ToolSplitData[] = [];
  if (user.claudeCodeTokens > 0) {
    tools.push({ tool: 'claude_code', value: Number(user.claudeCodeTokens) });
  }
  if (user.cursorTokens > 0) {
    tools.push({ tool: 'cursor', value: Number(user.cursorTokens) });
  }
  return tools.sort((a, b) => b.value - a.value);
}

const columns: { key: ColumnKey; label: string; align: 'left' | 'right'; format?: (v: number) => string; isAdoption?: boolean; sortable?: boolean }[] = [
  { key: 'email', label: 'User', align: 'left' },
  { key: 'adoptionStage', label: 'Stage', align: 'left', isAdoption: true },
  { key: 'adoptionScore', label: 'Score', align: 'right', format: (v) => v.toString() },
  { key: 'totalTokens', label: 'Total Tokens', align: 'right', format: formatTokens },
  { key: 'totalCost', label: 'Cost', align: 'right', format: formatCurrency },
  { key: 'split', label: 'Split', align: 'left', sortable: false },
  { key: 'claudeCodeTokens', label: 'Claude Code', align: 'right', format: formatTokens },
  { key: 'cursorTokens', label: 'Cursor', align: 'right', format: formatTokens },
  { key: 'daysActive', label: 'Days Active', align: 'right', format: (v) => v.toString() },
  { key: 'avgTokensPerDay', label: 'Avg/Day', align: 'right', format: formatTokens },
  { key: 'lastActive', label: 'Last Active', align: 'right' },
];

const filterTabs: { key: FilterType; label: string }[] = [
  { key: 'active', label: 'All Active' },
  { key: 'exploring', label: 'Exploring' },
  { key: 'building_momentum', label: 'Building' },
  { key: 'in_flow', label: 'In Flow' },
  { key: 'power_user', label: 'Power User' },
  { key: 'inactive', label: 'Inactive' },
  { key: 'all', label: 'All Users' },
];

function TeamPageContent() {
  const { range, setRange, days, isPending, getDateParams } = useTimeRange();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialSearch = searchParams.get('search') || '';

  const [summary, setSummary] = useState<AdoptionSummary | null>(null);
  const [users, setUsers] = useState<UserPivotData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>('totalTokens');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnKey>>(
    new Set(['email', 'adoptionStage', 'totalTokens', 'totalCost', 'split', 'avgTokensPerDay', 'lastActive'])
  );

  // Get filter from URL or default to 'active' (hides inactive)
  const filterParam = searchParams.get('filter');
  const selectedFilter: FilterType =
    filterParam === 'inactive' ? 'inactive' :
    filterParam === 'all' ? 'all' :
    STAGE_ORDER.includes(filterParam as AdoptionStage) ? filterParam as AdoptionStage :
    'active';

  // Update URL when filter changes
  const setSelectedFilter = useCallback((filter: FilterType) => {
    const params = new URLSearchParams(searchParams.toString());
    if (filter === 'active') {
      params.delete('filter'); // Default, no need to store
    } else {
      params.set('filter', filter);
    }
    router.push(`/team?${params.toString()}`, { scroll: false });
  }, [router, searchParams]);

  const isRefreshing = isPending || (loading && summary !== null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { startDate, endDate } = getDateParams();
      const params = new URLSearchParams({
        sortBy,
        sortDir,
        startDate,
        endDate,
        ...(searchQuery && { search: searchQuery }),
      });
      const [summaryRes, usersRes] = await Promise.all([
        fetch(`/api/adoption?startDate=${startDate}&endDate=${endDate}&comparison=true`),
        fetch(`/api/users/pivot?${params}`),
      ]);

      if (!summaryRes.ok || !usersRes.ok) {
        throw new Error('Failed to fetch team data');
      }

      const [summaryData, usersData] = await Promise.all([
        summaryRes.json(),
        usersRes.json(),
      ]);

      setSummary(summaryData);
      // Handle both old (array) and new ({ users, totalCount }) response formats
      if (Array.isArray(usersData)) {
        setUsers(usersData);
      } else {
        setUsers(usersData.users || []);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch data';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [getDateParams, sortBy, sortDir, searchQuery]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Filter users based on selected filter (memoized)
  const filteredUsers = useMemo(() => {
    if (selectedFilter === 'all') return users;
    if (selectedFilter === 'active') {
      // Default: hide inactive users (30+ days)
      return users.filter(u => !isInactive(u.daysSinceLastActive));
    }
    if (selectedFilter === 'inactive') {
      return users.filter(u => isInactive(u.daysSinceLastActive));
    }
    // Filter by specific stage AND only show active users
    return users.filter(u => u.adoptionStage === selectedFilter && !isInactive(u.daysSinceLastActive));
  }, [users, selectedFilter]);

  // Prepare funnel data
  const funnelData = summary
    ? STAGE_ORDER.map(stage => ({
        stage,
        count: summary.stages[stage]?.count || 0,
        percentage: summary.stages[stage]?.percentage || 0,
      }))
    : [];

  const handleSort = (key: SortKey) => {
    if (sortBy === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(key);
      setSortDir('desc');
    }
  };

  const toggleColumn = (key: ColumnKey) => {
    const newVisible = new Set(visibleColumns);
    if (newVisible.has(key)) {
      if (key !== 'email') newVisible.delete(key); // Always keep email
    } else {
      newVisible.add(key);
    }
    setVisibleColumns(newVisible);
  };

  const activeColumns = columns.filter(c => visibleColumns.has(c.key));

  // Calculate totals
  const totals = filteredUsers.reduce(
    (acc, u) => ({
      totalTokens: acc.totalTokens + Number(u.totalTokens),
      totalCost: acc.totalCost + Number(u.totalCost),
      claudeCodeTokens: acc.claudeCodeTokens + Number(u.claudeCodeTokens),
      cursorTokens: acc.cursorTokens + Number(u.cursorTokens),
    }),
    { totalTokens: 0, totalCost: 0, claudeCodeTokens: 0, cursorTokens: 0 }
  );

  return (
    <div className="min-h-screen bg-[#050507] text-white grid-bg">
      <LoadingBar isLoading={isRefreshing} />

      <AppHeader
        search={
          <InlineSearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Filter users..."
          />
        }
      />

      <TipBar />

      {/* Page Title with Time Range Selector */}
      <div className="border-b border-white/5">
        <PageContainer className="py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-display text-2xl text-white">Team</h1>
              <p className="font-mono text-xs text-white/40 mt-1">
                Track team members and AI tool adoption
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
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} />
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
                trend={summary.previousPeriod ? calculateDelta(summary.avgScore, summary.previousPeriod.avgScore) : undefined}
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
                trend={summary.previousPeriod ? calculateDelta(summary.activeUsers, summary.previousPeriod.activeUsers) : undefined}
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
                // Calculate previous period productive percentage for proper comparison
                const prev = summary.previousPeriod;
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
                    accentColor="#06b6d4"
                    trend={prev ? calculateDelta(productivePercent, prevProductivePercent) : undefined}
                    delay={0.2}
                  >
                    <p className="font-mono text-xs text-white/50">
                      {productiveCount} in flow or power user
                    </p>
                  </StatCard>
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
              <p className="font-mono text-xs uppercase tracking-wider text-white/60 mb-4">
                Adoption Funnel
              </p>
              <AdoptionFunnel
                data={funnelData}
                onStageClick={(stage) => setSelectedFilter(stage === 'all' ? 'active' : stage)}
                selectedStage={selectedFilter === 'all' || selectedFilter === 'active' || selectedFilter === 'inactive' ? null : selectedFilter}
              />
            </motion.div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2">
              {filterTabs.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setSelectedFilter(tab.key)}
                  className={`px-3 py-1.5 rounded font-mono text-xs transition-all duration-200 whitespace-nowrap ${
                    selectedFilter === tab.key
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      : 'bg-white/5 text-white/40 border border-white/10 hover:bg-white/10 hover:text-white/60'
                  }`}
                >
                  {tab.label}
                  {tab.key !== 'all' && tab.key !== 'active' && tab.key !== 'inactive' && summary && (
                    <span className="ml-1.5 text-white/30">
                      {summary.stages[tab.key]?.count || 0}
                    </span>
                  )}
                  {tab.key === 'inactive' && summary && (
                    <span className="ml-1.5 text-white/30">{summary.inactive.count}</span>
                  )}
                </button>
              ))}
            </div>

            {/* Column Selector */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2">
              <span className="font-mono text-[11px] uppercase tracking-wider text-white/40 mr-2">Columns:</span>
              {columns.map(col => (
                <button
                  key={col.key}
                  onClick={() => toggleColumn(col.key)}
                  disabled={col.key === 'email'}
                  className={`px-2 py-1 rounded font-mono text-[11px] transition-colors whitespace-nowrap ${
                    visibleColumns.has(col.key)
                      ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                      : 'bg-white/5 text-white/40 border border-white/10 hover:bg-white/10'
                  } ${col.key === 'email' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  {col.label}
                </button>
              ))}
            </div>

            {/* User Table */}
            <AnimatedCard padding="none" className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/[0.02]">
                      {activeColumns.map(col => {
                        const isSortable = col.sortable !== false && col.key !== 'split';
                        return (
                          <th
                            key={col.key}
                            onClick={isSortable ? () => handleSort(col.key as SortKey) : undefined}
                            className={`px-4 py-3 font-mono text-[11px] uppercase tracking-wider text-white/60 transition-colors ${
                              col.align === 'right' ? 'text-right' : 'text-left'
                            } ${isSortable ? 'cursor-pointer hover:text-white' : ''}`}
                          >
                            <div className={`flex items-center gap-1 ${col.align === 'right' ? 'justify-end' : ''}`}>
                              {col.label}
                              {sortBy === col.key && (
                                <span className="text-amber-400">
                                  {sortDir === 'asc' ? '↑' : '↓'}
                                </span>
                              )}
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan={activeColumns.length} className="px-4 py-8 text-center">
                          <span className="font-mono text-sm text-white/30">
                            No users in this category
                          </span>
                        </td>
                      </tr>
                    ) : (
                      filteredUsers.map((user) => (
                        <tr
                          key={user.email}
                          className="border-b border-white/5 hover:bg-white/[0.02] transition-colors"
                        >
                          {activeColumns.map(col => (
                            <td
                              key={col.key}
                              className={`px-4 py-3 font-mono text-xs ${
                                col.align === 'right' ? 'text-right' : 'text-left'
                              }`}
                            >
                              {col.key === 'email' ? (
                                <UserLink email={user.email} className="text-white" />
                              ) : col.isAdoption ? (
                                <AdoptionBadge
                                  stage={user.adoptionStage}
                                  size="sm"
                                  isInactive={isInactive(user.daysSinceLastActive)}
                                />
                              ) : col.key === 'split' ? (
                                <ToolSplitBar
                                  data={getToolBreakdownFromUser(user)}
                                  total={Number(user.totalTokens)}
                                  valueType="tokens"
                                  minWidth="80px"
                                />
                              ) : col.key === 'claudeCodeTokens' ? (
                                <span className="text-amber-400/80">{col.format!(user[col.key] as number)}</span>
                              ) : col.key === 'cursorTokens' ? (
                                <span className="text-cyan-400/80">{col.format!(user[col.key] as number)}</span>
                              ) : col.format ? (
                                <span className="text-white/70">{col.format(user[col.key as SortKey] as number)}</span>
                              ) : (
                                <span className="text-white/50">{user[col.key as SortKey]}</span>
                              )}
                            </td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                  {filteredUsers.length > 0 && (
                    <tfoot>
                      <tr className="border-t border-white/10 bg-white/[0.03]">
                        {activeColumns.map(col => (
                          <td
                            key={col.key}
                            className={`px-4 py-3 font-mono text-xs font-medium ${
                              col.align === 'right' ? 'text-right' : 'text-left'
                            }`}
                          >
                            {col.key === 'email' ? (
                              <span className="text-white/60">Total ({filteredUsers.length})</span>
                            ) : col.key in totals ? (
                              <span className="text-white">
                                {col.format!(totals[col.key as keyof typeof totals])}
                              </span>
                            ) : (
                              <span className="text-white/30">-</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </AnimatedCard>
          </div>
        )}
        </PageContainer>
      </main>
    </div>
  );
}

export default function TeamPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#050507] text-white grid-bg flex items-center justify-center">
        <div className="font-mono text-sm text-white/40">Loading...</div>
      </div>
    }>
      <TeamPageContent />
    </Suspense>
  );
}
