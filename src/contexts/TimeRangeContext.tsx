'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';

interface TimeRangeContextValue {
  days: number;
  setDays: (days: number) => void;
}

const TimeRangeContext = createContext<TimeRangeContextValue | null>(null);

export function TimeRangeProvider({ children }: { children: ReactNode }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const initialDays = parseInt(searchParams.get('days') || '30', 10);
  const [days, setDaysState] = useState(initialDays);

  // Sync state from URL changes (e.g., back/forward navigation)
  useEffect(() => {
    const urlDays = searchParams.get('days');
    if (urlDays) {
      const parsed = parseInt(urlDays, 10);
      if (!isNaN(parsed) && parsed !== days) {
        setDaysState(parsed);
      }
    }
  }, [searchParams, days]);

  // Update both state and URL when days changes
  const setDays = useCallback((newDays: number) => {
    setDaysState(newDays);

    // Update URL with new days value
    const params = new URLSearchParams(searchParams.toString());
    params.set('days', newDays.toString());
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [searchParams, router, pathname]);

  return (
    <TimeRangeContext.Provider value={{ days, setDays }}>
      {children}
    </TimeRangeContext.Provider>
  );
}

export function useTimeRange() {
  const context = useContext(TimeRangeContext);
  if (!context) {
    throw new Error('useTimeRange must be used within a TimeRangeProvider');
  }
  return context;
}
