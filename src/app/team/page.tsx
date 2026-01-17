'use client';

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Users } from 'lucide-react';
import { StatCard } from '@/components/StatCard';
import { InlineSearchInput } from '@/components/SearchInput';
import { AppHeader } from '@/components/AppHeader';
import { TimeRangeSelector } from '@/components/TimeRangeSelector';
import { UserLink } from '@/components/UserLink';
import { TipBar } from '@/components/TipBar';
import { PageContainer } from '@/components/PageContainer';
import { LoadingBar } from '@/components/LoadingBar';
import { LoadingState, ErrorState } from '@/components/PageState';
import { AnimatedCard } from '@/components/Card';
import { ToolSplitBar, type ToolSplitData } from '@/components/ToolSplitBar';
import { ExportButton } from '@/components/ExportButton';
import { useTimeRange } from '@/contexts/TimeRangeContext';
import { formatTokens, formatCurrency } from '@/lib/utils';

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
  daysSinceLastActive: number;
}

type SortKey = keyof UserPivotData;
type ColumnKey = SortKey | 'split';

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

const columns: { key: ColumnKey; label: string; align: 'left' | 'right'; format?: (v: number) => string; sortable?: boolean }[] = [
  { key: 'email', label: 'User', align: 'left' },
  { key: 'totalTokens', label: 'Total Tokens', align: 'right', format: formatTokens },
  { key: 'totalCost', label: 'Cost', align: 'right', format: formatCurrency },
  { key: 'split', label: 'Tools', align: 'left', sortable: false },
  { key: 'claudeCodeTokens', label: 'Claude Code', align: 'right', format: formatTokens },
  { key: 'cursorTokens', label: 'Cursor', align: 'right', format: formatTokens },
  { key: 'daysActive', label: 'Days Active', align: 'right', format: (v) => v.toString() },
  { key: 'avgTokensPerDay', label: 'Avg/Day', align: 'right', format: formatTokens },
  { key: 'lastActive', label: 'Last Active', align: 'right' },
];

const DEFAULT_COLUMNS: ColumnKey[] = ['email', 'totalTokens', 'totalCost', 'split', 'lastActive'];

function TeamPageContent() {
  const { range, setRange, days, isPending, getDateParams } = useTimeRange();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialSearch = searchParams.get('search') || '';

  const [users, setUsers] = useState<UserPivotData[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>('totalTokens');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [searchQuery, setSearchQuery] = useState(initialSearch);

  // Parse visible columns from URL
  const visibleColumns = useMemo(() => {
    const colsParam = searchParams.get('cols');
    if (colsParam) {
      const cols = colsParam.split(',').filter(c => columns.some(col => col.key === c)) as ColumnKey[];
      return new Set(cols.length > 0 ? cols : DEFAULT_COLUMNS);
    }
    return new Set(DEFAULT_COLUMNS);
  }, [searchParams]);

  const isRefreshing = isPending || (loading && users.length > 0);

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
      const usersRes = await fetch(`/api/users/pivot?${params}`);

      if (!usersRes.ok) {
        throw new Error('Failed to fetch team data');
      }

      const usersData = await usersRes.json();

      // Handle both old (array) and new ({ users, totalCount }) response formats
      if (Array.isArray(usersData)) {
        setUsers(usersData);
        setTotalUsers(usersData.length);
      } else {
        setUsers(usersData.users || []);
        setTotalUsers(usersData.totalCount || usersData.users?.length || 0);
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

  const handleSort = (key: SortKey) => {
    if (sortBy === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(key);
      setSortDir('desc');
    }
  };

  const toggleColumn = useCallback((key: ColumnKey) => {
    const newVisible = new Set(visibleColumns);
    if (newVisible.has(key)) {
      if (key !== 'email') newVisible.delete(key); // Always keep email
    } else {
      newVisible.add(key);
    }

    const newParams = new URLSearchParams(searchParams.toString());
    const colsArray = Array.from(newVisible);
    // Only set cols param if different from default
    const isDefault = colsArray.length === DEFAULT_COLUMNS.length &&
      colsArray.every(c => DEFAULT_COLUMNS.includes(c));
    if (isDefault) {
      newParams.delete('cols');
    } else {
      newParams.set('cols', colsArray.join(','));
    }
    router.push(`/team?${newParams.toString()}`, { scroll: false });
  }, [visibleColumns, searchParams, router]);

  const activeColumns = columns.filter(c => visibleColumns.has(c.key));

  // Calculate totals
  const totals = users.reduce(
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
              <p className="font-mono text-xs text-muted mt-1">
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
        {loading && users.length === 0 ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} />
        ) : (
          <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-1 max-w-xs">
              {/* Active Users Card */}
              <StatCard
                label="Active Users"
                days={days}
                value={totalUsers.toString()}
                suffix="users"
                icon={Users}
                accentColor="#06b6d4"
                delay={0}
              />
            </div>

            {/* Column Selector and Export */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-6">
                {/* Column Selector - hidden on mobile */}
                <div className="hidden md:flex items-center gap-1.5 flex-wrap">
                  {columns.map(col => (
                    <button
                      key={col.key}
                      onClick={() => toggleColumn(col.key)}
                      disabled={col.key === 'email'}
                      className={`px-2 py-1 rounded font-mono text-[11px] transition-colors whitespace-nowrap ${
                        visibleColumns.has(col.key)
                          ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                          : 'bg-white/5 text-muted border border-white/10 hover:bg-white/10'
                      } ${col.key === 'email' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      {col.label}
                    </button>
                  ))}
                </div>
              </div>
              <ExportButton type="team" search={searchQuery} />
            </div>

            {/* User Table */}
            <AnimatedCard padding="none" className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px]">
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
                    {users.length === 0 ? (
                      <tr>
                        <td colSpan={activeColumns.length} className="px-4 py-8 text-center">
                          <span className="font-mono text-sm text-muted">
                            No users found
                          </span>
                        </td>
                      </tr>
                    ) : (
                      users.map((user) => (
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
                  {users.length > 0 && (
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
                              <span className="text-white/60">Total ({users.length})</span>
                            ) : col.key in totals ? (
                              <span className="text-white">
                                {col.format!(totals[col.key as keyof typeof totals])}
                              </span>
                            ) : (
                              <span className="text-faint">-</span>
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
