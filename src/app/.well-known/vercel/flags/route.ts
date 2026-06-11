import { createFlagsDiscoveryEndpoint, getProviderData } from 'flags/next';
import * as flags from '@/flags';

/**
 * Flags Explorer discovery endpoint — lets the Vercel Toolbar list and
 * override the app's feature flags. Secured via FLAGS_SECRET.
 */
export const GET = createFlagsDiscoveryEndpoint(async () => {
  return getProviderData(flags);
});
