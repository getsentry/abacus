/**
 * Provider key management for multi-organization support.
 *
 * Supports both single-key and multi-key configurations:
 * - Single key: ANTHROPIC_ADMIN_KEY / CURSOR_ADMIN_KEY
 * - Multi-key: ANTHROPIC_ADMIN_KEYS / CURSOR_ADMIN_KEYS (JSON array)
 *
 * Multi-key format: [{"key": "sk-...", "name": "Org Name"}, ...]
 */

export const NO_ANTHROPIC_KEYS_ERROR = 'No Anthropic admin keys configured (set ANTHROPIC_ADMIN_KEY or ANTHROPIC_ADMIN_KEYS)';
export const NO_CURSOR_KEYS_ERROR = 'No Cursor admin keys configured (set CURSOR_ADMIN_KEY or CURSOR_ADMIN_KEYS)';

export interface ProviderKey {
  key: string;
  name: string;
}

/**
 * Parse a JSON array of provider keys.
 * Returns null if the value is not a valid array with required fields.
 */
function parseKeysJson(value: string): ProviderKey[] | null {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return null;
    }
    const isValid = parsed.every(
      (entry) => typeof entry.key === 'string' && typeof entry.name === 'string'
    );
    return isValid ? (parsed as ProviderKey[]) : null;
  } catch {
    return null;
  }
}

/**
 * Get provider keys from environment variables.
 * Checks plural form (JSON array) first, falls back to singular form.
 */
function getProviderKeys(pluralEnvVar: string, singularEnvVar: string): ProviderKey[] {
  const multiKey = process.env[pluralEnvVar];
  if (multiKey) {
    const parsed = parseKeysJson(multiKey);
    if (parsed && parsed.length > 0) {
      return parsed;
    }
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
