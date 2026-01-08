'use client';

import { type ReactNode } from 'react';

type TooltipPosition = 'top' | 'bottom';

interface TooltipProps {
  /** Tooltip content */
  content: ReactNode;
  /** Position relative to trigger. Default: top */
  position?: TooltipPosition;
  /** Additional CSS classes for the tooltip container */
  className?: string;
}

interface TooltipTriggerProps {
  /** The element that triggers the tooltip on hover */
  children: ReactNode;
  /** Additional CSS classes for the trigger wrapper */
  className?: string;
}

interface TooltipContentProps {
  /** Tooltip content */
  children: ReactNode;
  /** Position relative to trigger. Default: top */
  position?: TooltipPosition;
  /** Additional CSS classes */
  className?: string;
  /** z-index level. Default: 20 */
  zIndex?: 10 | 20 | 30 | 40 | 50;
  /** Named group for hover trigger (e.g., 'dist' for group/dist). Default: unnamed group */
  groupName?: string;
}

const positionClasses: Record<TooltipPosition, string> = {
  top: 'bottom-full mb-2',
  bottom: 'top-full mt-2',
};

/**
 * TooltipBox - Just the styled tooltip container
 * Use this when you need custom positioning/trigger logic
 *
 * @example
 * <div className="absolute bottom-full ...">
 *   <TooltipBox>Content here</TooltipBox>
 * </div>
 */
export function TooltipBox({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded bg-[#0a0a0c] px-2.5 py-2 text-sm whitespace-nowrap border border-white/20 ${className}`}>
      {children}
    </div>
  );
}

/**
 * TooltipContent - The styled tooltip box
 * Use inside a group hover context
 *
 * @example
 * <div className="group relative">
 *   <button>Hover me</button>
 *   <TooltipContent>Tooltip text</TooltipContent>
 * </div>
 */
export function TooltipContent({
  children,
  position = 'top',
  className = '',
  zIndex = 20,
  groupName,
}: TooltipContentProps) {
  const hoverClass = groupName ? `group-hover/${groupName}:block` : 'group-hover:block';
  const zClass = `z-${zIndex}`;

  return (
    <div
      className={`absolute left-1/2 -translate-x-1/2 ${positionClasses[position]} hidden ${hoverClass} ${zClass} pointer-events-none ${className}`}
    >
      <TooltipBox>{children}</TooltipBox>
    </div>
  );
}

/**
 * Tooltip - Complete tooltip with trigger and content
 * Wraps children in a group for hover state
 *
 * @example
 * <Tooltip content={<div>Detailed info here</div>}>
 *   <button>Hover me</button>
 * </Tooltip>
 */
export function Tooltip({
  content,
  position = 'top',
  className = '',
  children,
}: TooltipProps & { children: ReactNode }) {
  return (
    <div className={`group relative ${className}`}>
      {children}
      <TooltipContent position={position}>{content}</TooltipContent>
    </div>
  );
}

/**
 * Helper component for tooltip text rows with consistent styling
 *
 * @example
 * <TooltipContent>
 *   <TooltipRow label="Date" className="text-white/60">Jan 5</TooltipRow>
 *   <TooltipRow label="Tokens" className="text-amber-400">1.2M</TooltipRow>
 * </TooltipContent>
 */
export function TooltipRow({
  label,
  children,
  className = 'text-white',
}: {
  label?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      {label && <span>{label}: </span>}
      {children}
    </div>
  );
}
