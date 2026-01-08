'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { AbacusLogo } from '@/components/AbacusLogo';

interface NavItem {
  label: string;
  href: string;
  matchPaths: string[];
}

interface MainNavProps {
  days: number;
}

const navItems: NavItem[] = [
  { label: 'Overview', href: '/', matchPaths: ['/'] },
  { label: 'Team', href: '/team', matchPaths: ['/team', '/users', '/adoption'] },
  { label: 'Usage', href: '/usage', matchPaths: ['/usage'] },
  { label: 'Commits', href: '/commits', matchPaths: ['/commits'] },
  { label: 'Tips', href: '/tips', matchPaths: ['/tips'] },
  { label: 'Status', href: '/status', matchPaths: ['/status'] },
];

export function MainNav({ days }: MainNavProps) {
  const pathname = usePathname();

  const isActive = (item: NavItem) => {
    if (item.href === '/') {
      return pathname === '/';
    }
    return item.matchPaths.some(path => pathname.startsWith(path));
  };

  const getHref = (item: NavItem) => {
    // Preserve days param for routes that use it (not tips or status)
    if (item.href === '/' || item.href === '/team' || item.href === '/usage' || item.href === '/commits') {
      return `${item.href}?days=${days}`;
    }
    return item.href;
  };

  return (
    <nav className="flex items-center gap-4 sm:gap-8">
      {/* App Title */}
      <Link href={`/?days=${days}`} className="flex items-center gap-2.5 group">
        <AbacusLogo className="w-6 h-6 text-white/70 transition-all duration-200 group-hover:text-white group-hover:scale-105" />
        <span className="font-display text-lg font-medium tracking-tight text-white group-hover:text-white/90 transition-colors">
          Abacus
        </span>
      </Link>

      {/* Desktop Divider */}
      <div className="hidden sm:block h-4 w-px bg-white/10" />

      {/* Desktop Nav Items */}
      <div className="hidden sm:flex items-center">
        {navItems.map((item) => {
          const active = isActive(item);
          return (
            <Link
              key={item.href}
              href={getHref(item)}
              className="relative px-4 py-2 group"
            >
              <span
                className={`text-xs font-medium uppercase tracking-wider transition-colors duration-200 ${
                  active
                    ? 'text-white'
                    : 'text-white/40 group-hover:text-white/70'
                }`}
              >
                {item.label}
              </span>

              {/* Active indicator */}
              {active && (
                <motion.div
                  layoutId="nav-indicator"
                  className="absolute bottom-0 left-4 right-4 h-px bg-cyan-500"
                  initial={false}
                  transition={{
                    type: 'spring',
                    stiffness: 500,
                    damping: 35,
                  }}
                />
              )}

              {/* Hover indicator (only when not active) */}
              {!active && (
                <div className="absolute bottom-0 left-4 right-4 h-px bg-white/0 group-hover:bg-white/10 transition-colors duration-200" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
