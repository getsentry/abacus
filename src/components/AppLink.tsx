'use client';

import Link, { LinkProps } from 'next/link';
import { useTimeRange } from '@/contexts/TimeRangeContext';
import { ReactNode } from 'react';

interface AppLinkProps extends Omit<LinkProps, 'href'> {
  href: string;
  children: ReactNode;
  className?: string;
  /** Set to true to skip adding the days parameter */
  skipDays?: boolean;
}

/**
 * AppLink - A wrapper around Next.js Link that automatically injects the current
 * time range (days) parameter into internal links.
 *
 * Use this component for all internal navigation to ensure time range state
 * is preserved across page transitions.
 *
 * @example
 * <AppLink href="/users">All Users</AppLink>
 * // If days=7, renders as: <Link href="/users?days=7">All Users</Link>
 *
 * @example
 * <AppLink href="/status" skipDays>Status</AppLink>
 * // Renders as: <Link href="/status">Status</Link>
 */
export function AppLink({ href, children, className, skipDays, ...props }: AppLinkProps) {
  const { days } = useTimeRange();

  // Only modify internal links that don't already have days param
  let finalHref = href;
  if (!skipDays && !href.startsWith('http') && !href.includes('days=')) {
    const separator = href.includes('?') ? '&' : '?';
    finalHref = `${href}${separator}days=${days}`;
  }

  return (
    <Link href={finalHref} className={className} {...props}>
      {children}
    </Link>
  );
}
