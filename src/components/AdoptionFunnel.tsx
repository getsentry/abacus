'use client';

import { useState, useMemo } from 'react';
import { Users } from 'lucide-react';
import { type AdoptionStage, STAGE_CONFIG, STAGE_ORDER, STAGE_ICONS } from '@/lib/adoption';
import { TooltipBox } from '@/components/Tooltip';

interface StageData {
  stage: AdoptionStage;
  count: number;
  percentage: number;
}

interface AdoptionFunnelProps {
  data: StageData[];
  onStageClick?: (stage: AdoptionStage | 'all') => void;
  selectedStage?: AdoptionStage | null;
}

const STAGE_COLORS = {
  exploring: {
    bar: 'bg-slate-500',
    barHover: 'bg-slate-400',
    pill: 'bg-slate-500/20 text-slate-300 hover:bg-slate-500/30',
    pillActive: 'bg-slate-500 text-white',
    text: 'text-slate-400',
  },
  building_momentum: {
    bar: 'bg-amber-500',
    barHover: 'bg-amber-400',
    pill: 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30',
    pillActive: 'bg-amber-500 text-white',
    text: 'text-amber-400',
  },
  in_flow: {
    bar: 'bg-cyan-500',
    barHover: 'bg-cyan-400',
    pill: 'bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30',
    pillActive: 'bg-cyan-500 text-white',
    text: 'text-cyan-400',
  },
  power_user: {
    bar: 'bg-emerald-500',
    barHover: 'bg-emerald-400',
    pill: 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30',
    pillActive: 'bg-emerald-500 text-white',
    text: 'text-emerald-400',
  },
} as const;

export function AdoptionFunnel({
  data,
  onStageClick,
  selectedStage,
}: AdoptionFunnelProps) {
  const [hoveredStage, setHoveredStage] = useState<AdoptionStage | null>(null);

  const sortedData = useMemo(() =>
    STAGE_ORDER.map(stage =>
      data.find(d => d.stage === stage) || { stage, count: 0, percentage: 0 }
    ),
    [data]
  );

  const totalUsers = useMemo(() => data.reduce((sum, d) => sum + d.count, 0), [data]);
  const isAllSelected = selectedStage === null;

  // Calculate segment positions for tooltip placement
  const segmentPositions = useMemo(() => {
    const positions: Record<AdoptionStage, { left: number; width: number }> = {} as any;
    let cumulative = 0;
    for (const item of sortedData) {
      if (item.percentage > 0) {
        positions[item.stage] = { left: cumulative, width: item.percentage };
        cumulative += item.percentage;
      }
    }
    return positions;
  }, [sortedData]);

  return (
    <div className="space-y-3">
      {/* Distribution Bar - Pure Visualization */}
      <div className="relative">
        {/* Tooltip layer - outside overflow-hidden */}
        {hoveredStage && segmentPositions[hoveredStage] && (
          <div
            className="absolute bottom-full mb-2 z-10 pointer-events-none"
            style={{
              left: `${segmentPositions[hoveredStage].left + segmentPositions[hoveredStage].width / 2}%`,
              transform: 'translateX(-50%)',
            }}
          >
            <TooltipBox>
              <div className="text-white/60 mb-1">{STAGE_CONFIG[hoveredStage].label}</div>
              <div className={STAGE_COLORS[hoveredStage].text}>
                {sortedData.find(d => d.stage === hoveredStage)?.count} users ({sortedData.find(d => d.stage === hoveredStage)?.percentage}%)
              </div>
            </TooltipBox>
          </div>
        )}

        {/* Bar segments */}
        <div className="relative h-10 flex rounded-md overflow-hidden bg-white/[0.02] border border-white/5">
          {sortedData.map((item) => {
            if (item.percentage === 0) return null;

            const isHovered = hoveredStage === item.stage;
            const isSelected = selectedStage === item.stage;
            const isDimmed = selectedStage !== null && selectedStage !== item.stage;
            const colors = STAGE_COLORS[item.stage];

            return (
              <div
                key={item.stage}
                onMouseEnter={() => setHoveredStage(item.stage)}
                onMouseLeave={() => setHoveredStage(null)}
                className={`
                  relative h-full transition-all duration-150
                  ${isHovered ? colors.barHover : colors.bar}
                  ${isDimmed ? 'opacity-30' : 'opacity-100'}
                  ${isSelected ? 'ring-1 ring-inset ring-white/50' : ''}
                `}
                style={{
                  width: `${item.percentage}%`,
                  minWidth: item.percentage > 0 ? '4px' : '0',
                }}
              />
            );
          })}

          {/* Empty state */}
          {totalUsers === 0 && (
            <div className="flex-1 flex items-center justify-center">
              <span className="font-mono text-sm text-white/30">No data</span>
            </div>
          )}
        </div>
      </div>

      {/* Filter Pills - Interactive Controls */}
      <div className="flex items-center gap-2">
        {/* All pill */}
        <button
          onClick={() => onStageClick?.('all')}
          className={`
            flex items-center gap-1.5 px-2.5 py-1 rounded-md text-sm font-mono
            transition-colors duration-150 cursor-pointer
            ${isAllSelected
              ? 'bg-white/15 text-white'
              : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/60'
            }
          `}
        >
          <Users className="w-3.5 h-3.5" strokeWidth={2} />
          <span>All</span>
          <span className="text-white/40">{totalUsers}</span>
        </button>

        <div className="w-px h-4 bg-white/10" />

        {/* Stage pills */}
        {sortedData.map((item) => {
          const Icon = STAGE_ICONS[item.stage];
          const colors = STAGE_COLORS[item.stage];
          const isSelected = selectedStage === item.stage;

          return (
            <button
              key={item.stage}
              onClick={() => onStageClick?.(item.stage)}
              className={`
                flex items-center gap-1.5 px-2.5 py-1 rounded-md text-sm font-mono
                transition-colors duration-150 cursor-pointer
                ${isSelected ? colors.pillActive : colors.pill}
              `}
            >
              <Icon className="w-3.5 h-3.5" strokeWidth={2} />
              <span className="hidden sm:inline">{STAGE_CONFIG[item.stage].label}</span>
              <span className={isSelected ? 'text-white/70' : 'opacity-60'}>{item.count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
