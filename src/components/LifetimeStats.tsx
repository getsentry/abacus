'use client';

import { motion } from 'framer-motion';
import { formatTokens, formatCurrency } from '@/lib/utils';

interface LifetimeStatsProps {
  totalCost: number;
  totalTokens: number;
  firstRecordDate: string | null;
  totalUsers?: number;
}

function formatSinceDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const month = date.toLocaleString('en-US', { month: 'short' });
  const year = date.getFullYear().toString().slice(-2);
  return `since ${month} '${year}`;
}

export function LifetimeStats({ totalCost, totalTokens, firstRecordDate, totalUsers }: LifetimeStatsProps) {
  const hasData = totalTokens > 0;

  if (!hasData) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="border-b border-dashed border-white/10 bg-white/[0.01]"
    >
      <div className="px-4 sm:px-8 flex items-center min-h-[48px]">
        <div className="flex items-center gap-6 sm:gap-8 flex-wrap">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/30 leading-none">
            Lifetime
          </span>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="flex items-center gap-2"
          >
            <span className="font-display text-lg sm:text-xl font-light text-white/90 leading-none">
              {formatTokens(totalTokens)}
            </span>
            <span className="font-mono text-[10px] text-white/40 leading-none">tokens</span>
          </motion.div>

          <div className="w-px h-4 bg-white/10" />

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15 }}
            className="flex items-center gap-2"
          >
            <span className="font-display text-lg sm:text-xl font-light text-white/90 leading-none">
              {formatCurrency(totalCost)}
            </span>
            <span className="font-mono text-[10px] text-white/40 leading-none">total spend</span>
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
                <span className="font-display text-lg sm:text-xl font-light text-white/90 leading-none">
                  {totalUsers}
                </span>
                <span className="font-mono text-[10px] text-white/40 leading-none">users</span>
              </motion.div>
            </>
          )}

          {firstRecordDate && (
            <>
              <div className="w-px h-4 bg-white/10 hidden md:block" />
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.25 }}
                className="hidden md:block font-mono text-[10px] text-white/30 leading-none"
              >
                {formatSinceDate(firstRecordDate)}
              </motion.span>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}
