'use client';

import { motion } from 'framer-motion';
import { Compass, Flame, Zap, Star, Pause } from 'lucide-react';
import { type AdoptionStage, STAGE_CONFIG, INACTIVE_CONFIG } from '@/lib/adoption';

interface AdoptionBadgeProps {
  stage: AdoptionStage;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  isInactive?: boolean;
}

const ICONS = {
  compass: Compass,
  flame: Flame,
  zap: Zap,
  star: Star,
  pause: Pause,
} as const;

const SIZE_CONFIG = {
  sm: {
    badge: 'h-5 px-1.5 gap-1',
    icon: 'w-3 h-3',
    text: 'text-[9px]',
  },
  md: {
    badge: 'h-6 px-2 gap-1.5',
    icon: 'w-3.5 h-3.5',
    text: 'text-[10px]',
  },
  lg: {
    badge: 'h-8 px-3 gap-2',
    icon: 'w-4 h-4',
    text: 'text-xs',
  },
} as const;

export function AdoptionBadge({
  stage,
  showLabel = true,
  size = 'md',
  isInactive = false,
}: AdoptionBadgeProps) {
  const config = isInactive ? INACTIVE_CONFIG : STAGE_CONFIG[stage];
  const iconName = isInactive ? 'pause' : STAGE_CONFIG[stage].icon;
  const Icon = ICONS[iconName];
  const sizeConfig = SIZE_CONFIG[size];

  // Color classes based on stage
  const colorClasses = isInactive
    ? 'bg-zinc-500/10 border-zinc-500/20 text-zinc-400'
    : {
        exploring: 'bg-slate-500/10 border-slate-500/20 text-slate-400',
        building_momentum: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
        in_flow: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400',
        power_user: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
      }[stage];

  // Glow effect for power_user stage
  const glowClass = !isInactive && stage === 'power_user'
    ? 'shadow-[0_0_12px_rgba(52,211,153,0.15)]'
    : '';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: 1.02 }}
      className={`
        inline-flex items-center rounded-full border
        ${sizeConfig.badge}
        ${colorClasses}
        ${glowClass}
        transition-all duration-200
      `}
    >
      <motion.div
        animate={!isInactive && stage === 'power_user' ? {
          rotate: [0, -10, 10, -5, 5, 0],
        } : {}}
        transition={{
          duration: 0.5,
          repeat: Infinity,
          repeatDelay: 3,
        }}
      >
        <Icon className={sizeConfig.icon} strokeWidth={2} />
      </motion.div>
      {showLabel && (
        <span className={`font-mono uppercase tracking-wider ${sizeConfig.text}`}>
          {config.label}
        </span>
      )}
    </motion.div>
  );
}
