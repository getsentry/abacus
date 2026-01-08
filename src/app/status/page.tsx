'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { AppHeader } from '@/components/AppHeader';
import { PageContainer } from '@/components/PageContainer';
import { formatTokens, formatCurrency } from '@/lib/utils';

interface ProviderStatus {
  id: string;
  name: string;
  color: 'amber' | 'cyan';
  forwardSync: {
    lastSyncedDate: string | null;
    status: 'up_to_date' | 'behind' | 'never_synced';
  };
  backfill: {
    oldestDate: string | null;
    status: 'complete' | 'in_progress' | 'not_started';
  };
}

interface CronJob {
  path: string;
  schedule: string;
  type: 'forward' | 'backfill';
}

interface UnattributedStats {
  totalTokens: number;
  totalCost: number;
}

interface StatusData {
  providers: Record<string, ProviderStatus>;
  anthropic: ProviderStatus | null;
  cursor: ProviderStatus | null;
  crons: CronJob[];
  unattributed: UnattributedStats;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  });
}

function formatDateShort(dateStr: string | null): string {
  if (!dateStr) return 'N/A';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

function StatusBadge({ status }: { status: 'up_to_date' | 'behind' | 'never_synced' }) {
  const config = {
    up_to_date: { text: 'Up to date', className: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
    behind: { text: 'Behind', className: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
    never_synced: { text: 'Never synced', className: 'text-white/40 bg-white/5 border-white/10' }
  };
  const { text, className } = config[status];
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-mono border ${className}`}>
      {text}
    </span>
  );
}

function BackfillBadge({ status }: { status: 'complete' | 'in_progress' | 'not_started' }) {
  const config = {
    complete: { text: 'Complete', className: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
    in_progress: { text: 'In Progress', className: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20' },
    not_started: { text: 'Not Started', className: 'text-white/40 bg-white/5 border-white/10' }
  };
  const { text, className } = config[status];
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-mono border ${className}`}>
      {text}
    </span>
  );
}


function ProviderCard({ provider, index }: { provider: ProviderStatus; index: number }) {
  const borderColor = provider.color === 'amber' ? 'border-l-amber-500' : 'border-l-cyan-500';
  const dotColor = provider.color === 'amber' ? 'bg-amber-500' : 'bg-cyan-500';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
      className={`bg-white/[0.02] border border-white/5 ${borderColor} border-l-2 rounded-lg p-6`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-6">
        <div className={`w-2 h-2 rounded-full ${dotColor}`} />
        <h2 className="font-display text-lg text-white">{provider.name}</h2>
      </div>

      {/* Forward Sync Section */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-mono">
            Forward Sync
          </span>
          <StatusBadge status={provider.forwardSync.status} />
        </div>
        <div className="text-white/60 text-sm font-mono">
          Last synced: {formatDate(provider.forwardSync.lastSyncedDate)}
        </div>
      </div>

      {/* Backfill Section */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-mono">
            Historical Data
          </span>
          <BackfillBadge status={provider.backfill.status} />
        </div>
        <div className="text-white/60 text-sm font-mono">
          {provider.backfill.oldestDate
            ? `Data from ${formatDateShort(provider.backfill.oldestDate)}`
            : 'No historical data'
          }
        </div>
      </div>
    </motion.div>
  );
}

export default function StatusPage() {
  const [data, setData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchStatus() {
      try {
        const response = await fetch('/api/status');
        if (!response.ok) throw new Error('Failed to fetch status');
        const result = await response.json();
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }
    fetchStatus();
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white grid-bg">
      <AppHeader />

      {/* Page Title */}
      <div className="border-b border-white/5">
        <PageContainer className="py-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">
            Provider sync status
          </p>
        </PageContainer>
      </div>

      {/* Content */}
      <main className="py-8">
        <PageContainer>
        {loading ? (
          <div className="text-white/40 text-center py-12 font-mono">Loading...</div>
        ) : error ? (
          <div className="text-red-400 text-center py-12 font-mono">{error}</div>
        ) : data ? (
          <div className="space-y-8">
            {/* Unattributed Usage Alert */}
            {data.unattributed && data.unattributed.totalTokens > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="bg-white/[0.02] border border-amber-500/20 rounded-lg p-6"
              >
                <div className="flex items-start gap-4">
                  <div className="text-amber-500 text-2xl">!</div>
                  <div className="flex-1">
                    <h3 className="font-display text-lg text-white mb-2">Unattributed Usage</h3>
                    <p className="font-mono text-sm text-white/60 mb-4">
                      Usage from API keys that aren&apos;t mapped to users. Consider mapping these keys to track usage by person.
                    </p>
                    <div className="flex items-center gap-6">
                      <div>
                        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/40 block mb-1">
                          Tokens
                        </span>
                        <span className="font-display text-xl text-white">
                          {formatTokens(data.unattributed.totalTokens)}
                        </span>
                      </div>
                      <div>
                        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/40 block mb-1">
                          Estimated Cost
                        </span>
                        <span className="font-display text-xl text-white">
                          {formatCurrency(data.unattributed.totalCost)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Provider Cards */}
            {Object.keys(data.providers).length > 0 ? (
              <div className={`grid grid-cols-1 ${Object.keys(data.providers).length > 1 ? 'md:grid-cols-2' : ''} gap-6`}>
                {Object.values(data.providers).map((provider, index) => (
                  <ProviderCard key={provider.id} provider={provider} index={index} />
                ))}
              </div>
            ) : (
              <div className="bg-white/[0.02] border border-white/5 rounded-lg p-8 text-center">
                <div className="text-white/40 font-mono text-sm mb-2">No providers configured</div>
                <div className="text-white/20 font-mono text-xs">
                  Set ANTHROPIC_ADMIN_KEY or CURSOR_ADMIN_KEY to enable tracking
                </div>
              </div>
            )}

            {/* Cron Jobs Table */}
            {data.crons.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 }}
                className="bg-white/[0.02] border border-white/5 rounded-lg overflow-hidden"
              >
                <div className="px-6 py-4 border-b border-white/5">
                  <h2 className="font-display text-lg text-white">Scheduled Jobs</h2>
                </div>
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/5 bg-white/[0.02]">
                      <th className="px-6 py-3 text-left text-[10px] uppercase tracking-[0.2em] text-white/40 font-mono">
                        Endpoint
                      </th>
                      <th className="px-6 py-3 text-left text-[10px] uppercase tracking-[0.2em] text-white/40 font-mono">
                        Type
                      </th>
                      <th className="px-6 py-3 text-left text-[10px] uppercase tracking-[0.2em] text-white/40 font-mono">
                        Schedule
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.crons.map((cron, i) => (
                      <motion.tr
                        key={cron.path}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.3, delay: 0.4 + i * 0.05 }}
                        className="border-b border-white/5 last:border-0"
                      >
                        <td className="px-6 py-3 text-sm text-white/80 font-mono">
                          {cron.path}
                        </td>
                        <td className="px-6 py-3">
                          <span className={`text-[10px] uppercase tracking-wider font-mono px-2 py-0.5 rounded ${
                            cron.type === 'forward'
                              ? 'text-emerald-400 bg-emerald-500/10'
                              : 'text-cyan-400 bg-cyan-500/10'
                          }`}>
                            {cron.type}
                          </span>
                        </td>
                        <td className="px-6 py-3 text-sm text-white/60 font-mono">
                          {cron.schedule}
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </motion.div>
            )}
          </div>
        ) : null}
        </PageContainer>
      </main>
    </div>
  );
}
