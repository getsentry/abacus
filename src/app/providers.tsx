'use client';

import { Suspense, ReactNode } from 'react';
import { TimeRangeProvider } from '@/contexts/TimeRangeContext';
import { UserPanelProvider } from '@/contexts/UserPanelContext';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <TimeRangeProvider>
        <UserPanelProvider>
          {children}
        </UserPanelProvider>
      </TimeRangeProvider>
    </Suspense>
  );
}
