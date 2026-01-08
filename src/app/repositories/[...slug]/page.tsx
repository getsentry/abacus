'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { useTimeRange } from '@/contexts/TimeRangeContext';
import { motion } from 'framer-motion';
import { StatCard } from '@/components/StatCard';
import { DailyCommitsChart } from '@/components/DailyCommitsChart';
import { TimeRangeSelector } from '@/components/TimeRangeSelector';
import { AppHeader } from '@/components/AppHeader';
import { TipBar } from '@/components/TipBar';
import { PageContainer } from '@/components/PageContainer';
import { AppLink } from '@/components/AppLink';
import { LoadingState, ErrorState, EmptyState } from '@/components/PageState';
import { getToolConfig, formatToolName } from '@/lib/tools';
import { Legend } from '@/components/Legend';
import { calculateDelta } from '@/lib/comparison';
import { GitCommit, Users, Calendar, ArrowLeft, ExternalLink, Filter, ChevronRight, ChevronDown, Database } from 'lucide-react';

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

interface RepositoryDetailsPreviousPeriod {
  totalCommits: number;
  aiAssistedCommits: number;
  aiAssistanceRate: number;
  uniqueAuthors: number;
  totalAdditions: number;
  totalDeletions: number;
}

interface RepositoryDetails {
  id: number;
  source: string;
  fullName: string;
  totalCommits: number;
  aiAssistedCommits: number;
  aiAssistanceRate: number;
  totalAdditions: number;
  totalDeletions: number;
  aiAdditions: number;
  aiDeletions: number;
  uniqueAuthors: number;
  firstCommit: string | null;
  lastCommit: string | null;
  claudeCodeCommits: number;
  cursorCommits: number;
  copilotCommits: number;
  windsurfCommits: number;
  previousPeriod?: RepositoryDetailsPreviousPeriod;
}

interface CommitAttribution {
  aiTool: string;
  aiModel: string | null;
  confidence: string;
  source: string | null;
}

interface RepositoryCommit {
  commitId: string;
  authorEmail: string;
  mappedEmail: string | null;
  committedAt: string;
  message: string | null;
  aiTool: string | null;
  aiModel: string | null;
  additions: number;
  deletions: number;
  attributions?: CommitAttribution[];
}

interface DailyStats {
  date: string;
  totalCommits: number;
  claudeCodeCommits: number;
  cursorCommits: number;
  copilotCommits: number;
  windsurfCommits: number;
}

interface DataRange {
  firstCommit: string | null;
  lastCommit: string | null;
  totalCommits: number;
}

interface RepositoryData {
  details: RepositoryDetails;
  commits: RepositoryCommit[];
  totalCommits: number;
  dailyStats: DailyStats[];
  dataRange: DataRange;
}

function ToolBadge({ tool, model }: { tool: string; model?: string | null }) {
  const config = getToolConfig(tool);
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] uppercase tracking-wider font-mono ${config.bg}/20 ${config.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.bg}`} />
      {formatToolName(tool)}
      {model && <span className="text-muted">/ {model}</span>}
    </span>
  );
}

function CommitRow({ commit, source, repoFullName }: { commit: RepositoryCommit; source: string; repoFullName: string }) {
  const [expanded, setExpanded] = useState(false);

  const date = new Date(commit.committedAt);
  const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  const commitUrl = source === 'github'
    ? `https://github.com/${repoFullName}/commit/${commit.commitId}`
    : undefined;

  // Use attributions array if available, otherwise fall back to single aiTool
  const attributions = commit.attributions && commit.attributions.length > 0
    ? commit.attributions
    : commit.aiTool
      ? [{ aiTool: commit.aiTool, aiModel: commit.aiModel, confidence: 'detected', source: null }]
      : [];

  const hasAttribution = attributions.length > 0;
  const primaryTool = attributions[0]?.aiTool;

  // Parse commit message: first line is title, rest is body
  const messageLines = (commit.message || '').split('\n');
  const title = messageLines[0] || 'No commit message';
  const body = messageLines.slice(1).join('\n').trim();
  const hasBody = body.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="border-b border-white/5"
    >
      {/* Main row - clickable to expand */}
      <div
        className={`group flex items-start gap-3 py-3 px-4 hover:bg-white/[0.02] transition-colors ${hasBody ? 'cursor-pointer' : ''}`}
        onClick={() => hasBody && setExpanded(!expanded)}
      >
        {/* Expand/collapse indicator or commit indicator */}
        <div className="flex-shrink-0 mt-0.5 w-4">
          {hasBody ? (
            expanded ? (
              <ChevronDown className="w-4 h-4 text-white/40" />
            ) : (
              <ChevronRight className="w-4 h-4 text-white/40" />
            )
          ) : (
            <div className="w-4 h-4 flex items-center justify-center">
              {hasAttribution ? (
                <div className="flex -space-x-1">
                  {attributions.length === 1 ? (
                    <div className={`w-2 h-2 rounded-full ${getToolConfig(primaryTool).bg}`} />
                  ) : (
                    attributions.slice(0, 2).map((attr, i) => (
                      <div
                        key={attr.aiTool}
                        className={`w-2 h-2 rounded-full ${getToolConfig(attr.aiTool).bg} ring-1 ring-[#050507]`}
                        style={{ zIndex: 2 - i }}
                      />
                    ))
                  )}
                </div>
              ) : (
                <div className="w-2 h-2 rounded-full bg-white/20" />
              )}
            </div>
          )}
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* First line: commit title and SHA */}
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-white/90 truncate">{title}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {commitUrl && (
                <a
                  href={commitUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-white/50 hover:text-amber-400 transition-colors"
                >
                  <code className="text-xs font-mono">{commit.commitId.slice(0, 7)}</code>
                </a>
              )}
            </div>
          </div>

          {/* Second line: author, date, stats, AI badges */}
          <div className="flex items-center justify-between gap-4 mt-1">
            <div className="flex items-center gap-3 text-xs font-mono text-muted">
              {commit.mappedEmail ? (
                <AppLink
                  href={`/users/${encodeURIComponent(commit.mappedEmail)}`}
                  className="hover:text-white/70 transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  {commit.authorEmail?.split('@')[0] || 'unknown'}
                </AppLink>
              ) : (
                <span>{commit.authorEmail?.split('@')[0] || 'unknown'}</span>
              )}
              <span>{dateStr} {timeStr}</span>
              {(commit.additions > 0 || commit.deletions > 0) && (
                <span>
                  <span className="text-emerald-400/70">+{commit.additions}</span>
                  {' / '}
                  <span className="text-red-400/70">-{commit.deletions}</span>
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {attributions.map((attr) => (
                <ToolBadge key={attr.aiTool} tool={attr.aiTool} model={attr.aiModel} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Expanded body */}
      {expanded && hasBody && (
        <div className="px-4 pb-4 pl-11">
          <pre className="text-xs font-mono text-muted whitespace-pre-wrap bg-white/[0.02] rounded p-3 border border-white/5 overflow-x-auto">
            {body}
          </pre>
        </div>
      )}
    </motion.div>
  );
}

export default function RepositoryDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { days, range, setRange, getDateParams, isPending } = useTimeRange();
  const [data, setData] = useState<RepositoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [commitsLoading, setCommitsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commitsPage, setCommitsPage] = useState(0);
  const commitsPerPage = 50;

  // Parse filter from URL
  const aiFilter = useMemo(() => {
    const filter = searchParams.get('filter');
    if (filter === 'ai' || filter === 'human') return filter;
    return 'all';
  }, [searchParams]) as 'all' | 'ai' | 'human';

  const setAiFilter = useCallback((filter: 'all' | 'ai' | 'human') => {
    const newParams = new URLSearchParams(searchParams.toString());
    if (filter === 'all') {
      newParams.delete('filter');
    } else {
      newParams.set('filter', filter);
    }
    router.push(`?${newParams.toString()}`, { scroll: false });
    setCommitsPage(0);
  }, [searchParams, router]);

  // Parse slug: ['github', 'getsentry', 'sentry'] or ['github', 'getsentry/sentry']
  const slug = params.slug as string[];
  const source = slug?.[0] || '';
  const fullName = slug?.slice(1).join('/') || '';

  const fetchData = useCallback(async (isRefresh = false) => {
    if (!source || !fullName) return;

    if (isRefresh) {
      setCommitsLoading(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const { startDate, endDate } = getDateParams();
      const queryParams = new URLSearchParams();
      queryParams.set('startDate', startDate);
      queryParams.set('endDate', endDate);
      queryParams.set('commitsLimit', commitsPerPage.toString());
      queryParams.set('commitsOffset', (commitsPage * commitsPerPage).toString());
      queryParams.set('aiFilter', aiFilter);
      queryParams.set('comparison', 'true');

      const response = await fetch(`/api/repositories/${source}/${fullName}?${queryParams}`);

      if (!response.ok) {
        if (response.status === 404) {
          setError('Repository not found');
        } else {
          throw new Error('Failed to fetch repository data');
        }
        return;
      }

      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
      setCommitsLoading(false);
    }
  }, [source, fullName, getDateParams, aiFilter, commitsPage]);

  const hasMounted = useRef(false);

  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      fetchData(false);
    } else {
      fetchData(true);
    }
  }, [fetchData]);

  // Build tool breakdown for the chart
  const toolBreakdown = data?.details ? [
    { tool: 'claude_code', commits: data.details.claudeCodeCommits },
    { tool: 'cursor', commits: data.details.cursorCommits },
    { tool: 'github_copilot', commits: data.details.copilotCommits },
    { tool: 'windsurf', commits: data.details.windsurfCommits },
  ].filter(t => t.commits > 0) : [];

  // Build chart data for DailyCommitsChart (with tool breakdown)
  const chartData = data?.dailyStats?.map(day => ({
    date: day.date,
    claudeCode: day.claudeCodeCommits,
    cursor: day.cursorCommits,
    copilot: day.copilotCommits,
    windsurf: day.windsurfCommits,
    human: day.totalCommits - day.claudeCodeCommits - day.cursorCommits - day.copilotCommits - day.windsurfCommits,
  })) || [];

  const totalPages = data ? Math.ceil(data.totalCommits / commitsPerPage) : 0;

  return (
    <div className="min-h-screen bg-[#050507] text-white">
      <AppHeader />
      <TipBar />

      {/* Repository Header */}
      <div className="border-b border-white/5">
        <PageContainer className="py-6">
          <div className="flex items-start justify-between">
            <div>
              {/* Back link */}
              <AppLink
                href="/commits"
                className="inline-flex items-center gap-1.5 text-white/40 hover:text-white/60 transition-colors mb-4"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="font-mono text-xs">All Repositories</span>
              </AppLink>

              {/* Repository name */}
              <div className="flex items-center gap-3">
                <h1 className="font-display text-2xl text-white">{fullName}</h1>
                {source === 'github' && (
                  <a
                    href={`https://github.com/${fullName}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-white/50 hover:text-amber-400 transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>

              {/* Source badge and data range */}
              <div className="mt-2 flex items-center gap-3">
                <span className="font-mono text-[11px] uppercase tracking-wider text-muted px-2 py-0.5 rounded bg-white/5">
                  {source}
                </span>
                {data?.dataRange?.firstCommit && (
                  <span className="flex items-center gap-1.5 font-mono text-[11px] text-muted" title={`Data synced from ${new Date(data.dataRange.firstCommit).toLocaleDateString()} to ${data.dataRange.lastCommit ? new Date(data.dataRange.lastCommit).toLocaleDateString() : 'present'}`}>
                    <Database className="w-3 h-3" />
                    <span>
                      Data from {new Date(data.dataRange.firstCommit).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                    </span>
                  </span>
                )}
              </div>
            </div>

            <TimeRangeSelector value={range} onChange={setRange} isPending={isPending} />
          </div>
        </PageContainer>
      </div>

      {/* Main Content */}
      <main className="py-8">
        <PageContainer>
          {loading ? (
            <LoadingState message="Loading repository data..." />
          ) : error ? (
            <ErrorState message={error} />
          ) : data ? (
            <div className="space-y-8">
              {/* Stats Grid */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="grid grid-cols-2 md:grid-cols-4 gap-4"
              >
                <StatCard
                  label="Total Commits"
                  days={days}
                  value={formatNumber(data.details.totalCommits)}
                  icon={GitCommit}
                  trend={data.details.previousPeriod ? calculateDelta(data.details.totalCommits, data.details.previousPeriod.totalCommits) : undefined}
                />
                <StatCard
                  label="AI Attributed"
                  days={days}
                  value={`${data.details.aiAssistanceRate}%`}
                  subValue={`${formatNumber(data.details.aiAssistedCommits)} commits`}
                  trend={data.details.previousPeriod ? calculateDelta(data.details.aiAssistanceRate, data.details.previousPeriod.aiAssistanceRate) : undefined}
                />
                <StatCard
                  label="Contributors"
                  days={days}
                  value={formatNumber(data.details.uniqueAuthors)}
                  icon={Users}
                  trend={data.details.previousPeriod ? calculateDelta(data.details.uniqueAuthors, data.details.previousPeriod.uniqueAuthors) : undefined}
                />
                <StatCard
                  label="Lines Changed"
                  days={days}
                  value={formatNumber(data.details.totalAdditions + data.details.totalDeletions)}
                  subValue={`+${formatNumber(data.details.totalAdditions)} / -${formatNumber(data.details.totalDeletions)}`}
                  trend={data.details.previousPeriod ? calculateDelta(
                    data.details.totalAdditions + data.details.totalDeletions,
                    data.details.previousPeriod.totalAdditions + data.details.previousPeriod.totalDeletions
                  ) : undefined}
                />
              </motion.div>

              {/* Tool Breakdown */}
              {toolBreakdown.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="bg-white/[0.02] border border-white/5 rounded-lg p-6"
                >
                  <h3 className="font-mono text-[11px] uppercase tracking-wider text-muted mb-4">
                    AI Tool Attribution
                    <span className="text-white/20"> ({days}d)</span>
                  </h3>

                  {/* Stacked bar */}
                  <div className="h-3 rounded-full bg-white/5 overflow-hidden flex mb-4">
                    {toolBreakdown.map((tool) => {
                      const pct = (tool.commits / data.details.aiAssistedCommits) * 100;
                      const config = getToolConfig(tool.tool);
                      return (
                        <div
                          key={tool.tool}
                          className={`${config.bg} transition-all`}
                          style={{ width: `${pct}%` }}
                        />
                      );
                    })}
                  </div>

                  {/* Legend */}
                  <Legend
                    items={toolBreakdown.map((tool) => {
                      const config = getToolConfig(tool.tool);
                      const pct = Math.round((tool.commits / data.details.aiAssistedCommits) * 100);
                      return {
                        key: tool.tool,
                        label: formatToolName(tool.tool),
                        value: `${tool.commits} (${pct}%)`,
                        dotColor: config.bg,
                        textColor: 'text-muted',
                      };
                    })}
                  />
                </motion.div>
              )}

              {/* Daily Chart */}
              {chartData.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                  className="bg-white/[0.02] border border-white/5 rounded-lg p-6"
                >
                  <DailyCommitsChart data={chartData} />
                </motion.div>
              )}

              <div>
                {/* Commits List */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="bg-white/[0.02] border border-white/5 rounded-lg overflow-hidden"
                >
                  {/* Header with filter */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                    <h3 className="font-mono text-[11px] uppercase tracking-wider text-muted">
                      Commits ({data.totalCommits})
                    </h3>
                    <div className="flex items-center gap-2">
                      <Filter className="w-3 h-3 text-faint" />
                      <select
                        value={aiFilter}
                        onChange={(e) => setAiFilter(e.target.value as 'all' | 'ai' | 'human')}
                        className="bg-[#0a0a0c] border border-white/10 rounded px-2 py-1 font-mono text-[11px] text-muted focus:outline-none focus:border-white/30 cursor-pointer"
                      >
                        <option value="all" className="bg-[#0a0a0c]">All commits</option>
                        <option value="ai" className="bg-[#0a0a0c]">AI attributed</option>
                        <option value="human" className="bg-[#0a0a0c]">Human only</option>
                      </select>
                    </div>
                  </div>

                  {/* Commits */}
                  <div className={`max-h-[600px] overflow-y-auto relative ${commitsLoading ? 'opacity-50' : ''} transition-opacity`}>
                    {commitsLoading && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20 z-10">
                        <div className="w-5 h-5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
                      </div>
                    )}
                    {data.commits.length === 0 ? (
                      <EmptyState title="No commits found" description="Try adjusting your filters" />
                    ) : (
                      data.commits.map((commit) => (
                        <CommitRow
                          key={commit.commitId}
                          commit={commit}
                          source={source}
                          repoFullName={fullName}
                        />
                      ))
                    )}
                  </div>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
                      <button
                        onClick={() => setCommitsPage(p => Math.max(0, p - 1))}
                        disabled={commitsPage === 0}
                        className="font-mono text-xs text-muted hover:text-white/60 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                      >
                        Previous
                      </button>
                      <span className="font-mono text-xs text-muted">
                        Page {commitsPage + 1} of {totalPages}
                      </span>
                      <button
                        onClick={() => setCommitsPage(p => Math.min(totalPages - 1, p + 1))}
                        disabled={commitsPage >= totalPages - 1}
                        className="font-mono text-xs text-muted hover:text-white/60 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                      >
                        Next
                      </button>
                    </div>
                  )}
                </motion.div>
              </div>

              {/* Metadata footer */}
              {(data.details.firstCommit || data.details.lastCommit) && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="flex items-center justify-center gap-6 text-muted font-mono text-xs"
                >
                  {data.details.firstCommit && (
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3 h-3" />
                      <span>First: {new Date(data.details.firstCommit).toLocaleDateString()}</span>
                    </div>
                  )}
                  {data.details.lastCommit && (
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3 h-3" />
                      <span>Last: {new Date(data.details.lastCommit).toLocaleDateString()}</span>
                    </div>
                  )}
                </motion.div>
              )}
            </div>
          ) : null}
        </PageContainer>
      </main>
    </div>
  );
}
