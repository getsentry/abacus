'use client';

import { motion } from 'framer-motion';
import { formatTokens } from '@/lib/utils';

interface ModelData {
  model: string;
  tokens: number;
  percentage: number;
  tool: string;
}

interface ModelBreakdownProps {
  data: ModelData[];
  days?: number;
}

function getModelColor(model: string, tool: string): string {
  if (tool === 'cursor') {
    return '#06b6d4'; // cyan
  }
  // Claude models - amber spectrum
  if (model.includes('opus')) return '#f59e0b';
  if (model.includes('sonnet')) return '#fbbf24';
  if (model.includes('haiku')) return '#fcd34d';
  return '#f59e0b';
}

function formatModelName(model: string): string {
  // Shorten model names for display
  return model
    .replace('claude-', '')
    .replace('-20251001', '')
    .replace('-20250929', '')
    .replace('-20250514', '')
    .replace('-20250805', '')
    .replace('-20251101', '')
    .replace('-20241022', '')
    .replace('-high-thinking', ' (HT)')
    .replace('-thinking', ' (T)');
}

export function ModelBreakdown({ data, days }: ModelBreakdownProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 }}
      className="rounded-lg border border-white/5 bg-white/[0.02] p-6 h-full"
    >
      <h3 className="mb-4 font-mono text-xs uppercase tracking-wider text-white/60">
        Model Distribution {days && <span className="text-white/30">({days}d)</span>}
      </h3>
      <div className="space-y-3">
        {data.slice(0, 6).map((m, i) => (
          <motion.div
            key={`${m.model}-${m.tool}`}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.6 + i * 0.05 }}
            className="group"
          >
            <div className="mb-1 flex items-center justify-between">
              <span className="font-mono text-xs text-white/70 group-hover:text-white transition-colors truncate max-w-[140px]">
                {formatModelName(m.model)}
              </span>
              <span className="font-mono text-[10px] text-white/40">
                {formatTokens(m.tokens)}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/5">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${m.percentage}%` }}
                transition={{ duration: 0.8, delay: 0.7 + i * 0.05 }}
                className="h-full rounded-full"
                style={{ backgroundColor: getModelColor(m.model, m.tool) }}
              />
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
