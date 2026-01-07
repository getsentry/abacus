'use client';

import Link, { LinkProps } from 'next/link';
import { useTimeRange } from '@/contexts/TimeRangeContext';
import { ReactNode } from 'react';

interface AppLinkProps extends Omit<LinkProps, 'href'> {
  href: string;
  children: ReactNode;
  className?: string;
  /** Set to true to skip adding the time range parameters */
  skipDays?: boolean;
}

/**
 * AppLink - A wrapper around Next.js Link that automatically injects the current
 * time range parameters into internal links.
 *
 * Supports both relative (days) and absolute (start/end) time ranges.
 *
 * @example
 * <AppLink href="/users">All Users</AppLink>
 * // If days=7, renders as: <Link href="/users?days=7">All Users</Link>
 * // If custom range, renders as: <Link href="/users?start=2024-01-01&end=2024-01-31">All Users</Link>
 *
 * @example
 * <AppLink href="/status" skipDays>Status</AppLink>
 * // Renders as: <Link href="/status">Status</Link>
 */
export function AppLink({
  href,
  children,
  className,
  skipDays,
  ...props
}: AppLinkProps) {
  const { range } = useTimeRange();

  // Only modify internal links that don't already have time params
  let finalHref = href;
  if (
    !skipDays &&
    !href.startsWith('http') &&
    !href.includes('days=') &&
    !href.includes('start=')
  ) {
    const separator = href.includes('?') ? '&' : '?';

    if (range.type === 'relative') {
      finalHref = `${href}${separator}days=${range.days}`;
    } else {
      finalHref = `${href}${separator}start=${range.startDate}&end=${range.endDate}`;
    }
  }

  return (
    <Link href={finalHref} className={className} {...props}>
      {children}
    </Link>
  );
}
