'use client';

import { Suspense, ReactNode } from 'react';
import { TimeRangeProvider } from '@/contexts/TimeRangeContext';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <TimeRangeProvider>
        {children}
      </TimeRangeProvider>
    </Suspense>
  );
}
