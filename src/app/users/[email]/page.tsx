'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { StatCard } from '@/components/StatCard';
import { StackedBarChart } from '@/components/StackedBarChart';
import { TimeRangeSelector } from '@/components/TimeRangeSelector';
import { formatTokens, formatCurrency, formatDate, formatModelName } from '@/lib/utils';

interface UserDetails {
  summary: {
    email: string;
    totalTokens: number;
    totalCost: number;
    claudeCodeTokens: number;
    cursorTokens: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    lastActive: string;
    firstActive: string;
    daysActive: number;
    requestCount: number;
  };
  modelBreakdown: {
    model: string;
    tokens: number;
    inputTokens: number;
    outputTokens: number;
    cost: number;
    tool: string;
  }[];
  dailyUsage: {
    date: string;
    claudeCode: number;
    cursor: number;
    inputTokens: number;
    outputTokens: number;
    cost: number;
  }[];
}

export default function UserDetailPage() {
  const params = useParams();
  const email = decodeURIComponent(params.email as string);
  const username = email.split('@')[0];

  const [data, setData] = useState<UserDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(email)}?days=${days}`);
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || `Error: ${res.status}`);
      }
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load user data');
    } finally {
      setLoading(false);
    }
  }, [email, days]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const totalTokens = data?.summary?.totalTokens || 0;
  const inputTokens = data?.summary?.inputTokens || 0;
  const outputTokens = data?.summary?.outputTokens || 0;
  const inputRatio = totalTokens > 0 ? (inputTokens / totalTokens) * 100 : 0;
  const outputRatio = totalTokens > 0 ? (outputTokens / totalTokens) * 100 : 0;

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white grid-bg">
      {/* Header */}
      <header className="relative z-10 border-b border-white/5">
        <div className="px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/users"
                className="group flex items-center justify-center w-10 h-10 rounded-lg border border-white/10 bg-white/[0.02] hover:bg-white/[0.05] transition-all"
              >
                <svg
                  className="h-5 w-5 text-white/40 group-hover:text-white transition-colors"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </Link>
              <div>
                <motion.h1
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="font-display text-2xl font-medium tracking-tight"
                >
                  {username}
                </motion.h1>
                <motion.p
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.05 }}
                  className="mt-0.5 font-mono text-xs text-white/40"
                >
                  {email}
                </motion.p>
              </div>
            </div>
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
            >
              <TimeRangeSelector value={days} onChange={setDays} />
            </motion.div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 p-8">
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
              <span className="font-mono text-sm text-white/40">Loading...</span>
            </div>
          </div>
        ) : error ? (
          <div className="flex h-64 items-center justify-center">
            <div className="text-center">
              <div className="font-mono text-sm text-red-400 mb-2">Error loading user</div>
              <div className="font-mono text-xs text-white/40">{error}</div>
            </div>
          </div>
        ) : data?.summary ? (
          <div className="space-y-6">
            {/* Stats Row */}
            <div className="grid grid-cols-4 gap-4">
              <StatCard
                label="Total Tokens"
                value={formatTokens(data.summary.totalTokens)}
                subValue={`${data.summary.requestCount.toLocaleString()} requests`}
                accentColor="#ffffff"
                delay={0}
              />
              <StatCard
                label="Total Cost"
                value={formatCurrency(data.summary.totalCost)}
                subValue={`$${(data.summary.totalCost / Math.max(data.summary.daysActive, 1)).toFixed(2)}/day avg`}
                accentColor="#22c55e"
                delay={0.05}
              />
              <StatCard
                label="Claude Code"
                value={formatTokens(data.summary.claudeCodeTokens)}
                subValue={`${totalTokens > 0 ? Math.round((data.summary.claudeCodeTokens / totalTokens) * 100) : 0}% of total`}
                accentColor="#f59e0b"
                delay={0.1}
              />
              <StatCard
                label="Cursor"
                value={formatTokens(data.summary.cursorTokens)}
                subValue={`${totalTokens > 0 ? Math.round((data.summary.cursorTokens / totalTokens) * 100) : 0}% of total`}
                accentColor="#06b6d4"
                delay={0.15}
              />
            </div>

            {/* Daily Usage Chart */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="rounded-lg border border-white/5 bg-white/[0.02] p-6"
            >
              <StackedBarChart
                data={data.dailyUsage}
                height={180}
              />
            </motion.div>

            {/* Two Column Grid */}
            <div className="grid grid-cols-2 gap-6">
              {/* Input/Output Breakdown */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
                className="rounded-lg border border-white/5 bg-white/[0.02] p-6"
              >
                <h3 className="font-mono text-xs uppercase tracking-wider text-white/60 mb-6">
                  Token Breakdown
                </h3>

                <div className="space-y-5">
                  {/* Input Tokens */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-xs text-white/70">Input Tokens</span>
                      <span className="font-mono text-xs text-white">{formatTokens(inputTokens)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${inputRatio}%` }}
                        transition={{ duration: 0.8, delay: 0.3 }}
                        className="h-full rounded-full bg-gradient-to-r from-white/60 to-white/40"
                      />
                    </div>
                    <div className="mt-1 font-mono text-[10px] text-white/40">
                      {inputRatio.toFixed(1)}% of total tokens
                    </div>
                  </div>

                  {/* Output Tokens */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-xs text-white/70">Output Tokens</span>
                      <span className="font-mono text-xs text-white">{formatTokens(outputTokens)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${outputRatio}%` }}
                        transition={{ duration: 0.8, delay: 0.35 }}
                        className="h-full rounded-full bg-gradient-to-r from-emerald-500/80 to-emerald-400/60"
                      />
                    </div>
                    <div className="mt-1 font-mono text-[10px] text-white/40">
                      {outputRatio.toFixed(1)}% of total tokens
                    </div>
                  </div>

                  {/* Cache Read Tokens */}
                  {data.summary.cacheReadTokens > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-mono text-xs text-white/70">Cache Read</span>
                        <span className="font-mono text-xs text-white">{formatTokens(data.summary.cacheReadTokens)}</span>
                      </div>
                      <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min((data.summary.cacheReadTokens / totalTokens) * 100, 100)}%` }}
                          transition={{ duration: 0.8, delay: 0.4 }}
                          className="h-full rounded-full bg-gradient-to-r from-purple-500/80 to-purple-400/60"
                        />
                      </div>
                      <div className="mt-1 font-mono text-[10px] text-white/40">
                        Cached tokens (not counted in total)
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>

              {/* Model Breakdown */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="rounded-lg border border-white/5 bg-white/[0.02] p-6"
              >
                <h3 className="font-mono text-xs uppercase tracking-wider text-white/60 mb-6">
                  Models Used
                </h3>

                <div className="space-y-3">
                  {data.modelBreakdown.slice(0, 8).map((model, i) => {
                    const maxTokens = data.modelBreakdown[0]?.tokens || 1;
                    const percentage = (model.tokens / maxTokens) * 100;
                    const displayName = formatModelName(model.model);

                    return (
                      <motion.div
                        key={`${model.model}-${model.tool}`}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.35 + i * 0.03 }}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <div
                              className={`w-1.5 h-1.5 rounded-full ${
                                model.tool === 'claude_code' ? 'bg-amber-500' : 'bg-cyan-500'
                              }`}
                            />
                            <span className="font-mono text-xs text-white/80 truncate max-w-[180px]">
                              {displayName}
                            </span>
                          </div>
                          <span className="font-mono text-xs text-white/50">
                            {formatTokens(model.tokens)}
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${percentage}%` }}
                            transition={{ duration: 0.6, delay: 0.4 + i * 0.03 }}
                            className={`h-full rounded-full ${
                              model.tool === 'claude_code'
                                ? 'bg-gradient-to-r from-amber-500/80 to-amber-400/60'
                                : 'bg-gradient-to-r from-cyan-500/80 to-cyan-400/60'
                            }`}
                          />
                        </div>
                      </motion.div>
                    );
                  })}
                  {data.modelBreakdown.length > 8 && (
                    <div className="font-mono text-[10px] text-white/30 pt-2">
                      +{data.modelBreakdown.length - 8} more models
                    </div>
                  )}
                </div>
              </motion.div>
            </div>

            {/* Activity Metadata */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 }}
              className="rounded-lg border border-white/5 bg-white/[0.02] p-6"
            >
              <h3 className="font-mono text-xs uppercase tracking-wider text-white/60 mb-4">
                Activity
              </h3>
              <div className="grid grid-cols-4 gap-8">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-wider text-white/40 mb-1">First Active</p>
                  <p className="font-mono text-sm text-white">{formatDate(data.summary.firstActive)}</p>
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-wider text-white/40 mb-1">Last Active</p>
                  <p className="font-mono text-sm text-white">{formatDate(data.summary.lastActive)}</p>
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-wider text-white/40 mb-1">Days Active</p>
                  <p className="font-mono text-sm text-white">{data.summary.daysActive}</p>
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-wider text-white/40 mb-1">Total Requests</p>
                  <p className="font-mono text-sm text-white">{data.summary.requestCount.toLocaleString()}</p>
                </div>
              </div>
            </motion.div>
          </div>
        ) : (
          <div className="flex h-64 items-center justify-center">
            <div className="font-mono text-sm text-white/40">No data found for this user</div>
          </div>
        )}
      </main>
    </div>
  );
}
