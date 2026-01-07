'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';

interface NavItem {
  label: string;
  href: string;
  matchPaths: string[];
  adminOnly?: boolean;
}

interface MainNavProps {
  days: number;
  isAdmin?: boolean;
}

const navItems: NavItem[] = [
  { label: 'Overview', href: '/', matchPaths: ['/'] },
  { label: 'Users', href: '/users', matchPaths: ['/users'] },
  { label: 'Status', href: '/status', matchPaths: ['/status'] },
  { label: 'Settings', href: '/settings', matchPaths: ['/settings'], adminOnly: true },
];

export function MainNav({ days, isAdmin = false }: MainNavProps) {
  const pathname = usePathname();

  const isActive = (item: NavItem) => {
    if (item.href === '/') {
      return pathname === '/';
    }
    return item.matchPaths.some(path => pathname.startsWith(path));
  };

  const getHref = (item: NavItem) => {
    // Preserve days param for routes that use it
    if (item.href === '/' || item.href === '/users') {
      return `${item.href}?days=${days}`;
    }
    return item.href;
  };

  const visibleItems = navItems.filter(item => !item.adminOnly || isAdmin);

  return (
    <nav className="flex items-center gap-8">
      {/* App Title */}
      <Link href={`/?days=${days}`} className="flex items-baseline gap-2 group">
        <span className="font-display text-lg font-light tracking-tight text-white group-hover:text-white/90 transition-colors">
          AI Usage
        </span>
        <span className="font-display text-lg font-light tracking-tight text-amber-500 group-hover:text-amber-400 transition-colors">
          Tracker
        </span>
      </Link>

      {/* Divider */}
      <div className="h-4 w-px bg-white/10" />

      {/* Nav Items */}
      <div className="flex items-center">
        {visibleItems.map((item) => {
          const active = isActive(item);
          return (
            <Link
              key={item.href}
              href={getHref(item)}
              className="relative px-4 py-2 group"
            >
              <span
                className={`font-mono text-[11px] uppercase tracking-[0.15em] transition-colors duration-200 ${
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
                  className="absolute bottom-0 left-4 right-4 h-px bg-amber-500"
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
