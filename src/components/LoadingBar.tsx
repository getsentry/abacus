'use client';

interface LoadingBarProps {
  isLoading: boolean;
}

export function LoadingBar({ isLoading }: LoadingBarProps) {
  if (!isLoading) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 h-0.5 bg-amber-500/20 overflow-hidden">
      <div className="h-full bg-amber-500 animate-progress" />
    </div>
  );
}
