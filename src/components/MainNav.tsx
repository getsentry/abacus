'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { Menu, X } from 'lucide-react';
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
  { label: 'Adoption', href: '/adoption', matchPaths: ['/adoption'] },
  { label: 'Tips', href: '/tips', matchPaths: ['/tips'] },
  { label: 'Status', href: '/status', matchPaths: ['/status'] },
];

export function MainNav({ days }: MainNavProps) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMobileMenuOpen(false);
      }
    }

    if (mobileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [mobileMenuOpen]);

  // Close menu on escape
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMobileMenuOpen(false);
      }
    }

    if (mobileMenuOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [mobileMenuOpen]);

  // Close menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  const isActive = (item: NavItem) => {
    if (item.href === '/') {
      return pathname === '/';
    }
    return item.matchPaths.some(path => pathname.startsWith(path));
  };

  const getHref = (item: NavItem) => {
    // Preserve days param for routes that use it (not tips or status)
    if (item.href === '/' || item.href === '/users' || item.href === '/adoption') {
      return `${item.href}?days=${days}`;
    }
    return item.href;
  };

  return (
    <nav className="flex items-center gap-4 sm:gap-8" ref={menuRef}>
      {/* App Title */}
      <Link href={`/?days=${days}`} className="flex items-center gap-2.5 group">
        <AbacusLogo className="w-6 h-6 text-white/80 transition-all duration-200 group-hover:text-white group-hover:scale-105" />
        <span className="font-display text-lg font-medium tracking-tight text-white group-hover:text-white/90 transition-colors">
          Abacus
        </span>
      </Link>

      {/* Mobile Menu Button */}
      <div className="sm:hidden relative">
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="flex items-center justify-center w-8 h-8 rounded-md text-white/60 hover:text-white hover:bg-white/10 transition-colors"
          aria-expanded={mobileMenuOpen}
          aria-label="Toggle navigation menu"
        >
          {mobileMenuOpen ? (
            <X className="w-5 h-5" />
          ) : (
            <Menu className="w-5 h-5" />
          )}
        </button>

        {/* Mobile Dropdown Menu */}
        {mobileMenuOpen && (
          <div
            className="absolute left-0 top-full mt-2 w-48 origin-top-left rounded-lg border border-white/10 bg-[#0a0a0f]/95 backdrop-blur-sm shadow-xl shadow-black/20 z-50"
            style={{
              animation: 'slideUp 0.15s ease-out',
            }}
          >
            <div className="py-1">
              {navItems.map((item) => {
                const active = isActive(item);
                return (
                  <Link
                    key={item.href}
                    href={getHref(item)}
                    className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${
                      active
                        ? 'text-white bg-white/5'
                        : 'text-white/60 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <span className="font-mono text-xs uppercase tracking-wider">
                      {item.label}
                    </span>
                    {active && (
                      <div className="ml-auto w-1.5 h-1.5 rounded-full bg-cyan-500" />
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>

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
