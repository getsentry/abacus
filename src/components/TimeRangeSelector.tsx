'use client';

import { useRef, useState } from 'react';
import { DateRangePicker } from './DateRangePicker';
import { TimeRange, formatDateRange } from '@/lib/dateUtils';

interface TimeRangeSelectorProps {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
  options?: number[];
  isPending?: boolean;
}

export function TimeRangeSelector({
  value,
  onChange,
  options = [7, 30, 90, 365],
  isPending = false,
}: TimeRangeSelectorProps) {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const customButtonRef = useRef<HTMLButtonElement>(null);

  const isCustomRange = value.type === 'absolute';
  const isRelative = (days: number) =>
    value.type === 'relative' && value.days === days;

  const handlePresetClick = (days: number) => {
    onChange({ type: 'relative', days });
  };

  const buttonBase =
    'px-3 py-1.5 rounded font-mono text-xs transition-all duration-200';
  const buttonActive =
    'bg-amber-500/20 text-amber-400 border border-amber-500/30';
  const buttonInactive =
    'bg-white/5 text-white/40 border border-white/10 hover:bg-white/10 hover:text-white/60';
  const buttonPending = isPending ? 'cursor-wait opacity-70' : 'cursor-pointer';

  return (
    <div className="flex items-center gap-1">
      {/* Preset day buttons */}
      {options.map((days) => (
        <button
          key={days}
          onClick={() => handlePresetClick(days)}
          disabled={isPending}
          className={`${buttonBase} ${isRelative(days) ? buttonActive : buttonInactive} ${buttonPending}`}
        >
          {days === 365 ? '1y' : `${days}d`}
        </button>
      ))}

      {/* Custom range button */}
      <button
        ref={customButtonRef}
        onClick={() => setIsPickerOpen(!isPickerOpen)}
        disabled={isPending}
        className={`${buttonBase} ${isCustomRange ? buttonActive : buttonInactive} ${buttonPending} flex items-center gap-1.5`}
      >
        {isCustomRange ? (
          <>
            <span>
              {formatDateRange(value.startDate, value.endDate)}
            </span>
            <svg
              className="w-3 h-3 opacity-60"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </>
        ) : (
          <>
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <span>Custom</span>
          </>
        )}
      </button>

      {/* Date range picker popover */}
      <DateRangePicker
        value={value}
        onChange={onChange}
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        anchorRef={customButtonRef}
      />
    </div>
  );
}
