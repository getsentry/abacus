'use client';

import { motion } from 'framer-motion';

interface StatCardProps {
  label: string;
  value: string;
  subValue?: string;
  trend?: number;
  accentColor?: string;
  delay?: number;
}

export function StatCard({
  label,
  value,
  subValue,
  trend,
  accentColor = '#f59e0b',
  delay = 0
}: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      className="relative overflow-hidden rounded-lg border border-white/5 bg-white/[0.02] p-5 backdrop-blur-sm"
    >
      <div
        className="absolute left-0 top-0 h-full w-1"
        style={{ backgroundColor: accentColor }}
      />
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">{label}</p>
      <p className="mt-2 font-display text-3xl font-light tracking-tight text-white">{value}</p>
      <div className="mt-2 flex items-center gap-3">
        {subValue && (
          <span className="font-mono text-xs text-white/50">{subValue}</span>
        )}
        {trend !== undefined && (
          <span className={`font-mono text-xs ${trend >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}%
          </span>
        )}
      </div>
    </motion.div>
  );
}
