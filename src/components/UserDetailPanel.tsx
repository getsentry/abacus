'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState, useMemo } from 'react';
import { formatTokens, formatCurrency, formatModelName } from '@/lib/utils';
import { getToolConfig, formatToolName, calculateToolBreakdown, type ToolBreakdown } from '@/lib/tools';
import { useTimeRange } from '@/contexts/TimeRangeContext';
import { AppLink } from '@/components/AppLink';
import { AdoptionBadge } from '@/components/AdoptionBadge';
import { DOMAIN } from '@/lib/constants';
import {
  calculateAdoptionScore,
  getAdoptionStage,
  getStageGuidance,
  formatIntensity,
  isInactive,
} from '@/lib/adoption';
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
    <div className="rounded-lg border border-white/5 bg-white/[0.02] p-4 animate-pulse">
      <div className="h-2 w-20 bg-white/10 rounded mb-3" />
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className={`h-4 bg-white/5 rounded ${i === 0 ? 'w-32' : 'w-24'} ${i > 0 ? 'mt-2' : 'mt-1'}`} />
      ))}
    </div>
  );
}

export function UserDetailPanel({ email, onClose }: UserDetailPanelProps) {
  const { getDateParams, getDisplayLabel } = useTimeRange();
  const [details, setDetails] = useState<UserDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [percentile, setPercentile] = useState<number | null>(null);

  const rangeLabel = getDisplayLabel();

  // Construct display email from prop (with domain if available)
  const displayEmail = email?.includes('@') ? email : (email && DOMAIN ? `${email}@${DOMAIN}` : email);
  const username = email?.includes('@') ? email.split('@')[0] : email;

  useEffect(() => {
    if (email) {
      setLoading(true);
      setDetails(null); // Clear previous user's data
      setPercentile(null);
      const { startDate, endDate } = getDateParams();

      // Fetch user details
      fetch(`/api/users/${encodeURIComponent(email)}?startDate=${startDate}&endDate=${endDate}&comparison=true`)
        .then(res => res.json())
        .then(data => {
          setDetails(data);
          setLoading(false);
        })
        .catch(() => setLoading(false));

      // Fetch percentile separately
      fetch(`/api/users/${encodeURIComponent(email)}/percentile?startDate=${startDate}&endDate=${endDate}`)
        .then(res => res.json())
        .then(data => {
          if (data.percentile !== undefined) {
            setPercentile(data.percentile);
          }
        })
        .catch(() => { /* Percentile is optional */ });
    } else {
      setDetails(null);
      setPercentile(null);
    }
  }, [email, getDateParams]);

  const user = details?.summary;

  // Calculate tool breakdown from model data
  const toolBreakdown = useMemo<ToolBreakdown[]>(() => {
    if (!details?.modelBreakdown) return [];
    return calculateToolBreakdown(details.modelBreakdown);
  }, [details?.modelBreakdown]);

  // Calculate adoption metrics
  const adoptionData = useMemo(() => {
    if (!user) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const lastActiveDate = new Date(user.lastActive);
    lastActiveDate.setHours(0, 0, 0, 0);
    const daysSinceLastActive = Math.floor((today.getTime() - lastActiveDate.getTime()) / (1000 * 60 * 60 * 24));

    // Calculate daysActive from daily usage if not provided
    const daysActive = user.daysActive ?? details?.dailyUsage?.filter(d =>
      Number(d.claudeCode) + Number(d.cursor) > 0
    ).length ?? 1;

    const adoptionMetrics = {
      totalTokens: Number(user.totalTokens),
      daysActive,
      daysSinceLastActive,
    };

    const score = calculateAdoptionScore(adoptionMetrics);
    const stage = getAdoptionStage(adoptionMetrics);
    const inactive = isInactive(daysSinceLastActive);
    const guidance = getStageGuidance(stage);
    const avgTokensPerDay = daysActive > 0 ? Number(user.totalTokens) / daysActive : 0;

    return {
      score,
      stage,
      inactive,
      daysSinceLastActive,
      guidance,
      avgTokensPerDay,
      daysActive,
    };
  }, [user, details?.dailyUsage]);

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
                  <div className="rounded-lg border border-white/5 bg-white/[0.02] p-4">
                    <div className="flex items-baseline justify-between">
                      <p className="font-mono text-xs uppercase tracking-wider text-white/60">Total Tokens</p>
                      <p className="font-mono text-[10px] text-white/30">{rangeLabel}</p>
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
                  </div>

                  {/* Adoption Journey - Redesigned */}
                  {adoptionData && (
                    <div className={`rounded-lg border bg-gradient-to-b from-white/[0.03] to-transparent overflow-hidden ${
                      adoptionData.stage === 'exploring' ? 'border-slate-500/20' :
                      adoptionData.stage === 'building_momentum' ? 'border-amber-500/20' :
                      adoptionData.stage === 'in_flow' ? 'border-cyan-500/20' :
                      'border-emerald-500/20'
                    }`}>
                      {/* Header with stage glow */}
                      <div className={`px-4 pt-4 pb-3 relative ${
                        adoptionData.stage === 'exploring' ? 'bg-slate-500/5' :
                        adoptionData.stage === 'building_momentum' ? 'bg-amber-500/5' :
                        adoptionData.stage === 'in_flow' ? 'bg-cyan-500/5' :
                        'bg-emerald-500/5'
                      }`}>
                        <div className="flex items-center gap-2">
                          <AdoptionBadge
                            stage={adoptionData.stage}
                            size="md"
                            showLabel={false}
                            isInactive={adoptionData.inactive}
                          />
                          <p className={`font-mono text-sm ${
                            adoptionData.inactive ? 'text-zinc-400' :
                            adoptionData.stage === 'exploring' ? 'text-slate-300' :
                            adoptionData.stage === 'building_momentum' ? 'text-amber-300' :
                            adoptionData.stage === 'in_flow' ? 'text-cyan-300' :
                            'text-emerald-300'
                          }`}>
                            {adoptionData.inactive ? `Inactive (${adoptionData.daysSinceLastActive}d)` : adoptionData.guidance.headline}
                          </p>
                        </div>
                      </div>

                      {/* Intensity Stats */}
                      {!adoptionData.inactive && (
                        <div className="px-4 py-3 border-t border-white/5">
                          <div className="flex items-baseline justify-between mb-1">
                            <p className="font-display text-xl text-white">
                              {formatIntensity(adoptionData.avgTokensPerDay)}
                              <span className="text-white/40 text-sm ml-1">tokens/day</span>
                            </p>
                            {percentile !== null && percentile > 50 && (
                              <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded ${
                                percentile >= 75 ? 'bg-emerald-500/20 text-emerald-400' :
                                'bg-cyan-500/20 text-cyan-400'
                              }`}>
                                Top {100 - percentile}%
                              </span>
                            )}
                          </div>
                          <p className="font-mono text-[10px] text-white/30 mt-0.5">
                            {adoptionData.daysActive} active days in period
                          </p>
                        </div>
                      )}

                      {/* Inactive message */}
                      {adoptionData.inactive && (
                        <div className="px-4 py-3 border-t border-white/5">
                          <p className="font-mono text-[11px] text-white/40 leading-relaxed">
                            {adoptionData.guidance.description}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Tool Breakdown - Dynamic */}
                  {toolBreakdown.length > 0 && (
                    <div className="rounded-lg border border-white/5 bg-white/[0.02] p-4">
                      <p className="mb-3 font-mono text-xs uppercase tracking-wider text-white/60">Tool Breakdown</p>

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
                      <p className="mb-3 font-mono text-xs uppercase tracking-wider text-white/60">Models Used</p>
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
                      <p className="mb-3 font-mono text-xs uppercase tracking-wider text-white/60">Daily Activity</p>
                      <div className="flex h-16 items-end gap-0.5">
                        {details.dailyUsage.map((d) => {
                          const total = Number(d.claudeCode) + Number(d.cursor);
                          const maxDaily = Math.max(...details.dailyUsage.map(dd => Number(dd.claudeCode) + Number(dd.cursor)), 1);
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
                        <span>{details.dailyUsage.length}d ago</span>
                        <span>Today</span>
                      </div>
                    </div>
                  )}

                <div className="rounded-lg border border-white/5 bg-white/[0.02] p-4">
                  <div className="flex justify-between">
                    <span className="font-mono text-xs uppercase tracking-wider text-white/60">First Active</span>
                    <span className="font-mono text-xs text-white/60">{user.firstActive}</span>
                  </div>
                  <div className="flex justify-between mt-2">
                    <span className="font-mono text-xs uppercase tracking-wider text-white/60">Last Active</span>
                    <span className="font-mono text-xs text-white/60">{user.lastActive}</span>
                  </div>
                </div>
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
