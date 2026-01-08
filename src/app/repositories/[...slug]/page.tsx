'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useTimeRange } from '@/contexts/TimeRangeContext';
import { motion } from 'framer-motion';
import { StatCard } from '@/components/StatCard';
import { TimeRangeSelector } from '@/components/TimeRangeSelector';
import { AppHeader } from '@/components/AppHeader';
import { TipBar } from '@/components/TipBar';
import { PageContainer } from '@/components/PageContainer';
import { AppLink } from '@/components/AppLink';
import { LoadingState, ErrorState, EmptyState } from '@/components/PageState';
import { getToolConfig, formatToolName } from '@/lib/tools';
import { GitCommit, Users, Calendar, ArrowLeft, ExternalLink, Filter, ChevronRight, ChevronDown } from 'lucide-react';

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
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

interface RepositoryData {
  details: RepositoryDetails;
  commits: RepositoryCommit[];
  totalCommits: number;
  dailyStats: DailyStats[];
}

function ToolBadge({ tool, model }: { tool: string; model?: string | null }) {
  const config = getToolConfig(tool);
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-mono ${config.bg}/20 ${config.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.bg}`} />
      {formatToolName(tool)}
      {model && <span className="text-white/30">/ {model}</span>}
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
                  className="text-white/30 hover:text-white/60 transition-colors"
                >
                  <code className="text-xs font-mono">{commit.commitId.slice(0, 7)}</code>
                </a>
              )}
            </div>
          </div>

          {/* Second line: author, date, stats, AI badges */}
          <div className="flex items-center justify-between gap-4 mt-1">
            <div className="flex items-center gap-3 text-xs font-mono text-white/50">
              <span>{commit.authorEmail?.split('@')[0] || 'unknown'}</span>
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
          <pre className="text-xs font-mono text-white/50 whitespace-pre-wrap bg-white/[0.02] rounded p-3 border border-white/5 overflow-x-auto">
            {body}
          </pre>
        </div>
      )}
    </motion.div>
  );
}

export default function RepositoryDetailPage() {
  const params = useParams();
  const { days, range, setRange, getDateParams, isPending } = useTimeRange();
  const [data, setData] = useState<RepositoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aiFilter, setAiFilter] = useState<'all' | 'ai' | 'human'>('all');
  const [commitsPage, setCommitsPage] = useState(0);
  const commitsPerPage = 50;

  // Parse slug: ['github', 'getsentry', 'sentry'] or ['github', 'getsentry/sentry']
  const slug = params.slug as string[];
  const source = slug?.[0] || '';
  const fullName = slug?.slice(1).join('/') || '';

  const fetchData = useCallback(async () => {
    if (!source || !fullName) return;

    setLoading(true);
    setError(null);

    try {
      const { startDate, endDate } = getDateParams();
      const queryParams = new URLSearchParams();
      queryParams.set('startDate', startDate);
      queryParams.set('endDate', endDate);
      queryParams.set('commitsLimit', commitsPerPage.toString());
      queryParams.set('commitsOffset', (commitsPage * commitsPerPage).toString());
      queryParams.set('aiFilter', aiFilter);

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
    }
  }, [source, fullName, getDateParams, aiFilter, commitsPage]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Build tool breakdown for the chart
  const toolBreakdown = data?.details ? [
    { tool: 'claude_code', commits: data.details.claudeCodeCommits },
    { tool: 'cursor', commits: data.details.cursorCommits },
    { tool: 'copilot', commits: data.details.copilotCommits },
    { tool: 'windsurf', commits: data.details.windsurfCommits },
  ].filter(t => t.commits > 0) : [];

  // Build chart data
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
                    className="text-white/30 hover:text-white/60 transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>

              {/* Source badge */}
              <div className="mt-2">
                <span className="font-mono text-[10px] uppercase tracking-wider text-white/40 px-2 py-0.5 rounded bg-white/5">
                  {source}
                </span>
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
                  value={formatNumber(data.details.totalCommits)}
                  icon={GitCommit}
                />
                <StatCard
                  label="AI Attributed"
                  value={`${data.details.aiAssistanceRate}%`}
                  subValue={`${formatNumber(data.details.aiAssistedCommits)} commits`}
                />
                <StatCard
                  label="Contributors"
                  value={formatNumber(data.details.uniqueAuthors)}
                  icon={Users}
                />
                <StatCard
                  label="Lines Changed"
                  value={formatNumber(data.details.totalAdditions + data.details.totalDeletions)}
                  subValue={`+${formatNumber(data.details.totalAdditions)} / -${formatNumber(data.details.totalDeletions)}`}
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
                  <h3 className="font-mono text-xs uppercase tracking-wider text-white/60 mb-4">
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
                  <div className="flex flex-wrap gap-4">
                    {toolBreakdown.map((tool) => {
                      const config = getToolConfig(tool.tool);
                      const pct = Math.round((tool.commits / data.details.aiAssistedCommits) * 100);
                      return (
                        <div key={tool.tool} className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${config.bg}`} />
                          <span className="font-mono text-xs text-white/60">
                            {formatToolName(tool.tool)}
                          </span>
                          <span className="font-mono text-xs text-white/40">
                            {tool.commits} ({pct}%)
                          </span>
                        </div>
                      );
                    })}
                  </div>
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
                  <h3 className="font-mono text-xs uppercase tracking-wider text-white/60 mb-4">
                    Daily Commits
                  </h3>
                  <div className="flex items-end gap-1 h-32">
                    {chartData.map((day, i) => {
                      const total = day.claudeCode + day.cursor + day.copilot + day.windsurf + day.human;
                      const maxTotal = Math.max(...chartData.map(d => d.claudeCode + d.cursor + d.copilot + d.windsurf + d.human));
                      const heightPct = maxTotal > 0 ? (total / maxTotal) * 100 : 0;
                      const aiTotal = day.claudeCode + day.cursor + day.copilot + day.windsurf;
                      const aiPct = total > 0 ? (aiTotal / total) * 100 : 0;

                      return (
                        <div key={day.date} className="flex-1 flex flex-col justify-end h-full group relative">
                          <div
                            className="w-full rounded-t transition-all relative overflow-hidden"
                            style={{ height: `${heightPct}%`, minHeight: total > 0 ? '4px' : '0' }}
                          >
                            {/* AI portion */}
                            <div
                              className="absolute bottom-0 left-0 right-0 bg-amber-500/80"
                              style={{ height: `${aiPct}%` }}
                            />
                            {/* Human portion */}
                            <div
                              className="absolute top-0 left-0 right-0 bg-white/10"
                              style={{ height: `${100 - aiPct}%` }}
                            />
                          </div>
                          {/* Tooltip */}
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10">
                            <div className="bg-black/95 border border-white/10 rounded px-2 py-1 text-[10px] font-mono whitespace-nowrap">
                              <div className="text-white/60">{new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                              <div className="text-white">{total} commits</div>
                              {aiTotal > 0 && <div className="text-amber-400">{aiTotal} AI</div>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
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
                    <h3 className="font-mono text-xs uppercase tracking-wider text-white/60">
                      Commits ({data.totalCommits})
                    </h3>
                    <div className="flex items-center gap-2">
                      <Filter className="w-3 h-3 text-white/30" />
                      <select
                        value={aiFilter}
                        onChange={(e) => {
                          setAiFilter(e.target.value as 'all' | 'ai' | 'human');
                          setCommitsPage(0);
                        }}
                        className="bg-transparent border border-white/10 rounded px-2 py-1 font-mono text-[10px] text-white/60 focus:outline-none focus:border-white/30"
                      >
                        <option value="all">All commits</option>
                        <option value="ai">AI attributed</option>
                        <option value="human">Human only</option>
                      </select>
                    </div>
                  </div>

                  {/* Commits */}
                  <div className="max-h-[600px] overflow-y-auto">
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
                        className="font-mono text-xs text-white/40 hover:text-white/60 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        Previous
                      </button>
                      <span className="font-mono text-xs text-white/40">
                        Page {commitsPage + 1} of {totalPages}
                      </span>
                      <button
                        onClick={() => setCommitsPage(p => Math.min(totalPages - 1, p + 1))}
                        disabled={commitsPage >= totalPages - 1}
                        className="font-mono text-xs text-white/40 hover:text-white/60 disabled:opacity-30 disabled:cursor-not-allowed"
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
                  className="flex items-center justify-center gap-6 text-white/30 font-mono text-xs"
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
