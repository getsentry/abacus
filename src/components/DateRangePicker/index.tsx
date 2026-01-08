'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Calendar } from './Calendar';
import {
  TimeRange,
  QuickRangeKey,
  quickRanges,
  formatDate,
  parseDate,
  addMonths,
  subMonths,
  formatDateRange,
} from '@/lib/dateUtils';

interface DateRangePickerProps {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
  isOpen: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}

const QUICK_RANGE_OPTIONS: { key: QuickRangeKey; label: string }[] = [
  { key: 'thisWeek', label: 'This Week' },
  { key: 'thisMonth', label: 'This Month' },
  { key: 'lastMonth', label: 'Last Month' },
  { key: 'thisYear', label: 'This Year' },
  { key: 'allTime', label: 'All Time' },
];

export function DateRangePicker({
  value,
  onChange,
  isOpen,
  onClose,
  anchorRef,
}: DateRangePickerProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const today = new Date();

  // Calendar navigation state
  const [leftMonth, setLeftMonth] = useState(() => {
    if (value.type === 'absolute') {
      const start = parseDate(value.startDate);
      return { year: start.getFullYear(), month: start.getMonth() };
    }
    // Default: show current and previous month
    const prev = subMonths(today, 1);
    return { year: prev.getFullYear(), month: prev.getMonth() };
  });

  // Selection state (local until applied)
  const [selectedStart, setSelectedStart] = useState<Date | null>(() => {
    if (value.type === 'absolute') {
      return parseDate(value.startDate);
    }
    return null;
  });
  const [selectedEnd, setSelectedEnd] = useState<Date | null>(() => {
    if (value.type === 'absolute') {
      return parseDate(value.endDate);
    }
    return null;
  });
  const [hoverDate, setHoverDate] = useState<Date | null>(null);
  const [isSelectingEnd, setIsSelectingEnd] = useState(false);

  // Right month is always one month after left
  const rightMonth = {
    year: leftMonth.month === 11 ? leftMonth.year + 1 : leftMonth.year,
    month: (leftMonth.month + 1) % 12,
  };

  // Reset selection when opening
  useEffect(() => {
    if (isOpen) {
      if (value.type === 'absolute') {
        const start = parseDate(value.startDate);
        const end = parseDate(value.endDate);
        setSelectedStart(start);
        setSelectedEnd(end);
        setLeftMonth({ year: start.getFullYear(), month: start.getMonth() });
      } else {
        setSelectedStart(null);
        setSelectedEnd(null);
        const prev = subMonths(today, 1);
        setLeftMonth({ year: prev.getFullYear(), month: prev.getMonth() });
      }
      setIsSelectingEnd(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose, anchorRef]);

  const handleDateClick = useCallback(
    (date: Date) => {
      if (!isSelectingEnd || !selectedStart) {
        // First click: set start
        setSelectedStart(date);
        setSelectedEnd(null);
        setIsSelectingEnd(true);
      } else {
        // Second click: set end
        if (date < selectedStart) {
          // Clicked before start, swap
          setSelectedEnd(selectedStart);
          setSelectedStart(date);
        } else {
          setSelectedEnd(date);
        }
        setIsSelectingEnd(false);
      }
    },
    [isSelectingEnd, selectedStart]
  );

  const handleQuickRange = useCallback(
    (key: QuickRangeKey) => {
      const { startDate, endDate } = quickRanges[key]();
      onChange({ type: 'absolute', startDate, endDate });
      onClose();
    },
    [onChange, onClose]
  );

  const handleApply = useCallback(() => {
    if (selectedStart && selectedEnd) {
      onChange({
        type: 'absolute',
        startDate: formatDate(selectedStart),
        endDate: formatDate(selectedEnd),
      });
      onClose();
    }
  }, [selectedStart, selectedEnd, onChange, onClose]);

  const handleClear = useCallback(() => {
    setSelectedStart(null);
    setSelectedEnd(null);
    setIsSelectingEnd(false);
  }, []);

  const navigateMonth = useCallback((direction: 'prev' | 'next') => {
    setLeftMonth((current) => {
      const date = new Date(current.year, current.month, 1);
      const newDate =
        direction === 'prev' ? subMonths(date, 1) : addMonths(date, 1);
      return { year: newDate.getFullYear(), month: newDate.getMonth() };
    });
  }, []);

  // Calculate popover position
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (isOpen && anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      setPosition({
        top: rect.bottom + 8,
        left: Math.max(8, rect.right - 520), // Right-align, with padding
      });
    }
  }, [isOpen, anchorRef]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-40"
            onClick={onClose}
          />

          {/* Popover */}
          <motion.div
            ref={popoverRef}
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className="fixed z-50 bg-[#050507] border border-white/10 rounded-lg shadow-2xl shadow-black/80"
            style={{ top: position.top, left: position.left }}
          >
            <div className="p-5">
              {/* Quick ranges */}
              <div className="flex flex-wrap gap-2 mb-5 pb-5 border-b border-white/5">
                {QUICK_RANGE_OPTIONS.map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleQuickRange(key)}
                    className="px-3 py-1.5 text-xs font-mono rounded bg-white/[0.03] text-white/50 border border-white/5 hover:bg-white/[0.08] hover:text-white/70 hover:border-white/10 cursor-pointer transition-all duration-150"
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Calendar header with navigation */}
              <div className="flex items-center justify-between mb-4">
                <button
                  type="button"
                  onClick={() => navigateMonth('prev')}
                  className="p-2 rounded hover:bg-white/[0.06] text-white/40 hover:text-white/70 cursor-pointer transition-all duration-150"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M15 19l-7-7 7-7"
                    />
                  </svg>
                </button>
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={() => navigateMonth('next')}
                  className="p-2 rounded hover:bg-white/[0.06] text-white/40 hover:text-white/70 cursor-pointer transition-all duration-150"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </button>
              </div>

              {/* Two-month calendar */}
              <div className="flex gap-8">
                <Calendar
                  year={leftMonth.year}
                  month={leftMonth.month}
                  selectedStart={selectedStart}
                  selectedEnd={selectedEnd}
                  hoverDate={hoverDate}
                  onDateClick={handleDateClick}
                  onDateHover={setHoverDate}
                  maxDate={today}
                />
                <Calendar
                  year={rightMonth.year}
                  month={rightMonth.month}
                  selectedStart={selectedStart}
                  selectedEnd={selectedEnd}
                  hoverDate={hoverDate}
                  onDateClick={handleDateClick}
                  onDateHover={setHoverDate}
                  maxDate={today}
                />
              </div>

              {/* Selection summary & actions */}
              <div className="flex items-center justify-between mt-5 pt-5 border-t border-white/5">
                <div className="text-xs font-mono text-white/40">
                  {selectedStart && selectedEnd ? (
                    <span className="text-amber-400/90">
                      {formatDateRange(
                        formatDate(selectedStart),
                        formatDate(selectedEnd)
                      )}
                    </span>
                  ) : selectedStart ? (
                    <span className="text-white/50">Select end date...</span>
                  ) : (
                    <span>Select start date</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleClear}
                    className="px-3 py-1.5 text-xs font-mono rounded text-white/40 hover:text-white/60 hover:bg-white/[0.04] cursor-pointer transition-all duration-150"
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    onClick={handleApply}
                    disabled={!selectedStart || !selectedEnd}
                    className="px-4 py-1.5 text-xs font-mono rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30 hover:border-amber-500/40 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-all duration-150"
                  >
                    Apply
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
