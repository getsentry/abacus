'use client';

interface TimeRangeSelectorProps {
  value: number;
  onChange: (days: number) => void;
  options?: number[];
  isPending?: boolean;
}

export function TimeRangeSelector({
  value,
  onChange,
  options = [7, 30, 90],
  isPending = false,
}: TimeRangeSelectorProps) {
  return (
    <div className="flex items-center gap-1">
      {options.map((days) => (
        <button
          key={days}
          onClick={() => onChange(days)}
          disabled={isPending}
          className={`px-3 py-1.5 rounded font-mono text-xs transition-all duration-200 ${
            value === days
              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
              : 'bg-white/5 text-white/40 border border-white/10 hover:bg-white/10 hover:text-white/60'
          } ${isPending ? 'cursor-wait opacity-70' : 'cursor-pointer'}`}
        >
          {days}d
        </button>
      ))}
    </div>
  );
}
