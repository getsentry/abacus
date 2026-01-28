/**
 * Auto-map Anthropic API keys to user emails using the Admin API
 *
 * Uses two endpoints:
 * - GET /v1/organizations/users - Get all org users with emails
 * - GET /v1/organizations/api_keys - Get all API keys with creator IDs
 *
 * Cross-references to create external_id → email mappings for the claude_code tool
 */

import * as Sentry from '@sentry/nextjs';
import { setIdentityMapping, getIdentityMappings, getUnmappedToolRecords } from '../queries';
import { getAnthropicKeys, NO_ANTHROPIC_KEYS_ERROR } from './provider-keys';

const TOOL = 'claude_code';

interface AnthropicUser {
  id: string;
  email: string;
  name: string;
  role: string;
  type: string;
  added_at: string;
}

interface AnthropicApiKey {
  id: string;
  name: string;
  created_at: string;
  created_by: {
    id: string;
    type: string;
  };
  partial_key_hint: string;
  status: string;
  workspace_id: string;
  type: string;
}

interface UsersResponse {
  data: AnthropicUser[];
  has_more: boolean;
  first_id: string;
  last_id: string;
}

interface ApiKeysResponse {
  data: AnthropicApiKey[];
  has_more: boolean;
  first_id: string;
  last_id: string;
}

export interface MappingResult {
  success: boolean;
  mappingsCreated: number;
  mappingsSkipped: number;
  errors: string[];
}

async function fetchAllUsers(adminKey: string): Promise<Map<string, string>> {
  const userMap = new Map<string, string>(); // user_id → email
  let afterId: string | undefined;

  do {
    const params = new URLSearchParams({ limit: '100' });
    if (afterId) params.set('after_id', afterId);

    const response = await fetch(
      `https://api.anthropic.com/v1/organizations/users?${params}`,
      {
        headers: {
          'X-Api-Key': adminKey,
          'anthropic-version': '2023-06-01'
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch users: ${response.status}`);
    }

    const data: UsersResponse = await response.json();

    for (const user of data.data) {
      userMap.set(user.id, user.email);
    }

    afterId = data.has_more ? data.last_id : undefined;
  } while (afterId);

  return userMap;
}

async function fetchAllApiKeys(adminKey: string, status: 'active' | 'inactive' | 'archived' = 'active'): Promise<AnthropicApiKey[]> {
  const apiKeys: AnthropicApiKey[] = [];
  let afterId: string | undefined;

  do {
    const params = new URLSearchParams({ limit: '100', status });
    if (afterId) params.set('after_id', afterId);

    const response = await fetch(
      `https://api.anthropic.com/v1/organizations/api_keys?${params}`,
      {
        headers: {
          'X-Api-Key': adminKey,
          'anthropic-version': '2023-06-01'
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch API keys: ${response.status}`);
    }

    const data: ApiKeysResponse = await response.json();
    apiKeys.push(...data.data);

    afterId = data.has_more ? data.last_id : undefined;
  } while (afterId);

  return apiKeys;
}

export async function syncAnthropicApiKeyMappings(
  options: { includeArchived?: boolean } = {}
): Promise<MappingResult> {
  const keys = getAnthropicKeys();
  if (keys.length === 0) {
    return {
      success: false,
      mappingsCreated: 0,
      mappingsSkipped: 0,
      errors: [NO_ANTHROPIC_KEYS_ERROR]
    };
  }

  const result: MappingResult = {
    success: true,
    mappingsCreated: 0,
    mappingsSkipped: 0,
    errors: []
  };

  // Get existing mappings once to avoid duplicates across all orgs
  const existingMappings = await getIdentityMappings(TOOL);
  const existingSet = new Set(existingMappings.map(m => m.external_id));

  // Process each organization
  for (const { key: adminKey, name: orgName } of keys) {
    try {
      // Fetch all users and API keys in parallel
      const promises = [
        fetchAllUsers(adminKey),
        fetchAllApiKeys(adminKey, 'active'),
        ...(options.includeArchived ? [fetchAllApiKeys(adminKey, 'archived')] : [])
      ];

      const results = await Promise.all(promises);
      const userMap = results[0] as Map<string, string>;
      const activeKeys = results[1] as AnthropicApiKey[];
      const archivedKeys = options.includeArchived ? (results[2] as AnthropicApiKey[]) : [];
      const apiKeys = [...activeKeys, ...archivedKeys];

      // Create mappings for each API key
      for (const apiKey of apiKeys) {
        if (existingSet.has(apiKey.id)) {
          result.mappingsSkipped++;
          continue;
        }

        const creatorEmail = userMap.get(apiKey.created_by.id);
        if (!creatorEmail) {
          result.errors.push(`[${orgName}] No email found for creator ${apiKey.created_by.id} of key ${apiKey.id}`);
          result.mappingsSkipped++;
          continue;
        }

        try {
          await setIdentityMapping(TOOL, apiKey.id, creatorEmail);
          existingSet.add(apiKey.id); // Track newly created mappings
          result.mappingsCreated++;
        } catch (err) {
          result.errors.push(`[${orgName}] Failed to save mapping for ${apiKey.id}: ${err}`);
          result.mappingsSkipped++;
        }
      }

    } catch (err) {
      result.success = false;
      result.errors.push(`[${orgName}] ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  return result;
}

// Get user email by API key ID (for on-the-fly lookups)
// Tries each configured admin key until one succeeds
export async function getEmailForApiKey(apiKeyId: string): Promise<string | null> {
  const keys = getAnthropicKeys();
  if (keys.length === 0) return null;

  for (const { key: adminKey } of keys) {
    try {
      // First get the API key details
      const keyResponse = await fetch(
        `https://api.anthropic.com/v1/organizations/api_keys/${apiKeyId}`,
        {
          headers: {
            'X-Api-Key': adminKey,
            'anthropic-version': '2023-06-01'
          }
        }
      );

      if (!keyResponse.ok) continue; // Try next org

      const apiKey: AnthropicApiKey = await keyResponse.json();
      const creatorId = apiKey.created_by.id;

      // Then get the user details
      const userResponse = await fetch(
        `https://api.anthropic.com/v1/organizations/users/${creatorId}`,
        {
          headers: {
            'X-Api-Key': adminKey,
            'anthropic-version': '2023-06-01'
          }
        }
      );

      if (!userResponse.ok) continue; // Try next org

      const user: AnthropicUser = await userResponse.json();
      return user.email;

    } catch {
      // Try next org
      continue;
    }
  }

  return null;
}

/**
 * Smart sync that uses incremental lookups for small numbers of unmapped keys,
 * falling back to full sync when there are many.
 */
export async function syncApiKeyMappingsSmart(
  options: { incrementalThreshold?: number } = {}
): Promise<MappingResult> {
  const threshold = options.incrementalThreshold ?? 20;

  // Check how many unmapped records we have for claude_code
  const unmappedRecords = await getUnmappedToolRecords(TOOL);

  if (unmappedRecords.length === 0) {
    return {
      success: true,
      mappingsCreated: 0,
      mappingsSkipped: 0,
      errors: []
    };
  }

  // If few unmapped keys, do individual lookups (2 API calls per key)
  // If many, do full sync (2 paginated API calls total)
  if (unmappedRecords.length <= threshold) {
    return syncApiKeyMappingsIncremental(unmappedRecords.map(k => k.tool_record_id));
  }

  return syncAnthropicApiKeyMappings();
}

/**
 * Incremental sync - looks up only specific API keys individually.
 * More efficient when only a few keys need mapping.
 * Tries each configured admin key for each API key until one succeeds.
 */
async function syncApiKeyMappingsIncremental(apiKeyIds: string[]): Promise<MappingResult> {
  const keys = getAnthropicKeys();
  if (keys.length === 0) {
    return {
      success: false,
      mappingsCreated: 0,
      mappingsSkipped: 0,
      errors: [NO_ANTHROPIC_KEYS_ERROR]
    };
  }

  const result: MappingResult = {
    success: true,
    mappingsCreated: 0,
    mappingsSkipped: 0,
    errors: []
  };

  // Cache user lookups to avoid duplicate API calls (keyed by adminKey + creatorId)
  const userCache = new Map<string, string>();

  for (const apiKeyId of apiKeyIds) {
    let found = false;

    // Try each admin key until one succeeds
    for (const { key: adminKey, name: orgName } of keys) {
      try {
        // Get API key details
        const keyResponse = await fetch(
          `https://api.anthropic.com/v1/organizations/api_keys/${apiKeyId}`,
          {
            headers: {
              'X-Api-Key': adminKey,
              'anthropic-version': '2023-06-01'
            }
          }
        );

        if (!keyResponse.ok) {
          if (keyResponse.status !== 404) {
            result.errors.push(`[${orgName}] Failed to fetch key ${apiKeyId}: ${keyResponse.status}`);
          }
          continue; // Try next org
        }

        const apiKey: AnthropicApiKey = await keyResponse.json();
        const creatorId = apiKey.created_by?.id;
        if (!creatorId) {
          continue; // Try next org
        }

        // Check user cache first (scoped by adminKey to avoid cross-org collisions)
        const cacheKey = `${adminKey}:${creatorId}`;
        let email = userCache.get(cacheKey);
        if (!email) {
          // Fetch user details
          const userResponse = await fetch(
            `https://api.anthropic.com/v1/organizations/users/${creatorId}`,
            {
              headers: {
                'X-Api-Key': adminKey,
                'anthropic-version': '2023-06-01'
              }
            }
          );

          if (!userResponse.ok) {
            result.errors.push(`[${orgName}] Failed to fetch user ${creatorId}: ${userResponse.status}`);
            continue; // Try next org
          }

          const user: AnthropicUser = await userResponse.json();
          email = user.email;
          userCache.set(cacheKey, email);
        }

        await setIdentityMapping(TOOL, apiKeyId, email);
        result.mappingsCreated++;
        found = true;
        break; // Successfully mapped, move to next apiKeyId

      } catch (err) {
        result.errors.push(`[${orgName}] Error processing ${apiKeyId}: ${err instanceof Error ? err.message : 'Unknown'}`);
        continue; // Try next org
      }
    }

    if (!found) {
      result.mappingsSkipped++;
    }
  }

  return result;
}

/**
 * Build a map of API key name -> email for fast lookups during sync.
 * Useful when the Claude Code Analytics API returns api_actor records with only api_key_name.
 */
export async function getApiKeyNameToEmailMap(
  adminKey: string,
  options: { includeArchived?: boolean } = {}
): Promise<Map<string, string>> {
  if (!adminKey) {
    return new Map();
  }

  try {
    // Fetch all users and API keys in parallel
    const promises = [
      fetchAllUsers(adminKey),
      fetchAllApiKeys(adminKey, 'active'),
      ...(options.includeArchived ? [fetchAllApiKeys(adminKey, 'archived')] : [])
    ];

    const results = await Promise.all(promises);
    const userMap = results[0] as Map<string, string>;
    const activeKeys = results[1] as AnthropicApiKey[];
    const archivedKeys = options.includeArchived ? (results[2] as AnthropicApiKey[]) : [];

    // Build name -> email map
    // Process archived keys first, then active keys, so active keys take priority
    const nameToEmailMap = new Map<string, string>();
    const allKeysOrderedByPriority = [...archivedKeys, ...activeKeys];

    for (const apiKey of allKeysOrderedByPriority) {
      const email = userMap.get(apiKey.created_by.id);
      if (!email) continue;

      const existingEmail = nameToEmailMap.get(apiKey.name);
      if (existingEmail && existingEmail !== email) {
        console.warn(`[Anthropic Sync] Duplicate API key name "${apiKey.name}" maps to different users (${existingEmail} and ${email}) - using ${email}`);
      }
      nameToEmailMap.set(apiKey.name, email);
    }

    return nameToEmailMap;
  } catch (err) {
    const error = new Error(`Failed to fetch API key mappings: ${err instanceof Error ? err.message : 'Unknown error'}`);
    console.error('[Anthropic Sync]', error.message, '- api_actor records will not be attributed to users');
    Sentry.captureException(error);
    return new Map();
  }
}
