'use client';

import { Suspense, ReactNode, createContext, useContext } from 'react';
import { TimeRangeProvider } from '@/contexts/TimeRangeContext';
import { UserPanelProvider } from '@/contexts/UserPanelContext';

export interface FeatureFlags {
  apiKeysPage: boolean;
}

const FeatureFlagsContext = createContext<FeatureFlags>({ apiKeysPage: false });

export function useFeatureFlags(): FeatureFlags {
  return useContext(FeatureFlagsContext);
}

export function Providers({ children, featureFlags }: { children: ReactNode; featureFlags: FeatureFlags }) {
  return (
    <Suspense fallback={null}>
      <FeatureFlagsContext.Provider value={featureFlags}>
        <TimeRangeProvider>
          <UserPanelProvider>
            {children}
          </UserPanelProvider>
        </TimeRangeProvider>
      </FeatureFlagsContext.Provider>
    </Suspense>
  );
}
