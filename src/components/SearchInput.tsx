'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X } from 'lucide-react';

// Shared base component for search input styling
interface BaseSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  placeholder?: string;
  onSubmit?: (e: React.FormEvent) => void;
}

function BaseSearchInput({
  value,
  onChange,
  onClear,
  placeholder = 'Search...',
  onSubmit,
}: BaseSearchInputProps) {
  const content = (
    <>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-48 sm:w-56 rounded-lg border border-white/10 bg-white/[0.02] px-4 py-2 pl-9 font-mono text-xs text-white placeholder-white/30 outline-none transition-colors focus:border-amber-500/50 focus:bg-white/[0.04]"
      />
      <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" strokeWidth={1.5} />
      {value && (
        <button
          type="button"
          onClick={onClear}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors cursor-pointer"
        >
          <X className="h-3.5 w-3.5" strokeWidth={1.5} />
        </button>
      )}
    </>
  );

  if (onSubmit) {
    return (
      <form onSubmit={onSubmit} className="relative">
        {content}
      </form>
    );
  }

  return <div className="relative">{content}</div>;
}

// Search input that navigates to users page on submit
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

  return (
    <BaseSearchInput
      value={value}
      onChange={setValue}
      onClear={() => setValue('')}
      placeholder={placeholder}
      onSubmit={handleSubmit}
    />
  );
}

// Inline search for controlled filtering (doesn't navigate)
interface InlineSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function InlineSearchInput({ value, onChange, placeholder = 'Search...' }: InlineSearchInputProps) {
  return (
    <BaseSearchInput
      value={value}
      onChange={onChange}
      onClear={() => onChange('')}
      placeholder={placeholder}
    />
  );
}
