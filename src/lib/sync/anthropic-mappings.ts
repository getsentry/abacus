/**
 * Auto-map Anthropic API keys to user emails using the Admin API
 *
 * Uses two endpoints:
 * - GET /v1/organizations/users - Get all org users with emails
 * - GET /v1/organizations/api_keys - Get all API keys with creator IDs
 *
 * Cross-references to create api_key_id → email mappings
 */

import { setApiKeyMapping, getApiKeyMappings } from '../queries';

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

async function fetchAllApiKeys(adminKey: string): Promise<AnthropicApiKey[]> {
  const apiKeys: AnthropicApiKey[] = [];
  let afterId: string | undefined;

  do {
    const params = new URLSearchParams({ limit: '100' });
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

export async function syncAnthropicApiKeyMappings(): Promise<MappingResult> {
  const adminKey = process.env.ANTHROPIC_ADMIN_KEY;
  if (!adminKey) {
    return {
      success: false,
      mappingsCreated: 0,
      mappingsSkipped: 0,
      errors: ['ANTHROPIC_ADMIN_KEY not configured']
    };
  }

  const result: MappingResult = {
    success: true,
    mappingsCreated: 0,
    mappingsSkipped: 0,
    errors: []
  };

  try {
    // Fetch all users and API keys in parallel
    const [userMap, apiKeys] = await Promise.all([
      fetchAllUsers(adminKey),
      fetchAllApiKeys(adminKey)
    ]);

    // Get existing mappings to avoid duplicates
    const existingMappings = await getApiKeyMappings();
    const existingSet = new Set(existingMappings.map(m => m.api_key));

    // Create mappings for each API key
    for (const apiKey of apiKeys) {
      // Skip inactive keys
      if (apiKey.status !== 'active') continue;

      // The API key ID from usage reports might be the full key ID or partial
      // We'll store both the ID and try to match by partial hint
      const creatorEmail = userMap.get(apiKey.created_by.id);

      if (!creatorEmail) {
        result.errors.push(`No email found for creator ${apiKey.created_by.id} of key ${apiKey.id}`);
        result.mappingsSkipped++;
        continue;
      }

      // Skip if already mapped
      if (existingSet.has(apiKey.id)) {
        result.mappingsSkipped++;
        continue;
      }

      try {
        await setApiKeyMapping(apiKey.id, creatorEmail);
        result.mappingsCreated++;
      } catch (err) {
        result.errors.push(`Failed to save mapping for ${apiKey.id}: ${err}`);
        result.mappingsSkipped++;
      }
    }

  } catch (err) {
    result.success = false;
    result.errors.push(err instanceof Error ? err.message : 'Unknown error');
  }

  return result;
}

// Get user email by API key ID (for on-the-fly lookups)
export async function getEmailForApiKey(apiKeyId: string): Promise<string | null> {
  const adminKey = process.env.ANTHROPIC_ADMIN_KEY;
  if (!adminKey) return null;

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

    if (!keyResponse.ok) return null;

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

    if (!userResponse.ok) return null;

    const user: AnthropicUser = await userResponse.json();
    return user.email;

  } catch {
    return null;
  }
}
