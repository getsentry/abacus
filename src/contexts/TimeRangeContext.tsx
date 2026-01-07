'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useTransition,
  ReactNode,
} from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { DEFAULT_DAYS } from '@/lib/constants';
import {
  TimeRange,
  parseTimeRangeFromParams,
  getDateRange,
  getTimeRangeLabel,
} from '@/lib/dateUtils';

interface TimeRangeContextValue {
  /** The current time range (relative or absolute) */
  range: TimeRange;
  /** Set the time range */
  setRange: (range: TimeRange) => void;
  /** Convenience: set relative days (backwards compat) */
  setDays: (days: number) => void;
  /** Convenience: get days value (for relative ranges) */
  days: number;
  /** Get date params for API calls */
  getDateParams: () => { startDate: string; endDate: string };
  /** Get display label */
  getDisplayLabel: () => string;
  /** Is a transition pending */
  isPending: boolean;
}

const TimeRangeContext = createContext<TimeRangeContextValue | null>(null);

export function TimeRangeProvider({ children }: { children: ReactNode }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  // Parse initial range from URL
  const initialRange = parseTimeRangeFromParams(searchParams, DEFAULT_DAYS);
  const [range, setRangeState] = useState<TimeRange>(initialRange);

  // Sync state from URL changes (e.g., back/forward navigation)
  useEffect(() => {
    const urlRange = parseTimeRangeFromParams(searchParams, DEFAULT_DAYS);

    // Compare ranges to avoid unnecessary updates
    if (urlRange.type === 'relative' && range.type === 'relative') {
      if (urlRange.days !== range.days) {
        setRangeState(urlRange);
      }
    } else if (urlRange.type === 'absolute' && range.type === 'absolute') {
      if (
        urlRange.startDate !== range.startDate ||
        urlRange.endDate !== range.endDate
      ) {
        setRangeState(urlRange);
      }
    } else if (urlRange.type !== range.type) {
      setRangeState(urlRange);
    }
  }, [searchParams, range]);

  // Update both state and URL when range changes
  const setRange = useCallback(
    (newRange: TimeRange) => {
      startTransition(() => {
        setRangeState(newRange);

        // Build new URL params
        const params = new URLSearchParams();

        // Preserve other params
        searchParams.forEach((value, key) => {
          if (key !== 'days' && key !== 'start' && key !== 'end') {
            params.set(key, value);
          }
        });

        // Add range params
        if (newRange.type === 'relative') {
          params.set('days', newRange.days.toString());
        } else {
          params.set('start', newRange.startDate);
          params.set('end', newRange.endDate);
        }

        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      });
    },
    [searchParams, router, pathname]
  );

  // Convenience method for setting relative days (backwards compatibility)
  const setDays = useCallback(
    (days: number) => {
      setRange({ type: 'relative', days });
    },
    [setRange]
  );

  // Convenience getter for days (returns days for relative, or computed days for absolute)
  const days =
    range.type === 'relative'
      ? range.days
      : Math.ceil(
          (new Date(range.endDate).getTime() -
            new Date(range.startDate).getTime()) /
            (1000 * 60 * 60 * 24)
        ) + 1;

  // Get date params for API calls
  const getDateParams = useCallback(() => getDateRange(range), [range]);

  // Get display label
  const getDisplayLabel = useCallback(() => getTimeRangeLabel(range), [range]);

  return (
    <TimeRangeContext.Provider
      value={{
        range,
        setRange,
        setDays,
        days,
        getDateParams,
        getDisplayLabel,
        isPending,
      }}
    >
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
