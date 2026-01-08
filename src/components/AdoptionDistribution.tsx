'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { AppLink } from './AppLink';
import { type AdoptionStage, STAGE_CONFIG, STAGE_ORDER, STAGE_ICONS } from '@/lib/adoption';

interface StageData {
  count: number;
  percentage: number;
}

interface AdoptionDistributionProps {
  stages: Record<AdoptionStage, StageData>;
  totalUsers: number;
  className?: string;
  days?: number;
}

const STAGE_COLORS = {
  exploring: { bar: 'bg-slate-500', barHover: 'bg-slate-400', text: 'text-slate-400' },
  building_momentum: { bar: 'bg-amber-500', barHover: 'bg-amber-400', text: 'text-amber-400' },
  in_flow: { bar: 'bg-cyan-500', barHover: 'bg-cyan-400', text: 'text-cyan-400' },
  power_user: { bar: 'bg-emerald-500', barHover: 'bg-emerald-400', text: 'text-emerald-400' },
} as const;

export function AdoptionDistribution({
  stages,
  totalUsers,
  className = '',
  days,
}: AdoptionDistributionProps) {
  const [hoveredStage, setHoveredStage] = useState<AdoptionStage | null>(null);

  // Calculate segment positions for tooltip placement
  const segmentPositions = useMemo(() => {
    const positions: Record<AdoptionStage, { left: number; width: number }> = {} as any;
    let cumulative = 0;
    for (const stage of STAGE_ORDER) {
      const data = stages[stage];
      if (data && data.percentage > 0) {
        positions[stage] = { left: cumulative, width: data.percentage };
        cumulative += data.percentage;
      }
    }
    return positions;
  }, [stages]);

  if (totalUsers === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className={`rounded-lg border border-white/5 bg-white/[0.02] p-4 ${className}`}
    >
      <div className="flex items-center justify-between mb-3">
        <p className="font-mono text-[10px] uppercase tracking-wider text-white/40">
          Adoption Distribution {days && <span className="text-white/20">({days}d)</span>}
        </p>
        <AppLink
          href="/adoption"
          className="font-mono text-[10px] text-amber-500/70 hover:text-amber-400 transition-colors cursor-pointer"
        >
          View details
        </AppLink>
      </div>

      {/* Stacked bar with tooltips */}
      <div className="relative mb-3">
        {/* Tooltip */}
        {hoveredStage && segmentPositions[hoveredStage] && (
          <div
            className="absolute bottom-full mb-2 z-10 pointer-events-none"
            style={{
              left: `${segmentPositions[hoveredStage].left + segmentPositions[hoveredStage].width / 2}%`,
              transform: 'translateX(-50%)',
            }}
          >
            <div className="rounded bg-black/90 px-2 py-1.5 text-[10px] whitespace-nowrap border border-white/10">
              <div className="text-white/60 mb-1">{STAGE_CONFIG[hoveredStage].label}</div>
              <div className={STAGE_COLORS[hoveredStage].text}>
                {stages[hoveredStage]?.count} users ({Math.round(stages[hoveredStage]?.percentage || 0)}%)
              </div>
            </div>
          </div>
        )}

        {/* Bar */}
        <div className="h-2 rounded-full bg-white/5 overflow-hidden flex">
          {STAGE_ORDER.map((stage, i) => {
            const data = stages[stage];
            if (!data || data.count === 0) return null;
            const colors = STAGE_COLORS[stage];
            const isHovered = hoveredStage === stage;

            return (
              <motion.div
                key={stage}
                initial={{ width: 0 }}
                animate={{ width: `${data.percentage}%` }}
                transition={{ duration: 0.6, delay: 0.4 + i * 0.1 }}
                onMouseEnter={() => setHoveredStage(stage)}
                onMouseLeave={() => setHoveredStage(null)}
                className={`h-full transition-colors ${isHovered ? colors.barHover : colors.bar} ${i === 0 ? 'rounded-l-full' : ''}`}
                style={{ minWidth: data.percentage > 0 ? '4px' : 0 }}
              />
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {STAGE_ORDER.map(stage => {
          const data = stages[stage];
          const config = STAGE_CONFIG[stage];
          const Icon = STAGE_ICONS[stage];
          const count = data?.count || 0;
          const pct = data?.percentage || 0;

          return (
            <div key={stage} className="flex items-center gap-1.5">
              <Icon className={`w-3 h-3 ${config.textColor}`} />
              <span className="font-mono text-[10px] text-white/50">
                {count}
              </span>
              <span className="font-mono text-[10px] text-white/30">
                ({Math.round(pct)}%)
              </span>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
