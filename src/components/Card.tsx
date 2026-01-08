'use client';

import { motion, type HTMLMotionProps } from 'framer-motion';
import { forwardRef, type ReactNode } from 'react';

type PaddingSize = 'none' | 'sm' | 'md' | 'lg';

interface CardProps {
  children: ReactNode;
  /** Padding size: none (0), sm (p-4), md (p-5), lg (p-6). Default: sm */
  padding?: PaddingSize;
  /** Responsive padding that increases on larger screens */
  responsivePadding?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Enable animation on mount */
  animate?: boolean;
  /** Animation delay in seconds (only used if animate=true) */
  delay?: number;
}

const paddingClasses: Record<PaddingSize, string> = {
  none: '',
  sm: 'p-4',
  md: 'p-5',
  lg: 'p-6',
};

const responsivePaddingClasses: Record<PaddingSize, string> = {
  none: '',
  sm: 'p-4 sm:p-6',
  md: 'p-4 sm:p-5',
  lg: 'p-4 sm:p-6',
};

/**
 * Card component for consistent container styling across the app.
 *
 * @example
 * // Basic card
 * <Card>Content</Card>
 *
 * // Large padding with animation
 * <Card padding="lg" animate delay={0.1}>Content</Card>
 *
 * // No padding (for tables with overflow-hidden)
 * <Card padding="none" className="overflow-hidden">
 *   <table>...</table>
 * </Card>
 */
export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  {
    children,
    padding = 'sm',
    responsivePadding = false,
    className = '',
    animate = false,
    delay = 0,
  },
  ref
) {
  const paddingClass = responsivePadding
    ? responsivePaddingClasses[padding]
    : paddingClasses[padding];

  const baseClasses = `rounded-lg border border-white/5 bg-white/[0.02] ${paddingClass} ${className}`.trim();

  if (animate) {
    return (
      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay }}
        className={baseClasses}
      >
        {children}
      </motion.div>
    );
  }

  return (
    <div ref={ref} className={baseClasses}>
      {children}
    </div>
  );
});

/**
 * AnimatedCard - Card with animation enabled by default
 * Convenience wrapper for <Card animate>
 */
export function AnimatedCard({
  delay = 0,
  ...props
}: Omit<CardProps, 'animate'>) {
  return <Card {...props} animate delay={delay} />;
}
