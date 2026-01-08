'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { GitCommit, GitBranch, TrendingUp, Percent } from 'lucide-react';
import { InlineSearchInput } from '@/components/SearchInput';
import { TimeRangeSelector } from '@/components/TimeRangeSelector';
import { AppHeader } from '@/components/AppHeader';
import { TipBar } from '@/components/TipBar';
import { PageContainer } from '@/components/PageContainer';
import { LoadingBar } from '@/components/LoadingBar';
import { StatCard } from '@/components/StatCard';
import { LoadingState, ErrorState, EmptyState } from '@/components/PageState';
import { useTimeRange } from '@/contexts/TimeRangeContext';
import { getToolConfig, formatToolName } from '@/lib/tools';
import { calculateDelta } from '@/lib/comparison';

interface RepositoryPivotData {
  id: number;
  source: string;
  fullName: string;
  totalCommits: number;
  aiAssistedCommits: number;
  aiAssistanceRate: number;
  uniqueAuthors: number;
  firstCommit: string | null;
  lastCommit: string | null;
  claudeCodeCommits: number;
  cursorCommits: number;
  copilotCommits: number;
}

interface CommitTotals {
  totalCommits: number;
  aiAssistedCommits: number;
  aiAssistanceRate: number;
  repositoryCount: number;
  toolBreakdown: { tool: string; commits: number }[];
  previousPeriod?: {
    totalCommits: number;
    aiAssistedCommits: number;
    aiAssistanceRate: number;
    repositoryCount: number;
  };
}

type SortKey = keyof RepositoryPivotData;
type ColumnKey = SortKey | 'toolSplit';

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Build tool breakdown from repository data
function getToolBreakdownFromRepo(repo: RepositoryPivotData) {
  const tools = [];
  if (repo.claudeCodeCommits > 0) {
    tools.push({ tool: 'claude_code', commits: repo.claudeCodeCommits });
  }
  if (repo.cursorCommits > 0) {
    tools.push({ tool: 'cursor', commits: repo.cursorCommits });
  }
  if (repo.copilotCommits > 0) {
    tools.push({ tool: 'copilot', commits: repo.copilotCommits });
  }
  return tools.sort((a, b) => b.commits - a.commits);
}

const columns: { key: ColumnKey; label: string; align: 'left' | 'right'; format?: (v: number) => string; sortable?: boolean }[] = [
  { key: 'fullName', label: 'Repository', align: 'left' },
  { key: 'totalCommits', label: 'Commits', align: 'right', format: formatNumber },
  { key: 'aiAssistedCommits', label: 'AI Attributed', align: 'right', format: formatNumber },
  { key: 'aiAssistanceRate', label: 'AI %', align: 'right', format: (v) => `${v}%` },
  { key: 'toolSplit', label: 'Tool Split', align: 'left', sortable: false },
  { key: 'uniqueAuthors', label: 'Authors', align: 'right', format: (v) => v.toString() },
  { key: 'lastCommit', label: 'Last Commit', align: 'right' },
];

function CommitsPageContent() {
  const { range, setRange, days, isPending, getDateParams } = useTimeRange();
  const searchParams = useSearchParams();
  const initialSearch = searchParams.get('search') || '';

  const [repositories, setRepositories] = useState<RepositoryPivotData[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totals, setTotals] = useState<CommitTotals | null>(null);
  const [loading, setLoading] = useState(true);
  const isRefreshing = isPending || (loading && repositories.length > 0);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>('totalCommits');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnKey>>(
    new Set(['fullName', 'totalCommits', 'aiAssistedCommits', 'aiAssistanceRate', 'toolSplit', 'uniqueAuthors', 'lastCommit'])
  );

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

      const [repoRes, trendsRes] = await Promise.all([
        fetch(`/api/commits/pivot?${params}`),
        fetch(`/api/commits/trends?startDate=${startDate}&endDate=${endDate}&comparison=true`),
      ]);

      const repoData = await repoRes.json();
      const trendsData = await trendsRes.json();

      if (!repoRes.ok) {
        throw new Error(repoData.error || `API error: ${repoRes.status}`);
      }
      if (!trendsRes.ok) {
        throw new Error(trendsData.error || `API error: ${trendsRes.status}`);
      }

      setRepositories(repoData.repositories || []);
      setTotalCount(repoData.totalCount || 0);
      setTotals(trendsData.overall || null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch data';
      setError(message);
      setRepositories([]);
    } finally {
      setLoading(false);
    }
  }, [sortBy, sortDir, searchQuery, getDateParams]);

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

  const toggleColumn = (key: ColumnKey) => {
    const newVisible = new Set(visibleColumns);
    if (newVisible.has(key)) {
      if (key !== 'fullName') newVisible.delete(key);
    } else {
      newVisible.add(key);
    }
    setVisibleColumns(newVisible);
  };

  const activeColumns = columns.filter(c => visibleColumns.has(c.key));

  // Calculate table totals
  const tableTotals = repositories.reduce(
    (acc, r) => ({
      totalCommits: acc.totalCommits + r.totalCommits,
      aiAssistedCommits: acc.aiAssistedCommits + r.aiAssistedCommits,
      uniqueAuthors: acc.uniqueAuthors + r.uniqueAuthors,
    }),
    { totalCommits: 0, aiAssistedCommits: 0, uniqueAuthors: 0 }
  );

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white grid-bg">
      <LoadingBar isLoading={isRefreshing} />

      <AppHeader
        search={
          <InlineSearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Filter repositories..."
          />
        }
      />

      <TipBar />

      {/* Summary Stats */}
      {totals && (
        <div className="border-b border-white/5">
          <PageContainer className="py-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
              <StatCard
                label="Total Commits"
                days={days}
                value={formatNumber(totals.totalCommits)}
                icon={GitCommit}
                trend={totals.previousPeriod ? calculateDelta(totals.totalCommits, totals.previousPeriod.totalCommits) : undefined}
                delay={0}
              >
                <p className="font-mono text-xs text-white/50">
                  across {formatNumber(totals.repositoryCount)} repos
                </p>
              </StatCard>

              <StatCard
                label="AI Attributed"
                days={days}
                value={`${totals.aiAssistanceRate}%`}
                icon={Percent}
                accentColor="#10b981"
                trend={totals.previousPeriod ? calculateDelta(totals.aiAssistanceRate, totals.previousPeriod.aiAssistanceRate) : undefined}
                delay={0.1}
              >
                <p className="font-mono text-xs text-white/50">
                  {formatNumber(totals.aiAssistedCommits)} commits
                </p>
              </StatCard>

              <StatCard
                label="Repositories"
                days={days}
                value={formatNumber(totals.repositoryCount)}
                icon={GitBranch}
                accentColor="#06b6d4"
                trend={totals.previousPeriod ? calculateDelta(totals.repositoryCount, totals.previousPeriod.repositoryCount) : undefined}
                delay={0.2}
              >
                <p className="font-mono text-xs text-white/50">
                  with commits in period
                </p>
              </StatCard>

              <StatCard
                label="AI Commits"
                days={days}
                value={formatNumber(totals.aiAssistedCommits)}
                icon={TrendingUp}
                accentColor="#8b5cf6"
                trend={totals.previousPeriod ? calculateDelta(totals.aiAssistedCommits, totals.previousPeriod.aiAssistedCommits) : undefined}
                delay={0.3}
              >
                {totals.toolBreakdown && totals.toolBreakdown.length > 0 && (
                  <p className="font-mono text-xs text-white/50">
                    {formatToolName(totals.toolBreakdown[0].tool)} leads
                  </p>
                )}
              </StatCard>
            </div>

            {/* Tool Breakdown Bar */}
            {totals.toolBreakdown && totals.toolBreakdown.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="mt-4 rounded-lg border border-white/5 bg-white/[0.02] p-4"
              >
                <p className="font-mono text-[10px] uppercase tracking-wider text-white/40 mb-3">
                  AI Commits by Tool
                </p>
                <div className="flex items-center gap-4">
                  <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden flex">
                    {totals.toolBreakdown.map((t, i) => {
                      const config = getToolConfig(t.tool);
                      const pct = totals.aiAssistedCommits > 0
                        ? (t.commits / totals.aiAssistedCommits) * 100
                        : 0;
                      return (
                        <motion.div
                          key={t.tool}
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.6, delay: 0.2 + i * 0.05 }}
                          className={`h-full ${config.bg} ${i > 0 ? 'ml-0.5' : ''}`}
                        />
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-4">
                    {totals.toolBreakdown.map(t => {
                      const config = getToolConfig(t.tool);
                      const pct = totals.aiAssistedCommits > 0
                        ? Math.round((t.commits / totals.aiAssistedCommits) * 100)
                        : 0;
                      return (
                        <div key={t.tool} className="flex items-center gap-1.5">
                          <div className={`w-2 h-2 rounded-full ${config.bg}`} />
                          <span className={`font-mono text-[10px] ${config.text}`}>
                            {formatToolName(t.tool)}
                          </span>
                          <span className="font-mono text-[10px] text-white/40">
                            {pct}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            )}
          </PageContainer>
        </div>
      )}

      {/* Page Title with Time Range Selector */}
      <div className="border-b border-white/5">
        <PageContainer className="py-3">
          <div className="flex items-center justify-between">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">
              {loading ? '\u00A0' : totalCount > repositories.length
                ? `${repositories.length} of ${totalCount} repositories (showing first ${repositories.length})`
                : `${repositories.length} repositories`}
            </h2>
            <TimeRangeSelector value={range} onChange={setRange} isPending={isPending} />
          </div>
        </PageContainer>
      </div>

      {/* Column Selector */}
      <div className="border-b border-white/5 overflow-x-auto">
        <PageContainer className="py-3">
          <div className="flex items-center gap-2 flex-nowrap sm:flex-wrap min-w-max sm:min-w-0">
            <span className="font-mono text-[10px] uppercase tracking-wider text-white/40 mr-2">Columns:</span>
            {columns.map(col => (
              <button
                key={col.key}
                onClick={() => toggleColumn(col.key)}
                disabled={col.key === 'fullName'}
                className={`px-2 py-1 rounded font-mono text-[10px] transition-colors whitespace-nowrap ${
                  visibleColumns.has(col.key)
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    : 'bg-white/5 text-white/40 border border-white/10 hover:bg-white/10'
                } ${col.key === 'fullName' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
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
          {loading && repositories.length === 0 ? (
            <LoadingState />
          ) : error ? (
            <ErrorState title="Error loading repositories" message={error} />
          ) : repositories.length === 0 ? (
            <EmptyState
              icon={GitCommit}
              title="No commit data found"
              description="Configure GitHub webhooks to start tracking commits"
            />
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
                      {activeColumns.map(col => {
                        const isSortable = col.sortable !== false && col.key !== 'toolSplit';
                        return (
                          <th
                            key={col.key}
                            onClick={isSortable ? () => handleSort(col.key as SortKey) : undefined}
                            className={`px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-white/60 transition-colors ${
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
                    {repositories.map((repo) => (
                      <tr
                        key={repo.id}
                        className="border-b border-white/5 hover:bg-white/[0.02] transition-colors"
                      >
                        {activeColumns.map(col => (
                          <td
                            key={col.key}
                            className={`px-4 py-3 font-mono text-xs ${
                              col.align === 'right' ? 'text-right' : 'text-left'
                            }`}
                          >
                            {col.key === 'fullName' ? (
                              <a
                                href={repo.source === 'github' ? `https://github.com/${repo.fullName}` : '#'}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 hover:text-amber-400 transition-colors group"
                              >
                                {repo.source === 'github' ? (
                                  <svg className="w-3.5 h-3.5 text-white/30 group-hover:text-amber-400/60 flex-shrink-0 transition-colors" viewBox="0 0 16 16" fill="currentColor">
                                    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
                                  </svg>
                                ) : (
                                  <span className="text-white/30 text-[10px] uppercase">{repo.source}</span>
                                )}
                                <span className="text-white group-hover:text-amber-400">{repo.fullName}</span>
                              </a>
                            ) : col.key === 'aiAssistanceRate' ? (
                              <span className={repo.aiAssistanceRate >= 50 ? 'text-emerald-400' : 'text-white/70'}>
                                {col.format!(repo[col.key])}
                              </span>
                            ) : col.key === 'toolSplit' ? (
                              (() => {
                                const tools = getToolBreakdownFromRepo(repo);
                                const total = repo.aiAssistedCommits;
                                if (total === 0 || tools.length === 0) return <span className="text-white/30">-</span>;

                                return (
                                  <div className="group/dist relative flex gap-0.5 w-full min-w-[80px]">
                                    {tools.map((t, idx) => {
                                      const config = getToolConfig(t.tool);
                                      const pct = (t.commits / total) * 100;
                                      return (
                                        <div
                                          key={t.tool}
                                          className={`h-1.5 sm:h-2 ${config.bg} ${idx === 0 ? 'rounded-l' : ''} ${idx === tools.length - 1 ? 'rounded-r' : ''}`}
                                          style={{ width: `${pct}%` }}
                                        />
                                      );
                                    })}
                                    {/* Tooltip */}
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/dist:block z-20 pointer-events-none">
                                      <div className="rounded bg-black/95 px-2 py-1.5 text-[10px] whitespace-nowrap border border-white/10 shadow-lg">
                                        {tools.map(t => {
                                          const config = getToolConfig(t.tool);
                                          const pct = Math.round((t.commits / total) * 100);
                                          return (
                                            <div key={t.tool} className={config.text}>
                                              {formatToolName(t.tool)}: {t.commits} ({pct}%)
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })()
                            ) : col.key === 'lastCommit' ? (
                              <span className="text-white/50">{formatDate(repo[col.key])}</span>
                            ) : col.format ? (
                              <span className="text-white/70">{col.format(repo[col.key as SortKey] as number)}</span>
                            ) : (
                              <span className="text-white/50">{repo[col.key as SortKey]}</span>
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
                          {col.key === 'fullName' ? (
                            <span className="text-white/60">Total ({repositories.length})</span>
                          ) : col.key === 'totalCommits' ? (
                            <span className="text-white">{formatNumber(tableTotals.totalCommits)}</span>
                          ) : col.key === 'aiAssistedCommits' ? (
                            <span className="text-white">{formatNumber(tableTotals.aiAssistedCommits)}</span>
                          ) : col.key === 'aiAssistanceRate' ? (
                            <span className="text-white">
                              {tableTotals.totalCommits > 0
                                ? Math.round((tableTotals.aiAssistedCommits / tableTotals.totalCommits) * 100)
                                : 0}%
                            </span>
                          ) : (
                            <span className="text-white/30">-</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </motion.div>
          )}
        </PageContainer>
      </main>
    </div>
  );
}

export default function CommitsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0a0a0f] text-white grid-bg flex items-center justify-center">
        <div className="font-mono text-sm text-white/40">Loading...</div>
      </div>
    }>
      <CommitsPageContent />
    </Suspense>
  );
}
