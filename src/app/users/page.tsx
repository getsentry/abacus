'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { InlineSearchInput } from '@/components/SearchInput';
import { UserDetailPanel } from '@/components/UserDetailPanel';
import { TimeRangeSelector } from '@/components/TimeRangeSelector';
import { MainNav } from '@/components/MainNav';
import { UserMenu } from '@/components/UserMenu';
import { formatTokens, formatCurrency } from '@/lib/utils';
import { useTimeRange } from '@/contexts/TimeRangeContext';

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
}

type SortKey = keyof UserPivotData;

const columns: { key: SortKey; label: string; align: 'left' | 'right'; format?: (v: number) => string }[] = [
  { key: 'email', label: 'User', align: 'left' },
  { key: 'totalTokens', label: 'Total Tokens', align: 'right', format: formatTokens },
  { key: 'totalCost', label: 'Cost', align: 'right', format: formatCurrency },
  { key: 'claudeCodeTokens', label: 'Claude Code', align: 'right', format: formatTokens },
  { key: 'cursorTokens', label: 'Cursor', align: 'right', format: formatTokens },
  { key: 'inputTokens', label: 'Input', align: 'right', format: formatTokens },
  { key: 'outputTokens', label: 'Output', align: 'right', format: formatTokens },
  { key: 'daysActive', label: 'Days Active', align: 'right', format: (v) => v.toString() },
  { key: 'avgTokensPerDay', label: 'Avg/Day', align: 'right', format: formatTokens },
  { key: 'lastActive', label: 'Last Active', align: 'right' },
];

function UsersPageContent() {
  const { days, setDays, isPending } = useTimeRange();
  const searchParams = useSearchParams();
  const initialSearch = searchParams.get('search') || '';

  const [users, setUsers] = useState<UserPivotData[]>([]);
  const [loading, setLoading] = useState(true);

  // Show refreshing state when pending or loading with existing data
  const isRefreshing = isPending || (loading && users.length > 0);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>('totalTokens');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<Set<SortKey>>(
    new Set(['email', 'totalTokens', 'totalCost', 'claudeCodeTokens', 'cursorTokens', 'daysActive', 'avgTokensPerDay', 'lastActive'])
  );

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        sortBy,
        sortDir,
        days: days.toString(),
        ...(searchQuery && { search: searchQuery }),
      });
      const res = await fetch(`/api/users/pivot?${params}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `API error: ${res.status}`);
      }
      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch users';
      console.error('Failed to fetch users:', err);
      setError(message);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [sortBy, sortDir, searchQuery, days]);

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

  const toggleColumn = (key: SortKey) => {
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
      inputTokens: acc.inputTokens + Number(u.inputTokens),
      outputTokens: acc.outputTokens + Number(u.outputTokens),
    }),
    { totalTokens: 0, totalCost: 0, claudeCodeTokens: 0, cursorTokens: 0, inputTokens: 0, outputTokens: 0 }
  );

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
            <InlineSearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Filter users..."
            />
            <TimeRangeSelector value={days} onChange={setDays} isPending={isPending} />
            <div className="w-px h-6 bg-white/10 mx-1" />
            <UserMenu />
          </div>
        </div>
      </header>

      {/* Page Title */}
      <div className="border-b border-white/5 px-4 sm:px-8 py-3">
        <div className="flex items-center justify-between">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">
            {loading ? '\u00A0' : `${users.length} users`}
          </h2>
        </div>
      </div>

      {/* Column Selector */}
      <div className="border-b border-white/5 px-4 sm:px-8 py-3 overflow-x-auto">
        <div className="flex items-center gap-2 flex-nowrap sm:flex-wrap min-w-max sm:min-w-0">
          <span className="font-mono text-[10px] uppercase tracking-wider text-white/40 mr-2">Columns:</span>
          {columns.map(col => (
            <button
              key={col.key}
              onClick={() => toggleColumn(col.key)}
              disabled={col.key === 'email'}
              className={`px-2 py-1 rounded font-mono text-[10px] transition-colors whitespace-nowrap ${
                visibleColumns.has(col.key)
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  : 'bg-white/5 text-white/40 border border-white/10 hover:bg-white/10'
              } ${col.key === 'email' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              {col.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <main className={`relative z-10 p-4 sm:p-8 transition-opacity duration-300 ${
        isRefreshing ? 'opacity-60' : 'opacity-100'
      }`}>
        {loading && users.length === 0 ? (
          <div className="flex h-64 items-center justify-center">
            <div className="font-mono text-sm text-white/40">Loading...</div>
          </div>
        ) : error ? (
          <div className="flex h-64 items-center justify-center">
            <div className="text-center">
              <div className="font-mono text-sm text-red-400 mb-2">Error loading users</div>
              <div className="font-mono text-xs text-white/40">{error}</div>
            </div>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-lg border border-white/5 bg-white/[0.02] overflow-hidden"
          >
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10 bg-white/[0.02]">
                    {activeColumns.map(col => (
                      <th
                        key={col.key}
                        onClick={() => handleSort(col.key)}
                        className={`px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-white/60 cursor-pointer hover:text-white transition-colors ${
                          col.align === 'right' ? 'text-right' : 'text-left'
                        }`}
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
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map((user, i) => (
                    <tr
                      key={user.email}
                      onClick={() => setSelectedUser(user.email)}
                      className="border-b border-white/5 cursor-pointer hover:bg-white/[0.02] transition-colors"
                    >
                      {activeColumns.map(col => (
                        <td
                          key={col.key}
                          className={`px-4 py-3 font-mono text-xs ${
                            col.align === 'right' ? 'text-right' : 'text-left'
                          }`}
                        >
                          {col.key === 'email' ? (
                            <span className="text-white hover:text-amber-400 transition-colors">
                              {user.email}
                            </span>
                          ) : col.key === 'claudeCodeTokens' ? (
                            <span className="text-amber-400/80">{col.format!(user[col.key] as number)}</span>
                          ) : col.key === 'cursorTokens' ? (
                            <span className="text-cyan-400/80">{col.format!(user[col.key] as number)}</span>
                          ) : col.format ? (
                            <span className="text-white/70">{col.format(user[col.key] as number)}</span>
                          ) : (
                            <span className="text-white/50">{user[col.key]}</span>
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
          </motion.div>
        )}
      </main>

      {/* User Detail Panel */}
      <UserDetailPanel email={selectedUser} onClose={() => setSelectedUser(null)} days={days} />
    </div>
  );
}

export default function UsersPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0a0a0f] text-white grid-bg flex items-center justify-center">
        <div className="font-mono text-sm text-white/40">Loading...</div>
      </div>
    }>
      <UsersPageContent />
    </Suspense>
  );
}
