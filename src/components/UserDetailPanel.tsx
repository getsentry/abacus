'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState, useMemo } from 'react';
import { formatTokens, formatCurrency, formatModelName } from '@/lib/utils';
import { aggregateToWeekly } from '@/lib/dateUtils';
import { getToolConfig, formatToolName, calculateToolBreakdown, type ToolBreakdown } from '@/lib/tools';
import { useTimeRange } from '@/contexts/TimeRangeContext';
import { AppLink } from '@/components/AppLink';
import { Card } from '@/components/Card';
import { SectionLabel } from '@/components/SectionLabel';
import { DOMAIN } from '@/lib/constants';
import { calculateDelta } from '@/lib/comparison';

interface UserDetails {
  summary: {
    email: string;
    totalTokens: number;
    totalCost: number;
    claudeCodeTokens: number;
    cursorTokens: number;
    lastActive: string;
    firstActive: string;
    daysActive?: number;
  };
  modelBreakdown: { model: string; tokens: number; cost: number; tool: string }[];
  dailyUsage: { date: string; claudeCode: number; cursor: number }[];
  previousPeriod?: {
    totalTokens: number;
    totalCost: number;
  };
}

interface UserDetailPanelProps {
  email: string | null;
  onClose: () => void;
}

// Skeleton loader for cards
function CardSkeleton({ lines = 2 }: { lines?: number }) {
  return (
    <Card padding="md" className="animate-pulse">
      <div className="h-2 w-20 bg-white/10 rounded mb-3" />
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className={`h-4 bg-white/5 rounded ${i === 0 ? 'w-32' : 'w-24'} ${i > 0 ? 'mt-2' : 'mt-1'}`} />
      ))}
    </Card>
  );
}

export function UserDetailPanel({ email, onClose }: UserDetailPanelProps) {
  const { getDateParams, getDisplayLabel } = useTimeRange();
  const [details, setDetails] = useState<UserDetails | null>(null);
  const [loading, setLoading] = useState(false);

  const rangeLabel = getDisplayLabel();

  // Construct display email from prop (with domain if available)
  const displayEmail = email?.includes('@') ? email : (email && DOMAIN ? `${email}@${DOMAIN}` : email);
  const username = email?.includes('@') ? email.split('@')[0] : email;

  useEffect(() => {
    if (email) {
      setLoading(true);
      setDetails(null); // Clear previous user's data
      const { startDate, endDate } = getDateParams();

      // Fetch user details
      fetch(`/api/users/${encodeURIComponent(email)}?startDate=${startDate}&endDate=${endDate}&comparison=true`)
        .then(res => res.json())
        .then(data => {
          setDetails(data);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    } else {
      setDetails(null);
    }
  }, [email, getDateParams]);

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
            className="fixed right-0 top-0 z-40 h-full w-full sm:w-[480px] border-l border-white/10 bg-[#050507]/95 p-4 sm:p-6 backdrop-blur-xl overflow-y-auto"
          >
            <button
              onClick={onClose}
              className="absolute right-4 top-4 text-white/40 hover:text-white transition-colors cursor-pointer"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Header - Always visible immediately */}
            <div className="mb-6">
              <h2 className="font-display text-2xl text-white">{user?.email || displayEmail}</h2>
              <AppLink
                href={`/users/${encodeURIComponent(username || '')}`}
                onClick={onClose}
                className="mt-3 inline-flex items-center gap-1.5 font-mono text-xs text-amber-400 hover:text-amber-300 transition-colors"
              >
                View Full Details
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </AppLink>
            </div>

            {/* Content - Shows skeleton while loading, then animates in */}
            {loading ? (
              <div className="space-y-4">
                <CardSkeleton lines={2} />
                <CardSkeleton lines={3} />
                <CardSkeleton lines={4} />
                <CardSkeleton lines={2} />
              </div>
            ) : user ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="space-y-4"
              >
                  <Card padding="md">
                    <div className="flex items-baseline justify-between">
                      <SectionLabel>Total Tokens</SectionLabel>
                      <p className="font-mono text-[10px] text-faint">{rangeLabel}</p>
                    </div>
                    <div className="mt-1 flex items-baseline gap-2">
                      <p className="font-display text-2xl text-white">{formatTokens(user.totalTokens)}</p>
                      {details?.previousPeriod && (() => {
                        const delta = calculateDelta(Number(user.totalTokens), details.previousPeriod.totalTokens);
                        if (delta === undefined) return null;
                        return (
                          <span className={`font-mono text-xs ${delta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {delta >= 0 ? '↑' : '↓'} {Math.abs(delta)}%
                          </span>
                        );
                      })()}
                    </div>
                    <p className="font-mono text-xs text-white/50">{formatCurrency(user.totalCost)} estimated cost</p>
                  </Card>

                  {/* Tool Breakdown - Dynamic */}
                  {toolBreakdown.length > 0 && (
                    <Card padding="md">
                      <SectionLabel margin="md">Tool Breakdown</SectionLabel>

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
                                <span className="font-mono text-[10px] text-faint ml-2">
                                  {t.percentage.toFixed(0)}%
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </Card>
                  )}

                  {details?.modelBreakdown && details.modelBreakdown.length > 0 && (
                    <Card padding="md">
                      <SectionLabel margin="md">Models Used</SectionLabel>
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
                    </Card>
                  )}

                  {details?.dailyUsage && details.dailyUsage.length > 0 && (() => {
                    const AGGREGATION_THRESHOLD = 90;
                    const isWeekly = details.dailyUsage.length > AGGREGATION_THRESHOLD;
                    const displayData = isWeekly
                      ? aggregateToWeekly(details.dailyUsage)
                      : details.dailyUsage;
                    const maxDaily = Math.max(...displayData.map(dd => Number(dd.claudeCode) + Number(dd.cursor)), 1);

                    return (
                      <Card padding="md">
                        <SectionLabel margin="md">{isWeekly ? 'Weekly Activity' : 'Daily Activity'}</SectionLabel>
                        <div className="flex h-16 items-end gap-0.5">
                          {displayData.map((d) => {
                            const total = Number(d.claudeCode) + Number(d.cursor);
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
                        <div className="mt-1 flex justify-between font-mono text-[8px] text-faint">
                          <span>{details.dailyUsage.length}d ago</span>
                          <span>Today</span>
                        </div>
                      </Card>
                    );
                  })()}

                <Card padding="md">
                  <div className="flex justify-between">
                    <SectionLabel>First Active</SectionLabel>
                    <span className="font-mono text-xs text-white/60">{user.firstActive}</span>
                  </div>
                  <div className="flex justify-between mt-2">
                    <SectionLabel>Last Active</SectionLabel>
                    <span className="font-mono text-xs text-white/60">{user.lastActive}</span>
                  </div>
                </Card>
              </motion.div>
            ) : !loading ? (
              <div className="flex h-64 items-center justify-center">
                <div className="font-mono text-sm text-white/40">User not found</div>
              </div>
            ) : null}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
