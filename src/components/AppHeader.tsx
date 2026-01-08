'use client';

import { ReactNode } from 'react';
import { MainNav } from '@/components/MainNav';
import { MobileNav } from '@/components/MobileNav';
import { UserMenu } from '@/components/UserMenu';
import { PageContainer } from '@/components/PageContainer';
import { useTimeRange } from '@/contexts/TimeRangeContext';

interface AppHeaderProps {
  /**
   * Optional search component to show in header.
   * Will be hidden on mobile (sm:hidden) automatically.
   */
  search?: ReactNode;
}

/**
 * Shared app header with navigation, mobile menu, optional search, and user menu.
 * Uses TimeRangeContext for the days parameter.
 */
export function AppHeader({ search }: AppHeaderProps) {
  const { days } = useTimeRange();

  return (
    <header className="relative z-20 border-b border-white/5">
      <PageContainer className="py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <MobileNav days={days} />
            <MainNav days={days} />
          </div>
          {search ? (
            <div className="flex items-center gap-3">
              <div className="hidden sm:block">
                {search}
              </div>
              <UserMenu />
            </div>
          ) : (
            <UserMenu />
          )}
        </div>
      </PageContainer>
    </header>
  );
}
