import { flag } from 'flags/next';
import { vercelAdapter } from '@flags-sdk/vercel';

/**
 * Gates the OpenRouter API Keys page (/api-keys) and its nav entry.
 *
 * Backed by Vercel Flags (flag key "api-keys-page" in the dashboard).
 * When the flag cannot be evaluated (e.g. local dev without the FLAGS
 * SDK key), it falls back to visible in development and hidden elsewhere.
 */
export const apiKeysPageFlag = flag<boolean>({
  key: 'api-keys-page',
  description: 'Expose the OpenRouter API Keys page (/api-keys) and nav entry',
  defaultValue: process.env.NODE_ENV === 'development',
  adapter: vercelAdapter(),
});
