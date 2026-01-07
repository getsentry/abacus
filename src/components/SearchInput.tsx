'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface SearchInputProps {
  days: number;
  placeholder?: string;
}

export function SearchInput({ days, placeholder = 'Search users...' }: SearchInputProps) {
  const router = useRouter();
  const [value, setValue] = useState('');

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim()) {
      router.push(`/users?days=${days}&search=${encodeURIComponent(value.trim())}`);
    } else {
      router.push(`/users?days=${days}`);
    }
  }, [value, days, router]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit(e);
    }
  }, [handleSubmit]);

  return (
    <form onSubmit={handleSubmit} className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-48 sm:w-56 rounded-lg border border-white/10 bg-white/[0.02] px-4 py-2 pl-9 font-mono text-xs text-white placeholder-white/30 outline-none transition-colors focus:border-amber-500/50 focus:bg-white/[0.04]"
      />
      <svg className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      {value && (
        <button
          type="button"
          onClick={() => setValue('')}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </form>
  );
}

// Inline search for use on the users page (doesn't navigate, just filters)
interface InlineSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function InlineSearchInput({ value, onChange, placeholder = 'Search users...' }: InlineSearchInputProps) {
  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-48 sm:w-64 rounded-lg border border-white/10 bg-white/[0.02] px-4 py-2 pl-9 font-mono text-xs text-white placeholder-white/30 outline-none transition-colors focus:border-amber-500/50 focus:bg-white/[0.04]"
      />
      <svg className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
