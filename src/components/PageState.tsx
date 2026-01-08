'use client';

import { type LucideIcon } from 'lucide-react';

interface LoadingStateProps {
  message?: string;
}

export function LoadingState({ message = 'Loading...' }: LoadingStateProps) {
  return (
    <div className="flex h-64 items-center justify-center">
      <div className="font-mono text-sm text-white/40">{message}</div>
    </div>
  );
}

interface ErrorStateProps {
  title?: string;
  message: string;
}

export function ErrorState({ title = 'Error loading data', message }: ErrorStateProps) {
  return (
    <div className="flex h-64 items-center justify-center">
      <div className="text-center">
        <div className="font-mono text-sm text-red-400 mb-2">{title}</div>
        <div className="font-mono text-xs text-white/40">{message}</div>
      </div>
    </div>
  );
}

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
}

export function EmptyState({ icon: Icon, title, description }: EmptyStateProps) {
  return (
    <div className="flex h-64 items-center justify-center">
      <div className="text-center">
        {Icon && <Icon className="w-8 h-8 text-white/20 mx-auto mb-3" />}
        <div className="font-mono text-sm text-white/40 mb-2">{title}</div>
        {description && (
          <div className="font-mono text-xs text-faint">{description}</div>
        )}
      </div>
    </div>
  );
}
