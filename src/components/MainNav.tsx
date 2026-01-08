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
  { label: 'Users', href: '/users', matchPaths: ['/users'] },
  { label: 'Commits', href: '/commits', matchPaths: ['/commits'] },
  { label: 'Adoption', href: '/adoption', matchPaths: ['/adoption'] },
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
    if (item.href === '/' || item.href === '/users' || item.href === '/commits' || item.href === '/adoption') {
      return `${item.href}?days=${days}`;
    }
    return item.href;
  };

  return (
    <nav className="flex items-center gap-8">
      {/* App Title */}
      <Link href={`/?days=${days}`} className="flex items-center gap-2.5 group">
        <AbacusLogo className="w-6 h-6 text-white/80 transition-all duration-200 group-hover:text-white group-hover:scale-105" />
        <span className="font-display text-lg font-medium tracking-tight text-white group-hover:text-white/90 transition-colors">
          Abacus
        </span>
      </Link>

      {/* Divider */}
      <div className="h-4 w-px bg-white/10" />

      {/* Nav Items */}
      <div className="flex items-center">
        {navItems.map((item) => {
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
