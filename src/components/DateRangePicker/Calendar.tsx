'use client';

import { useMemo } from 'react';
import {
  formatDate,
  getDaysInMonth,
  isSameDay,
  isDateInRange,
  isBefore,
  isAfter,
} from '@/lib/dateUtils';

interface CalendarProps {
  year: number;
  month: number;
  selectedStart: Date | null;
  selectedEnd: Date | null;
  hoverDate: Date | null;
  onDateClick: (date: Date) => void;
  onDateHover: (date: Date | null) => void;
  minDate?: Date;
  maxDate?: Date;
}

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function Calendar({
  year,
  month,
  selectedStart,
  selectedEnd,
  hoverDate,
  onDateClick,
  onDateHover,
  maxDate,
}: CalendarProps) {
  const daysInMonth = getDaysInMonth(year, month);
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  // Convert Sunday = 0 to Monday-based (Monday = 0)
  const startOffset = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;

  const today = new Date();
  const todayStr = formatDate(today);

  const days = useMemo(() => {
    const result: (Date | null)[] = [];

    // Add empty cells for days before the first of the month
    for (let i = 0; i < startOffset; i++) {
      result.push(null);
    }

    // Add the days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      result.push(new Date(year, month, day));
    }

    return result;
  }, [year, month, daysInMonth, startOffset]);

  const getDateClasses = (date: Date): string => {
    const dateStr = formatDate(date);
    const isToday = dateStr === todayStr;
    const isDisabled = maxDate && isAfter(date, maxDate);
    const isStart = selectedStart && isSameDay(date, selectedStart);
    const isEnd = selectedEnd && isSameDay(date, selectedEnd);

    // Determine if in range
    let inRange = false;
    if (selectedStart && selectedEnd) {
      inRange = isDateInRange(date, selectedStart, selectedEnd);
    } else if (selectedStart && hoverDate && !selectedEnd) {
      // Preview range while selecting
      const rangeStart = isBefore(hoverDate, selectedStart)
        ? hoverDate
        : selectedStart;
      const rangeEnd = isBefore(hoverDate, selectedStart)
        ? selectedStart
        : hoverDate;
      inRange = isDateInRange(date, rangeStart, rangeEnd);
    }

    const classes: string[] = [
      'w-8 h-8 text-xs font-mono rounded-md flex items-center justify-center transition-all duration-150',
    ];

    if (isDisabled) {
      classes.push('text-white/20 cursor-not-allowed');
    } else {
      classes.push('cursor-pointer');

      if (isStart || isEnd) {
        // Selected start/end dates - amber accent
        classes.push(
          'bg-amber-500/25 text-amber-400 ring-1 ring-amber-500/40'
        );
      } else if (inRange && !isStart && !isEnd) {
        // In-range dates - subtle amber tint
        classes.push('bg-amber-500/[0.08] text-amber-200/70');
      } else if (isToday) {
        // Today - subtle ring
        classes.push(
          'text-white/70 ring-1 ring-white/20 hover:bg-white/[0.08] hover:text-white/90'
        );
      } else {
        // Normal dates
        classes.push('text-white/50 hover:bg-white/[0.06] hover:text-white/80');
      }
    }

    return classes.join(' ');
  };

  return (
    <div className="select-none">
      {/* Month header */}
      <div className="text-center text-xs font-mono uppercase tracking-widest text-white/50 mb-4">
        {MONTH_NAMES[month]} {year}
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className="w-8 h-5 flex items-center justify-center text-[10px] font-mono text-faint uppercase tracking-wide"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-1">
        {days.map((date, index) => {
          if (!date) {
            return <div key={`empty-${index}`} className="w-8 h-8" />;
          }

          const isDisabled = maxDate && isAfter(date, maxDate);

          return (
            <button
              key={formatDate(date)}
              type="button"
              disabled={isDisabled}
              className={getDateClasses(date)}
              onClick={() => !isDisabled && onDateClick(date)}
              onMouseEnter={() => !isDisabled && onDateHover(date)}
              onMouseLeave={() => onDateHover(null)}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
