'use client';

import { motion } from 'framer-motion';
import { formatTokens, formatCurrency } from '@/lib/utils';
import { PageContainer } from './PageContainer';

interface LifetimeStatsProps {
  totalCost: number;
  totalTokens: number;
  firstRecordDate: string | null;
  totalUsers?: number;
  totalCommits?: number;
  aiAttributedCommits?: number;
}

function formatSinceDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const month = date.toLocaleString('en-US', { month: 'short' });
  const year = date.getFullYear().toString().slice(-2);
  return `since ${month} '${year}`;
}

export function LifetimeStats({ totalCost, totalTokens, firstRecordDate, totalUsers, totalCommits, aiAttributedCommits }: LifetimeStatsProps) {
  const hasData = totalTokens > 0;

  if (!hasData) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="border-b border-dashed border-white/10 bg-white/[0.01]"
    >
      <PageContainer className="flex items-center min-h-[48px]">
        <div className="flex items-center gap-6 sm:gap-8 flex-wrap">
          <span className="text-xs font-medium uppercase tracking-wider text-muted leading-none">
            lifetime
          </span>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="flex items-center gap-2"
          >
            <span className="font-display text-lg sm:text-xl font-light text-primary leading-none">
              {formatTokens(totalTokens)}
            </span>
            <span className="text-xs text-secondary leading-none">tokens</span>
          </motion.div>

          <div className="w-px h-4 bg-white/10" />

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15 }}
            className="flex items-center gap-2"
          >
            <span className="font-display text-lg sm:text-xl font-light text-primary leading-none">
              {formatCurrency(totalCost)}
            </span>
            <span className="text-xs text-secondary leading-none">total spend</span>
          </motion.div>

          {totalUsers !== undefined && (
            <>
              <div className="w-px h-4 bg-white/10 hidden sm:block" />
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="hidden sm:flex items-center gap-2"
              >
                <span className="font-display text-lg sm:text-xl font-light text-primary leading-none">
                  {totalUsers}
                </span>
                <span className="text-xs text-secondary leading-none">users</span>
              </motion.div>
            </>
          )}

          {aiAttributedCommits !== undefined && totalCommits !== undefined && totalCommits > 0 && (
            <>
              <div className="w-px h-4 bg-white/10 hidden sm:block" />
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.25 }}
                className="hidden sm:flex items-center gap-2"
              >
                <span className="font-display text-lg sm:text-xl font-light text-primary leading-none">
                  {aiAttributedCommits.toLocaleString()}
                </span>
                <span className="text-xs text-secondary leading-none">commits attributed to AI</span>
              </motion.div>
            </>
          )}

          {firstRecordDate && (
            <>
              <div className="w-px h-4 bg-white/10 hidden md:block" />
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="hidden md:block text-xs text-muted leading-none"
              >
                {formatSinceDate(firstRecordDate)}
              </motion.span>
            </>
          )}
        </div>
      </PageContainer>
    </motion.div>
  );
}
