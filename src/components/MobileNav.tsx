'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';

interface NavItem {
  label: string;
  href: string;
  matchPaths: string[];
}

interface MobileNavProps {
  days: number;
}

const navItems: NavItem[] = [
  { label: 'Overview', href: '/', matchPaths: ['/'] },
  { label: 'Team', href: '/team', matchPaths: ['/team', '/users'] },
  { label: 'Usage', href: '/usage', matchPaths: ['/usage'] },
  { label: 'Commits', href: '/commits', matchPaths: ['/commits'] },
  { label: 'Tips', href: '/tips', matchPaths: ['/tips'] },
  { label: 'Status', href: '/status', matchPaths: ['/status'] },
];

export function MobileNav({ days }: MobileNavProps) {
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
    if (item.href === '/' || item.href === '/team' || item.href === '/usage' || item.href === '/commits') {
      return `${item.href}?days=${days}`;
    }
    return item.href;
  };

  return (
    <div className="sm:hidden relative" ref={menuRef}>
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
          className="absolute left-0 top-full mt-2 w-48 origin-top-left rounded-lg border border-white/10 bg-[#050507]/95 backdrop-blur-sm shadow-xl shadow-black/20 z-50"
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
                  <span className="text-xs font-medium uppercase tracking-wider">
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
  );
}
