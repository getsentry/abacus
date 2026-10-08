/**
 * Provider key management for multi-organization support.
 *
 * Supports both single-key and multi-key configurations:
 * - Single key: ANTHROPIC_ADMIN_KEY / CURSOR_ADMIN_KEY
 * - Multi-key: ANTHROPIC_ADMIN_KEYS / CURSOR_ADMIN_KEYS (comma-separated)
 *
 * Multi-key format: "sk-key-1,sk-key-2,sk-key-3"
 */

export const NO_ANTHROPIC_KEYS_ERROR =
  'No Anthropic admin keys configured (set ANTHROPIC_ADMIN_KEY or ANTHROPIC_ADMIN_KEYS)';
export const NO_CURSOR_KEYS_ERROR =
  'No Cursor admin keys configured (set CURSOR_ADMIN_KEY or CURSOR_ADMIN_KEYS)';
export const NO_OPENROUTER_KEY_ERROR =
  'No OpenRouter management key configured (set OPENROUTER_MANAGEMENT_KEY)';

export interface ProviderKey {
  key: string;
  name: string;
}

/**
 * Parse comma-separated keys into ProviderKey array.
 * Names are auto-generated as "default" for single key, or KEY_1, KEY_2, etc. for multiple.
 */
function parseKeys(value: string): ProviderKey[] {
  const keys = value
    .split(',')
    .map((k) => k.trim())
    .filter((k) => k.length > 0);

  if (keys.length === 0) {
    return [];
  }

  return keys.map((key, i) => ({
    key,
    name: keys.length === 1 ? 'default' : `KEY_${i + 1}`,
  }));
}

/**
 * Get provider keys from environment variables.
 * Checks plural form (comma-separated) first, falls back to singular form.
 */
function getProviderKeys(pluralEnvVar: string, singularEnvVar: string): ProviderKey[] {
  const multiKey = process.env[pluralEnvVar];
  if (multiKey) {
    return parseKeys(multiKey);
  }

  const singleKey = process.env[singularEnvVar];
  if (singleKey) {
    return [{ key: singleKey, name: 'default' }];
  }

  return [];
}

/**
 * Get Anthropic admin keys.
 */
export function getAnthropicKeys(): ProviderKey[] {
  return getProviderKeys('ANTHROPIC_ADMIN_KEYS', 'ANTHROPIC_ADMIN_KEY');
}

/**
 * Get Cursor admin keys.
 */
export function getCursorKeys(): ProviderKey[] {
  return getProviderKeys('CURSOR_ADMIN_KEYS', 'CURSOR_ADMIN_KEY');
}

/**
 * Get the OpenRouter management key, if configured.
 */
export function getOpenRouterKey(): string | null {
  return process.env.OPENROUTER_MANAGEMENT_KEY?.trim() || null;
}

/**
 * Get the OpenRouter workspaces to import (IDs or slugs, comma-separated).
 * An empty list means activity from all workspaces is imported.
 */
export function getOpenRouterWorkspaces(): string[] {
  return (process.env.OPENROUTER_WORKSPACES || '')
    .split(',')
    .map((w) => w.trim())
    .filter((w) => w.length > 0);
}
