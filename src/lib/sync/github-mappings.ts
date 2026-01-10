/**
 * GitHub User Identity Mapping
 *
 * Syncs GitHub organization members and maps their user IDs to emails.
 * Uses the same identity_mappings table as other providers.
 *
 * Uses GitHub's GraphQL API with `organizationVerifiedDomainEmails` to
 * automatically sync verified domain emails for org members.
 */

import { getIdentityMappings, setIdentityMapping } from '../queries';
import { getGitHubToken } from './github';
import { db, commits, repositories, identityMappings } from '../db';
import { sql } from 'drizzle-orm';

const SOURCE = 'github';
const GITHUB_ORG = process.env.GITHUB_ORG || 'getsentry';

interface GitHubOrgMember {
  id: number;
  login: string;
  avatar_url: string;
  type: string;
}

interface MembersResponse {
  data: GitHubOrgMember[];
  hasMore: boolean;
}

export interface GitHubMappingResult {
  success: boolean;
  usersFound: number;
  mappingsCreated: number;
  errors: string[];
}

interface GraphQLMember {
  login: string;
  databaseId: number;
  organizationVerifiedDomainEmails: string[];
}

interface GraphQLResponse {
  data?: {
    organization?: {
      membersWithRole: {
        nodes: GraphQLMember[];
        pageInfo: {
          hasNextPage: boolean;
          endCursor: string | null;
        };
      };
    };
  };
  errors?: Array<{ message: string }>;
}

/**
 * Fetch org members with verified domain emails using GraphQL.
 * Requires GitHub App with `Members: Read-only` permission.
 */
async function fetchOrgMembersWithEmails(org: string): Promise<GraphQLMember[]> {
  const token = await getGitHubToken();
  const members: GraphQLMember[] = [];
  let cursor: string | null = null;

  while (true) {
    const query = `
      query($org: String!, $cursor: String) {
        organization(login: $org) {
          membersWithRole(first: 100, after: $cursor) {
            nodes {
              login
              databaseId
              organizationVerifiedDomainEmails(login: $org)
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      }
    `;

    const response = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: { org, cursor },
      }),
    });

    if (!response.ok) {
      throw new Error(`GraphQL request failed: ${response.status}`);
    }

    const result: GraphQLResponse = await response.json();

    if (result.errors?.length) {
      throw new Error(`GraphQL errors: ${result.errors.map(e => e.message).join(', ')}`);
    }

    const membersData = result.data?.organization?.membersWithRole;
    if (!membersData) {
      throw new Error('No organization data returned');
    }

    members.push(...membersData.nodes);

    if (!membersData.pageInfo.hasNextPage) {
      break;
    }
    cursor = membersData.pageInfo.endCursor;

    // Small delay to be nice to the API
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return members;
}

/**
 * Sync GitHub org member emails using GraphQL API.
 * Creates identity mappings for members with verified domain emails.
 */
export async function syncGitHubMemberEmails(
  options: { onProgress?: (msg: string) => void; org?: string } = {}
): Promise<GitHubMappingResult> {
  const log = options.onProgress || (() => {});
  const org = options.org || GITHUB_ORG;

  const result: GitHubMappingResult = {
    success: true,
    usersFound: 0,
    mappingsCreated: 0,
    errors: [],
  };

  try {
    log(`Fetching members of ${org} with verified emails...`);
    const members = await fetchOrgMembersWithEmails(org);
    result.usersFound = members.length;
    log(`Found ${members.length} members`);

    // Create mappings for members with verified emails
    for (const member of members) {
      if (member.organizationVerifiedDomainEmails.length > 0) {
        // Use the first verified email
        const email = member.organizationVerifiedDomainEmails[0];
        const userId = member.databaseId.toString();

        try {
          await setIdentityMapping(SOURCE, userId, email);
          result.mappingsCreated++;
          log(`Mapped ${member.login} (${userId}) → ${email}`);
        } catch (err) {
          result.errors.push(`Failed to map ${member.login}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      }
    }

    log(`Created ${result.mappingsCreated} mappings`);
  } catch (err) {
    result.success = false;
    result.errors.push(err instanceof Error ? err.message : 'Unknown error');
  }

  return result;
}

/**
 * Check if there are unattributed commits that need mapping.
 */
export async function hasUnattributedCommits(): Promise<boolean> {
  const result = await db.execute<{ has_unattributed: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1
      FROM ${commits} c
      JOIN ${repositories} r ON c.repo_id = r.id
      LEFT JOIN ${identityMappings} m ON m.source = r.source AND m.external_id = c.author_id
      WHERE r.source = 'github'
        AND c.author_id IS NOT NULL
        AND m.external_id IS NULL
      LIMIT 1
    ) as has_unattributed
  `);
  return result.rows[0]?.has_unattributed === true;
}

/**
 * Fetch all members of a GitHub organization (REST API).
 */
async function fetchOrgMembers(org: string): Promise<GitHubOrgMember[]> {
  const token = await getGitHubToken();
  const members: GitHubOrgMember[] = [];
  let page = 1;

  while (true) {
    const response = await fetch(
      `https://api.github.com/orgs/${org}/members?per_page=100&page=${page}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch org members: ${response.status}`);
    }

    const data: GitHubOrgMember[] = await response.json();
    if (data.length === 0) break;

    members.push(...data);
    page++;

    // Small delay to be nice to the API
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return members;
}

/**
 * Get GitHub users who have commits but no identity mapping.
 * Returns users with their commit counts.
 */
export async function getUnmappedGitHubUsers(): Promise<{
  authorId: string;
  commitCount: number;
  sampleEmail: string | null;
}[]> {
  const result = await db.execute<{
    authorId: string;
    commitCount: number;
    sampleEmail: string | null;
  }>(sql`
    SELECT
      c.author_id as "authorId",
      COUNT(*)::int as "commitCount",
      MIN(c.author_email) as "sampleEmail"
    FROM ${commits} c
    JOIN ${repositories} r ON c.repo_id = r.id
    LEFT JOIN ${identityMappings} m ON m.source = r.source AND m.external_id = c.author_id
    WHERE r.source = 'github'
      AND c.author_id IS NOT NULL
      AND m.external_id IS NULL
    GROUP BY c.author_id
    ORDER BY "commitCount" DESC
  `);

  return result.rows;
}

/**
 * Get all GitHub users who have commits, with their mapping status.
 */
export async function getGitHubUsersWithMappingStatus(org?: string): Promise<{
  authorId: string;
  login: string | null;
  email: string | null;
  commitCount: number;
  isMapped: boolean;
}[]> {
  // First, get all unique author_ids from commits
  const commitAuthors = await db.execute<{
    authorId: string;
    commitCount: number;
  }>(sql`
    SELECT
      c.author_id as "authorId",
      COUNT(*)::int as "commitCount"
    FROM ${commits} c
    JOIN ${repositories} r ON c.repo_id = r.id
    WHERE r.source = 'github'
      AND c.author_id IS NOT NULL
    GROUP BY c.author_id
    ORDER BY "commitCount" DESC
  `);

  // Get existing mappings
  const mappings = await getIdentityMappings(SOURCE);
  const mappingMap = new Map(mappings.map(m => [m.external_id, m.email]));

  // Try to fetch org members to get logins
  let memberMap = new Map<string, string>();
  if (org) {
    try {
      const members = await fetchOrgMembers(org);
      memberMap = new Map(members.map(m => [m.id.toString(), m.login]));
    } catch {
      // Ignore errors, we'll just not have login info
    }
  }

  return commitAuthors.rows.map(row => ({
    authorId: row.authorId,
    login: memberMap.get(row.authorId) || null,
    email: mappingMap.get(row.authorId) || null,
    commitCount: row.commitCount,
    isMapped: mappingMap.has(row.authorId),
  }));
}

/**
 * Map a GitHub user ID to an email address.
 * This will also update all existing commits from this user.
 */
export async function mapGitHubUser(githubUserId: string, email: string): Promise<void> {
  await setIdentityMapping(SOURCE, githubUserId, email);
}

/**
 * Sync organization members from GitHub.
 * Creates placeholder mappings (without emails) for tracking purposes.
 * Admin must manually set emails after syncing.
 *
 * Note: This is primarily useful for getting the list of org members.
 * The actual identity mapping happens when commits are synced and author_id is captured.
 */
export async function syncGitHubOrgMembers(
  org: string,
  options: { onProgress?: (msg: string) => void } = {}
): Promise<GitHubMappingResult> {
  const log = options.onProgress || (() => {});

  const result: GitHubMappingResult = {
    success: true,
    usersFound: 0,
    mappingsCreated: 0,
    errors: [],
  };

  try {
    log(`Fetching members of ${org}...`);
    const members = await fetchOrgMembers(org);
    result.usersFound = members.length;
    log(`Found ${members.length} members`);

    // We don't create mappings here because we don't have emails
    // The mappings will be created when:
    // 1. Commits are synced (author_id is captured)
    // 2. Admin manually maps users via CLI

    log(`Members synced. Use 'github:users:map' to map users to emails.`);
  } catch (err) {
    result.success = false;
    result.errors.push(err instanceof Error ? err.message : 'Unknown error');
  }

  return result;
}

/**
 * Get GitHub user info by ID.
 */
export async function getGitHubUser(userId: string): Promise<{ id: number; login: string } | null> {
  try {
    const token = await getGitHubToken();
    const response = await fetch(`https://api.github.com/user/${userId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (!response.ok) return null;

    const data = await response.json();
    return { id: data.id, login: data.login };
  } catch {
    return null;
  }
}
