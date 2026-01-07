/**
 * Auto-map OpenAI user IDs to user emails using the Admin API
 *
 * Uses the endpoint:
 * - GET /v1/organization/users - Get all org users with emails
 *
 * OpenAI usage data includes user_id directly, so we just need to map user_id → email
 */

import { setToolIdentityMapping, getToolIdentityMappings, getUnmappedToolRecords } from '../queries';

const TOOL = 'openai';

interface OpenAIUser {
  object: string;
  id: string;
  email: string;
  name: string;
  role: string;
  added_at: number; // Unix timestamp
}

interface UsersResponse {
  object: string;
  data: OpenAIUser[];
  has_more: boolean;
  first_id?: string;
  last_id?: string;
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
    if (afterId) params.set('after', afterId);

    const response = await fetch(
      `https://api.openai.com/v1/organization/users?${params}`,
      {
        headers: {
          'Authorization': `Bearer ${adminKey}`,
          'Content-Type': 'application/json'
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

/**
 * Sync all OpenAI user mappings (user_id → email)
 */
export async function syncOpenAIUserMappings(): Promise<MappingResult> {
  const adminKey = process.env.OPENAI_ADMIN_KEY;
  if (!adminKey) {
    return {
      success: false,
      mappingsCreated: 0,
      mappingsSkipped: 0,
      errors: ['OPENAI_ADMIN_KEY not configured']
    };
  }

  const result: MappingResult = {
    success: true,
    mappingsCreated: 0,
    mappingsSkipped: 0,
    errors: []
  };

  try {
    // Fetch all users
    const userMap = await fetchAllUsers(adminKey);

    // Get existing mappings to avoid duplicates
    const existingMappings = await getToolIdentityMappings(TOOL);
    const existingSet = new Set(existingMappings.map(m => m.external_id));

    // Create mappings for each user
    for (const [userId, email] of userMap) {
      // Skip if already mapped
      if (existingSet.has(userId)) {
        result.mappingsSkipped++;
        continue;
      }

      try {
        await setToolIdentityMapping(TOOL, userId, email);
        result.mappingsCreated++;
      } catch (err) {
        result.errors.push(`Failed to save mapping for ${userId}: ${err}`);
        result.mappingsSkipped++;
      }
    }

  } catch (err) {
    result.success = false;
    result.errors.push(err instanceof Error ? err.message : 'Unknown error');
  }

  return result;
}

/**
 * Get user email by user ID (for on-the-fly lookups)
 */
export async function getEmailForUserId(userId: string): Promise<string | null> {
  const adminKey = process.env.OPENAI_ADMIN_KEY;
  if (!adminKey) return null;

  try {
    const response = await fetch(
      `https://api.openai.com/v1/organization/users/${userId}`,
      {
        headers: {
          'Authorization': `Bearer ${adminKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) return null;

    const user: OpenAIUser = await response.json();
    return user.email;

  } catch {
    return null;
  }
}

/**
 * Smart sync that uses incremental lookups for small numbers of unmapped users,
 * falling back to full sync when there are many.
 */
export async function syncOpenAIUserMappingsSmart(
  options: { incrementalThreshold?: number } = {}
): Promise<MappingResult> {
  const threshold = options.incrementalThreshold ?? 20;

  // Check how many unmapped records we have for openai
  const unmappedRecords = await getUnmappedToolRecords(TOOL);

  if (unmappedRecords.length === 0) {
    return {
      success: true,
      mappingsCreated: 0,
      mappingsSkipped: 0,
      errors: []
    };
  }

  // If we have few unmapped users, do individual lookups (1 API call per user)
  // If we have many, do full sync (1 paginated API call total)
  if (unmappedRecords.length <= threshold) {
    return syncOpenAIUserMappingsIncremental(unmappedRecords.map(r => r.tool_record_id));
  }

  return syncOpenAIUserMappings();
}

/**
 * Incremental sync - looks up only specific user IDs individually.
 * More efficient when only a few users need mapping.
 */
async function syncOpenAIUserMappingsIncremental(userIds: string[]): Promise<MappingResult> {
  const adminKey = process.env.OPENAI_ADMIN_KEY;
  if (!adminKey) {
    return {
      success: false,
      mappingsCreated: 0,
      mappingsSkipped: 0,
      errors: ['OPENAI_ADMIN_KEY not configured']
    };
  }

  const result: MappingResult = {
    success: true,
    mappingsCreated: 0,
    mappingsSkipped: 0,
    errors: []
  };

  for (const userId of userIds) {
    try {
      const response = await fetch(
        `https://api.openai.com/v1/organization/users/${userId}`,
        {
          headers: {
            'Authorization': `Bearer ${adminKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        result.mappingsSkipped++;
        if (response.status !== 404) {
          result.errors.push(`Failed to fetch user ${userId}: ${response.status}`);
        }
        continue;
      }

      const user: OpenAIUser = await response.json();

      // Save the mapping (also updates usage_records)
      await setToolIdentityMapping(TOOL, userId, user.email);
      result.mappingsCreated++;

    } catch (err) {
      result.mappingsSkipped++;
      result.errors.push(`Error processing ${userId}: ${err instanceof Error ? err.message : 'Unknown'}`);
    }
  }

  return result;
}
