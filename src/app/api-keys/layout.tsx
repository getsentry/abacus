import { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { apiKeysPageFlag } from '@/flags';

/**
 * Server-side gate for the API Keys page: 404 when the
 * "api-keys-page" feature flag is off.
 */
export default async function ApiKeysLayout({ children }: { children: ReactNode }) {
  const enabled = await apiKeysPageFlag();
  if (!enabled) notFound();
  return children;
}
