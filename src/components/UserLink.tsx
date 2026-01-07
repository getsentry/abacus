'use client';

import { useUserPanel } from '@/contexts/UserPanelContext';

interface UserLinkProps {
  email: string;
  children?: React.ReactNode;
  className?: string;
}

export function UserLink({ email, children, className = '' }: UserLinkProps) {
  const { openUserPanel } = useUserPanel();

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        openUserPanel(email);
      }}
      className={`text-left hover:text-amber-400 transition-colors cursor-pointer ${className}`}
    >
      {children || email}
    </button>
  );
}
