'use client';

import { createContext, useContext, useState, ReactNode } from 'react';
import { UserDetailPanel } from '@/components/UserDetailPanel';

interface UserPanelContextValue {
  selectedUser: string | null;
  openUserPanel: (email: string) => void;
  closeUserPanel: () => void;
}

const UserPanelContext = createContext<UserPanelContextValue | null>(null);

export function UserPanelProvider({ children }: { children: ReactNode }) {
  const [selectedUser, setSelectedUser] = useState<string | null>(null);

  const openUserPanel = (email: string) => setSelectedUser(email);
  const closeUserPanel = () => setSelectedUser(null);

  return (
    <UserPanelContext.Provider value={{ selectedUser, openUserPanel, closeUserPanel }}>
      {children}
      <UserDetailPanel email={selectedUser} onClose={closeUserPanel} />
    </UserPanelContext.Provider>
  );
}

export function useUserPanel() {
  const context = useContext(UserPanelContext);
  if (!context) {
    throw new Error('useUserPanel must be used within a UserPanelProvider');
  }
  return context;
}
