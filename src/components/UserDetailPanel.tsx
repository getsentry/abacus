'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { formatTokens, formatCurrency, formatModelName } from '@/lib/utils';
import { DEFAULT_DAYS } from '@/lib/constants';
import { getToolConfig, formatToolName, calculateToolBreakdown, type ToolBreakdown } from '@/lib/tools';

interface UserDetails {
  summary: {
    email: string;
    totalTokens: number;
    totalCost: number;
    claudeCodeTokens: number;
    cursorTokens: number;
    lastActive: string;
    firstActive: string;
  };
  modelBreakdown: { model: string; tokens: number; cost: number; tool: string }[];
  dailyUsage: { date: string; claudeCode: number; cursor: number }[];
}

interface UserDetailPanelProps {
  email: string | null;
  onClose: () => void;
  days?: number;
}

export function UserDetailPanel({ email, onClose, days = DEFAULT_DAYS }: UserDetailPanelProps) {
  const [details, setDetails] = useState<UserDetails | null>(null);
  const [loading, setLoading] = useState(false);

  // Show refreshing state when loading but already have data
  const isRefreshing = loading && details !== null;

  useEffect(() => {
    if (email) {
      setLoading(true);
      fetch(`/api/users/${encodeURIComponent(email)}?days=${days}`)
        .then(res => res.json())
        .then(data => {
          setDetails(data);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    } else {
      setDetails(null);
    }
  }, [email, days]);

  const user = details?.summary;

  // Calculate tool breakdown from model data
  const toolBreakdown = useMemo<ToolBreakdown[]>(() => {
    if (!details?.modelBreakdown) return [];
    return calculateToolBreakdown(details.modelBreakdown);
  }, [details?.modelBreakdown]);

  return (
    <AnimatePresence>
      {email && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-30 bg-black/50"
          />

          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, x: 300 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 300 }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 z-40 h-full w-full sm:w-[480px] border-l border-white/10 bg-[#0a0a0f]/95 p-4 sm:p-6 backdrop-blur-xl overflow-y-auto"
          >
            <button
              onClick={onClose}
              className="absolute right-4 top-4 text-white/40 hover:text-white transition-colors"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {loading && !details ? (
              <div className="flex h-full items-center justify-center">
                <div className="font-mono text-sm text-white/40">Loading...</div>
              </div>
            ) : user ? (
              <div className={`transition-opacity duration-300 ${isRefreshing ? 'opacity-60' : 'opacity-100'}`}>
                <div className="mb-6">
                  <h2 className="font-display text-2xl text-white">{user.email}</h2>
                  <Link
                    href={`/users/${encodeURIComponent(user.email.split('@')[0])}?days=${days}`}
                    className="mt-3 inline-flex items-center gap-1.5 font-mono text-xs text-amber-400 hover:text-amber-300 transition-colors"
                  >
                    View Full Details
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                </div>

                <div className="space-y-4">
                  <div className="rounded-lg border border-white/5 bg-white/[0.02] p-4">
                    <p className="font-mono text-[10px] uppercase tracking-wider text-white/40">Total Tokens</p>
                    <p className="mt-1 font-display text-2xl text-white">{formatTokens(user.totalTokens)}</p>
                    <p className="font-mono text-xs text-white/50">{formatCurrency(user.totalCost)} estimated cost</p>
                  </div>

                  {/* Tool Breakdown - Dynamic */}
                  {toolBreakdown.length > 0 && (
                    <div className="rounded-lg border border-white/5 bg-white/[0.02] p-4">
                      <p className="mb-3 font-mono text-[10px] uppercase tracking-wider text-white/40">Tool Breakdown</p>

                      {/* Stacked bar */}
                      <div className="mb-4">
                        <div className="h-2 rounded-full bg-white/5 overflow-hidden flex">
                          {toolBreakdown.map((t, i) => {
                            const config = getToolConfig(t.tool);
                            return (
                              <div
                                key={t.tool}
                                className={`h-full ${config.bg} ${i === 0 ? 'rounded-l-full' : ''} ${i === toolBreakdown.length - 1 ? 'rounded-r-full' : ''}`}
                                style={{ width: `${t.percentage}%` }}
                              />
                            );
                          })}
                        </div>
                      </div>

                      {/* Tool list */}
                      <div className="space-y-2">
                        {toolBreakdown.map(t => {
                          const config = getToolConfig(t.tool);
                          return (
                            <div key={t.tool} className="flex justify-between items-center">
                              <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${config.bg}`} />
                                <span className={`font-mono text-xs ${config.text}`}>
                                  {formatToolName(t.tool)}
                                </span>
                              </div>
                              <div className="text-right">
                                <span className="font-mono text-xs text-white/60">
                                  {formatTokens(t.tokens)}
                                </span>
                                <span className="font-mono text-[10px] text-white/30 ml-2">
                                  {t.percentage.toFixed(0)}%
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {details?.modelBreakdown && details.modelBreakdown.length > 0 && (
                    <div className="rounded-lg border border-white/5 bg-white/[0.02] p-4">
                      <p className="mb-3 font-mono text-[10px] uppercase tracking-wider text-white/40">Models Used</p>
                      <div className="space-y-2">
                        {details.modelBreakdown.slice(0, 5).map(m => {
                          const config = getToolConfig(m.tool);
                          return (
                            <div key={`${m.model}-${m.tool}`} className="flex justify-between items-center">
                              <div className="flex items-center gap-2">
                                <div className={`w-1.5 h-1.5 rounded-full ${config.bg}`} />
                                <span className="font-mono text-xs text-white/70 truncate max-w-[180px]">
                                  {formatModelName(m.model)}
                                </span>
                              </div>
                              <span className="font-mono text-xs text-white/40">{formatTokens(m.tokens)}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {details?.dailyUsage && details.dailyUsage.length > 0 && (
                    <div className="rounded-lg border border-white/5 bg-white/[0.02] p-4">
                      <p className="mb-3 font-mono text-[10px] uppercase tracking-wider text-white/40">Recent Activity</p>
                      <div className="flex h-16 items-end gap-1">
                        {details.dailyUsage.slice(-14).map((d) => {
                          const total = Number(d.claudeCode) + Number(d.cursor);
                          const maxDaily = Math.max(...details.dailyUsage.slice(-14).map(dd => Number(dd.claudeCode) + Number(dd.cursor)), 1);
                          const height = (total / maxDaily) * 100;
                          return (
                            <div
                              key={d.date}
                              className="flex-1 rounded-t bg-gradient-to-t from-amber-500/60 to-amber-500"
                              style={{ height: `${Math.max(height, total > 0 ? 4 : 0)}%` }}
                            />
                          );
                        })}
                      </div>
                      <div className="mt-1 flex justify-between font-mono text-[8px] text-white/30">
                        <span>14d ago</span>
                        <span>Today</span>
                      </div>
                    </div>
                  )}

                  <div className="rounded-lg border border-white/5 bg-white/[0.02] p-4">
                    <div className="flex justify-between">
                      <span className="font-mono text-[10px] uppercase tracking-wider text-white/40">First Active</span>
                      <span className="font-mono text-xs text-white/60">{user.firstActive}</span>
                    </div>
                    <div className="flex justify-between mt-2">
                      <span className="font-mono text-[10px] uppercase tracking-wider text-white/40">Last Active</span>
                      <span className="font-mono text-xs text-white/60">{user.lastActive}</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center">
                <div className="font-mono text-sm text-white/40">User not found</div>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
