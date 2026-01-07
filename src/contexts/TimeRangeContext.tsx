'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';

interface TimeRangeContextValue {
  days: number;
  setDays: (days: number) => void;
}

const TimeRangeContext = createContext<TimeRangeContextValue | null>(null);

export function TimeRangeProvider({ children }: { children: ReactNode }) {
  const searchParams = useSearchParams();
  const initialDays = parseInt(searchParams.get('days') || '30', 10);
  const [days, setDays] = useState(initialDays);

  // Sync with URL changes
  useEffect(() => {
    const urlDays = searchParams.get('days');
    if (urlDays) {
      const parsed = parseInt(urlDays, 10);
      if (!isNaN(parsed) && parsed !== days) {
        setDays(parsed);
      }
    }
  }, [searchParams, days]);

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
