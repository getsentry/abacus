'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { InlineSearchInput } from '@/components/SearchInput';
import { TimeRangeSelector } from '@/components/TimeRangeSelector';
import { AppHeader } from '@/components/AppHeader';
import { AdoptionBadge } from '@/components/AdoptionBadge';
import { UserLink } from '@/components/UserLink';
import { TipBar } from '@/components/TipBar';
import { PageContainer } from '@/components/PageContainer';
import { LoadingBar } from '@/components/LoadingBar';
import { LoadingState, ErrorState } from '@/components/PageState';
import { formatTokens, formatCurrency } from '@/lib/utils';
import { useTimeRange } from '@/contexts/TimeRangeContext';
import { type AdoptionStage, isInactive } from '@/lib/adoption';
import { ToolSplitBar, type ToolSplitData } from '@/components/ToolSplitBar';
import { AnimatedCard } from '@/components/Card';

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
  { key: 'totalTokens', label: 'Total Tokens', align: 'right', format: formatTokens },
  { key: 'totalCost', label: 'Cost', align: 'right', format: formatCurrency },
  { key: 'split', label: 'Split', align: 'left', sortable: false },
  { key: 'claudeCodeTokens', label: 'Claude Code', align: 'right', format: formatTokens },
  { key: 'cursorTokens', label: 'Cursor', align: 'right', format: formatTokens },
  { key: 'daysActive', label: 'Days Active', align: 'right', format: (v) => v.toString() },
  { key: 'avgTokensPerDay', label: 'Avg/Day', align: 'right', format: formatTokens },
  { key: 'lastActive', label: 'Last Active', align: 'right' },
];

function UsersPageContent() {
  const { range, setRange, days, isPending, getDateParams, getDisplayLabel } = useTimeRange();
  const rangeLabel = getDisplayLabel();
  const searchParams = useSearchParams();
  const initialSearch = searchParams.get('search') || '';

  const [users, setUsers] = useState<UserPivotData[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Show refreshing state when pending or loading with existing data
  const isRefreshing = isPending || (loading && users.length > 0);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>('totalTokens');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnKey>>(
    new Set(['email', 'adoptionStage', 'totalTokens', 'totalCost', 'split', 'avgTokensPerDay', 'lastActive'])
  );

  const fetchUsers = useCallback(async () => {
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
      const res = await fetch(`/api/users/pivot?${params}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `API error: ${res.status}`);
      }
      // Handle both old (array) and new ({ users, totalCount }) response formats
      if (Array.isArray(data)) {
        setUsers(data);
        setTotalCount(data.length);
      } else {
        setUsers(data.users || []);
        setTotalCount(data.totalCount || 0);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch users';
      setError(message);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [sortBy, sortDir, searchQuery, getDateParams]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

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
        <PageContainer className="py-3">
          <div className="flex items-center justify-between">
            <h2 className="font-mono text-xs uppercase tracking-wider text-white/60">
              {loading ? '\u00A0' : totalCount > users.length
                ? `${users.length} of ${totalCount} users (showing first ${users.length})`
                : `${users.length} users`}
            </h2>
            <TimeRangeSelector value={range} onChange={setRange} isPending={isPending} />
          </div>
        </PageContainer>
      </div>

      {/* Column Selector */}
      <div className="border-b border-white/5 overflow-x-auto">
        <PageContainer className="py-3">
          <div className="flex items-center gap-2 flex-nowrap sm:flex-wrap min-w-max sm:min-w-0">
            <span className="font-mono text-[11px] uppercase tracking-wider text-white/40 mr-2">Columns:</span>
            {columns.map(col => (
              <button
                key={col.key}
                onClick={() => toggleColumn(col.key)}
                disabled={col.key === 'email'}
                className={`px-2 py-1 rounded font-mono text-[11px] transition-colors whitespace-nowrap ${
                  visibleColumns.has(col.key)
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    : 'bg-white/5 text-white/40 border border-white/10 hover:bg-white/10'
                } ${col.key === 'email' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                {col.label}
              </button>
            ))}
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
          <ErrorState title="Error loading users" message={error} />
        ) : (
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
                  {users.map((user, i) => (
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
                  ))}
                </tbody>
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
                          <span className="text-white/30">—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>
          </AnimatedCard>
        )}
        </PageContainer>
      </main>
    </div>
  );
}

export default function UsersPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#050507] text-white grid-bg flex items-center justify-center">
        <div className="font-mono text-sm text-white/40">Loading...</div>
      </div>
    }>
      <UsersPageContent />
    </Suspense>
  );
}
