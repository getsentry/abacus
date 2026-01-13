'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { formatTokens, formatCurrency, formatModelName } from '@/lib/utils';
import { Filter } from 'lucide-react';

function formatWhen(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const isCurrentYear = date.getFullYear() === now.getFullYear();

  if (isCurrentYear) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Tool color palette - matches user profile page
const TOOL_COLORS: Record<string, { bg: string; text: string }> = {
  claude_code: { bg: 'bg-amber-500', text: 'text-amber-400' },
  cursor: { bg: 'bg-cyan-500', text: 'text-cyan-400' },
  windsurf: { bg: 'bg-emerald-500', text: 'text-emerald-400' },
  github_copilot: { bg: 'bg-sky-500', text: 'text-sky-400' },
  codex: { bg: 'bg-teal-500', text: 'text-teal-400' },
  default: { bg: 'bg-rose-500', text: 'text-rose-400' },
};

function getToolColor(tool: string) {
  return TOOL_COLORS[tool] || TOOL_COLORS.default;
}

function formatToolName(tool: string): string {
  const names: Record<string, string> = {
    claude_code: 'Claude Code',
    cursor: 'Cursor',
    windsurf: 'Windsurf',
    github_copilot: 'GitHub Copilot',
    codex: 'Codex',
  };
  return names[tool] || tool.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

interface RawUsageRecord {
  id: number;
  date: string;
  tool: string;
  model: string;
  totalTokens: number;
  cost: number;
}

interface RawUsageTableProps {
  email: string;
  startDate: string;
  endDate: string;
}

const ITEMS_PER_PAGE = 50;

export function RawUsageTable({ email, startDate, endDate }: RawUsageTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // State from URL params
  const toolFilter = searchParams.get('tool') || '';
  const modelFilter = searchParams.get('model') || '';
  const page = parseInt(searchParams.get('page') || '0', 10);

  // Data state
  const [records, setRecords] = useState<RawUsageRecord[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [availableTools, setAvailableTools] = useState<string[]>([]);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Update URL params
  const updateFilters = useCallback((updates: { tool?: string; model?: string; page?: number }) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', 'raw');

    if (updates.tool !== undefined) {
      if (updates.tool) {
        params.set('tool', updates.tool);
      } else {
        params.delete('tool');
      }
    }
    if (updates.model !== undefined) {
      if (updates.model) {
        params.set('model', updates.model);
      } else {
        params.delete('model');
      }
    }
    if (updates.page !== undefined) {
      if (updates.page > 0) {
        params.set('page', updates.page.toString());
      } else {
        params.delete('page');
      }
    }

    router.push(`?${params.toString()}`, { scroll: false });
  }, [searchParams, router]);

  // Fetch data
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          startDate,
          endDate,
          page: page.toString(),
          limit: ITEMS_PER_PAGE.toString(),
        });
        if (toolFilter) params.set('tool', toolFilter);
        if (modelFilter) params.set('model', modelFilter);

        const response = await fetch(`/api/users/${encodeURIComponent(email)}/raw-usage?${params}`);
        if (!response.ok) throw new Error('Failed to fetch');

        const data = await response.json();
        setRecords(data.records);
        setTotalCount(data.totalCount);
        setAvailableTools(data.availableTools);
        setAvailableModels(data.availableModels);
      } catch {
        setRecords([]);
        setTotalCount(0);
        setError('Failed to load usage records');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [email, startDate, endDate, page, toolFilter, modelFilter]);

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  if (error) {
    return (
      <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-6 text-center">
        <p className="font-mono text-sm text-red-400">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-3 font-mono text-xs text-muted hover:text-white/60 cursor-pointer"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Filter className="w-3 h-3 text-faint" />
          <select
            value={toolFilter}
            onChange={(e) => updateFilters({ tool: e.target.value, page: 0 })}
            className="bg-[#0a0a0c] border border-white/10 rounded px-2 py-1 font-mono text-[11px] text-muted focus:outline-none focus:border-white/30 cursor-pointer"
          >
            <option value="" className="bg-[#0a0a0c]">All Tools</option>
            {availableTools.map(tool => (
              <option key={tool} value={tool} className="bg-[#0a0a0c]">
                {formatToolName(tool)}
              </option>
            ))}
          </select>
        </div>
        <select
          value={modelFilter}
          onChange={(e) => updateFilters({ model: e.target.value, page: 0 })}
          className="bg-[#0a0a0c] border border-white/10 rounded px-2 py-1 font-mono text-[11px] text-muted focus:outline-none focus:border-white/30 cursor-pointer"
        >
          <option value="" className="bg-[#0a0a0c]">All Models</option>
          {availableModels.map(model => (
            <option key={model} value={model} className="bg-[#0a0a0c]">
              {formatModelName(model)}
            </option>
          ))}
        </select>
        <span className="font-mono text-[11px] text-faint ml-auto">
          {totalCount.toLocaleString()} record{totalCount !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      <div className={`relative ${loading ? 'opacity-50' : ''} transition-opacity`}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 z-10">
            <div className="w-5 h-5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
          </div>
        )}

        <div className="bg-white/[0.02] rounded-lg border border-white/5 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                <th className="px-4 py-3 text-left font-mono text-[11px] uppercase tracking-wider text-muted font-normal">
                  When
                </th>
                <th className="px-4 py-3 text-left font-mono text-[11px] uppercase tracking-wider text-muted font-normal">
                  Tool
                </th>
                <th className="px-4 py-3 text-left font-mono text-[11px] uppercase tracking-wider text-muted font-normal">
                  Model
                </th>
                <th className="px-4 py-3 text-right font-mono text-[11px] uppercase tracking-wider text-muted font-normal">
                  Tokens
                </th>
                <th className="px-4 py-3 text-right font-mono text-[11px] uppercase tracking-wider text-muted font-normal">
                  Cost
                </th>
              </tr>
            </thead>
            <tbody>
              {records.length === 0 && !loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted font-mono text-sm">
                    No usage records found
                  </td>
                </tr>
              ) : (
                records.map((record) => {
                  const toolColor = getToolColor(record.tool);
                  return (
                    <tr
                      key={record.id}
                      className="border-b border-white/5 last:border-b-0 hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="px-4 py-3 font-mono text-sm text-muted">
                        {formatWhen(record.date)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${toolColor.bg}`} />
                          <span className="font-mono text-sm text-white/80">
                            {formatToolName(record.tool)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-sm text-white/80">
                        {formatModelName(record.model)}
                      </td>
                      <td className="px-4 py-3 font-mono text-sm text-white/80 text-right">
                        {formatTokens(record.totalTokens)}
                      </td>
                      <td className="px-4 py-3 font-mono text-sm text-white/80 text-right">
                        {formatCurrency(record.cost)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
          <button
            onClick={() => updateFilters({ page: Math.max(0, page - 1) })}
            disabled={page === 0}
            className="font-mono text-xs text-muted hover:text-white/60 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
          >
            Previous
          </button>
          <span className="font-mono text-xs text-muted">
            Page {page + 1} of {totalPages}
          </span>
          <button
            onClick={() => updateFilters({ page: Math.min(totalPages - 1, page + 1) })}
            disabled={page >= totalPages - 1}
            className="font-mono text-xs text-muted hover:text-white/60 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
