import { db, repositories, commits, identityMappings, commitAttributions, syncState } from '../db';
import { eq, and, min, sql } from 'drizzle-orm';

// ============================================
// Types
// ============================================

export interface GitHubPushEvent {
  ref: string;
  before: string;
  after: string;
  repository: {
    full_name: string;
    default_branch: string;
  };
  commits: Array<{
    id: string;
    message: string;
    timestamp: string;
    author: {
      name: string;
      email: string;
      username?: string;
    };
    added: string[];
    removed: string[];
    modified: string[];
  }>;
  pusher: {
    name: string;
    email: string;
  };
  sender?: {
    id: number;
    login: string;
  };
}

interface GitHubCommitResponse {
  sha: string;
  commit: {
    message: string;
    author: {
      name: string;
      email: string;
      date: string;
    };
  };
  author: {
    id: number;
    login: string;
  } | null;
  stats?: {
    additions: number;
    deletions: number;
  };
  parents: Array<{ sha: string }>;
}

interface AiAttribution {
  tool: string;
  model?: string;
  source?: 'co_author' | 'message_pattern' | 'author_field';
}

export interface SyncResult {
  success: boolean;
  commitsProcessed: number;
  aiAttributedCommits: number;
  errors: string[];
  syncedRange?: { startDate: string; endDate: string };
}

const SYNC_STATE_ID = 'github';

// ============================================
// GitHub User ID Extraction
// ============================================

/**
 * Extract GitHub user ID from noreply email pattern.
 * GitHub noreply emails follow the format: {id}+{username}@users.noreply.github.com
 * Returns the numeric user ID if found, null otherwise.
 */
export function extractGitHubUserIdFromEmail(email: string | null | undefined): string | null {
  if (!email) return null;

  // Match pattern: {id}+{username}@users.noreply.github.com
  const match = email.match(/^(\d+)\+[^@]+@users\.noreply\.github\.com$/i);
  if (match) {
    return match[1];
  }

  return null;
}

// ============================================
// AI Attribution Detection
// ============================================

// ReDoS-safe patterns: avoid overlapping quantifiers like \s*(...\s...)*\s*
// Use [^<]* to match content before <email> - no backtracking since only one quantifier
const AI_PATTERNS: Array<{
  pattern: RegExp;
  tool: string;
  modelExtractor?: (match: RegExpMatchArray) => string | undefined;
}> = [
  // ===========================================
  // Claude Code (Anthropic)
  // ===========================================
  // Co-Authored-By: Claude <noreply@anthropic.com>
  // Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
  // Co-Authored-By: Claude Code <noreply@anthropic.com> (old format, no model)
  {
    // [^<]* safely captures optional model name without backtracking
    pattern: /Co-Authored-By:\s+Claude\b([^<]*)<[^>]+@anthropic\.com>/i,
    tool: 'claude_code',
    modelExtractor: (match) => {
      const modelPart = match[1]?.trim();
      // "Code" is the product name, not a model - ignore it
      if (modelPart && modelPart.toLowerCase() !== 'code') {
        // "Opus 4.5" -> "opus-4.5"
        return modelPart.toLowerCase().replace(/\s+/g, '-');
      }
      return undefined;
    }
  },
  // 🤖 Generated with [Claude Code](https://claude.com/claude-code)
  {
    pattern: /Generated with \[Claude Code\]/i,
    tool: 'claude_code',
  },
  // "Generated with Claude", "Written using Claude", "Created with Claude"
  {
    pattern: /(?:generated|written|created|assisted) (?:with|using|by) Claude\b/i,
    tool: 'claude_code',
  },

  // ===========================================
  // OpenAI Codex
  // ===========================================
  // Co-authored-by: Codex <*>
  {
    pattern: /Co-Authored-By:\s+Codex\b[^<]*<[^>]+>/i,
    tool: 'codex',
  },
  // "Generated with Codex", "Codex assisted"
  {
    pattern: /(?:generated|written|created|assisted) (?:with|using|by) Codex\b/i,
    tool: 'codex',
  },
  {
    pattern: /\bCodex (?:assisted|generated|helped)/i,
    tool: 'codex',
  },

  // ===========================================
  // GitHub Copilot
  // ===========================================
  // Co-Authored-By: GitHub Copilot <*>
  {
    pattern: /Co-Authored-By:\s+GitHub Copilot\b[^<]*<[^>]+>/i,
    tool: 'github_copilot',
  },
  // Co-Authored-By: Copilot <*>
  {
    pattern: /Co-Authored-By:\s+Copilot\b[^<]*<[^>]+>/i,
    tool: 'github_copilot',
  },
  // "Generated with Copilot", "Copilot assisted", "Accepted Copilot suggestion"
  {
    pattern: /(?:generated|written|created|assisted) (?:with|using|by) (?:GitHub )?Copilot\b/i,
    tool: 'github_copilot',
  },
  {
    pattern: /\b(?:GitHub )?Copilot (?:assisted|generated|helped|suggestion)/i,
    tool: 'github_copilot',
  },
  {
    pattern: /\bAccepted (?:GitHub )?Copilot suggestion/i,
    tool: 'github_copilot',
  },

  // ===========================================
  // Cursor
  // ===========================================
  {
    pattern: /Co-Authored-By:\s+Cursor\b[^<]*<[^>]+>/i,
    tool: 'cursor',
  },
  // "Generated with Cursor", "Cursor AI assisted", "Cursor AI completion"
  {
    pattern: /(?:generated|written|created|assisted) (?:with|using|by) Cursor\b/i,
    tool: 'cursor',
  },
  {
    pattern: /\bCursor (?:AI )?(?:assisted|generated|helped|completion)/i,
    tool: 'cursor',
  },

  // ===========================================
  // Windsurf (Codeium)
  // ===========================================
  {
    pattern: /Co-Authored-By:\s+Windsurf\b[^<]*<[^>]+>/i,
    tool: 'windsurf',
  },
  {
    pattern: /Co-Authored-By:\s+Codeium\b[^<]*<[^>]+>/i,
    tool: 'windsurf',
  },
  // "Generated with Windsurf/Codeium"
  {
    pattern: /(?:generated|written|created|assisted) (?:with|using|by) (?:Windsurf|Codeium)\b/i,
    tool: 'windsurf',
  },
  {
    pattern: /\b(?:Windsurf|Codeium) (?:AI )?(?:assisted|generated|helped)/i,
    tool: 'windsurf',
  },
];

// Author patterns - detected from commit author field, not message
const AI_AUTHOR_PATTERNS: Array<{
  pattern: RegExp;
  tool: string;
}> = [
  // GitHub Copilot Coding Agent: copilot-swe-agent[bot]
  { pattern: /copilot-swe-agent\[bot\]/i, tool: 'github_copilot' },
];

/**
 * Detect AI attribution in a commit message and/or author field.
 * Returns the AI tool and optionally the model if detectable.
 *
 * @param commitMessage - The full commit message
 * @param authorName - Optional author name (e.g., "John Doe (aider)")
 * @param authorEmail - Optional author email (e.g., "copilot-swe-agent[bot]@users.noreply.github.com")
 */
export function detectAiAttribution(
  commitMessage: string,
  authorName?: string,
  authorEmail?: string
): AiAttribution | null {
  // First check commit message patterns
  for (const { pattern, tool, modelExtractor } of AI_PATTERNS) {
    const match = commitMessage.match(pattern);
    if (match) {
      return {
        tool,
        model: modelExtractor?.(match),
      };
    }
  }

  // Then check author patterns (name and email)
  const authorString = `${authorName || ''} ${authorEmail || ''}`;
  for (const { pattern, tool } of AI_AUTHOR_PATTERNS) {
    if (pattern.test(authorString)) {
      return { tool };
    }
  }

  return null;
}

/**
 * Detect ALL AI attributions in a commit message and/or author field.
 * Returns multiple attributions when a commit mentions multiple tools.
 */
export function detectAllAiAttributions(
  commitMessage: string,
  authorName?: string,
  authorEmail?: string
): AiAttribution[] {
  const attributions: AiAttribution[] = [];
  const seenTools = new Set<string>();

  // Check all commit message patterns
  for (const { pattern, tool, modelExtractor } of AI_PATTERNS) {
    if (seenTools.has(tool)) continue;

    const match = commitMessage.match(pattern);
    if (match) {
      seenTools.add(tool);
      // Determine source based on pattern type
      const source: AiAttribution['source'] = pattern.source.includes('Co-Authored-By')
        ? 'co_author'
        : 'message_pattern';
      attributions.push({
        tool,
        model: modelExtractor?.(match),
        source,
      });
    }
  }

  // Check author patterns (name and email)
  const authorString = `${authorName || ''} ${authorEmail || ''}`;
  for (const { pattern, tool } of AI_AUTHOR_PATTERNS) {
    if (seenTools.has(tool)) continue;

    if (pattern.test(authorString)) {
      seenTools.add(tool);
      attributions.push({ tool, source: 'author_field' });
    }
  }

  return attributions;
}

// ============================================
// GitHub API Client
// ============================================

// Cache for installation token (valid for 1 hour, we refresh at 50 min)
let cachedInstallationToken: { token: string; expiresAt: number } | null = null;

/**
 * Generate a JWT for GitHub App authentication.
 * The JWT is used to request an installation access token.
 */
async function generateGitHubAppJWT(appId: string, privateKey: string): Promise<string> {
  // GitHub App JWTs use RS256 algorithm
  // We'll use the Web Crypto API which is available in Node.js and Edge runtimes

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iat: now - 60, // Issued 60 seconds in the past to allow for clock drift
    exp: now + 600, // Expires in 10 minutes (max allowed by GitHub)
    iss: appId,
  };

  // Import the private key
  const pemContents = privateKey
    .replace(/-----BEGIN RSA PRIVATE KEY-----/, '')
    .replace(/-----END RSA PRIVATE KEY-----/, '')
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');

  const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  // Create JWT header and payload
  const header = { alg: 'RS256', typ: 'JWT' };
  const encodedHeader = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const encodedPayload = btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const data = `${encodedHeader}.${encodedPayload}`;
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(data)
  );

  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${data}.${encodedSignature}`;
}

/**
 * Get an installation access token for the GitHub App.
 * Caches the token and refreshes when close to expiration.
 */
async function getInstallationToken(appId: string, privateKey: string, installationId: string): Promise<string> {
  // Check if we have a valid cached token (with 10 min buffer)
  if (cachedInstallationToken && cachedInstallationToken.expiresAt > Date.now() + 10 * 60 * 1000) {
    return cachedInstallationToken.token;
  }

  const jwt = await generateGitHubAppJWT(appId, privateKey);

  const response = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get installation token: ${response.status} - ${errorText}`);
  }

  const data = await response.json();

  // Cache the token (expires_at is an ISO string)
  cachedInstallationToken = {
    token: data.token,
    expiresAt: new Date(data.expires_at).getTime(),
  };

  return data.token;
}

/**
 * Get a GitHub API token.
 * Prefers GitHub App authentication, falls back to personal access token.
 */
export async function getGitHubToken(): Promise<string> {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
  const installationId = process.env.GITHUB_APP_INSTALLATION_ID;

  // If GitHub App is configured, use it
  if (appId && privateKey && installationId) {
    return getInstallationToken(appId, privateKey, installationId);
  }

  // Fall back to personal access token (for development)
  const token = process.env.GITHUB_TOKEN;
  if (token) {
    return token;
  }

  throw new Error(
    'GitHub credentials not configured. Set either GITHUB_APP_ID + GITHUB_APP_PRIVATE_KEY + GITHUB_APP_INSTALLATION_ID, or GITHUB_TOKEN for development.'
  );
}

async function githubFetch(url: string, token: string): Promise<Response> {
  return fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
}

// ============================================
// Repository Management
// ============================================

/**
 * Get or create a repository record.
 * Returns the repository ID.
 */
export async function getOrCreateRepository(source: string, fullName: string): Promise<number> {
  // Try to get existing
  const existing = await db
    .select({ id: repositories.id })
    .from(repositories)
    .where(and(eq(repositories.source, source), eq(repositories.fullName, fullName)));

  if (existing.length > 0) {
    return existing[0].id;
  }

  // Create new (use ON CONFLICT DO UPDATE to allow RETURNING)
  const result = await db
    .insert(repositories)
    .values({ source, fullName })
    .onConflictDoUpdate({
      target: [repositories.source, repositories.fullName],
      set: { fullName },
    })
    .returning({ id: repositories.id });

  return result[0].id;
}

// ============================================
// Commit Insertion
// ============================================

interface CommitInsert {
  repoId: number;
  commitId: string;
  authorEmail: string | null;
  authorId: string | null;
  committedAt: Date;
  message: string | null;
  aiTool: string | null;
  aiModel: string | null;
  additions: number | null;
  deletions: number | null;
  // For multi-tool attribution support
  attributions?: AiAttribution[];
}

/**
 * Check if an email is a "real" work email (not a noreply/anonymous email).
 * Returns true if it's a real email that should be used for auto-mapping.
 */
function isRealWorkEmail(email: string | null): boolean {
  if (!email) return false;

  // Skip GitHub noreply emails
  if (email.endsWith('@users.noreply.github.com')) return false;

  // Skip other common noreply patterns
  if (email.includes('noreply')) return false;

  // Check if it matches the configured domain (if set)
  const domain = process.env.DOMAIN;
  if (domain && email.endsWith(`@${domain}`)) {
    return true;
  }

  // If no domain configured, accept any non-noreply email
  // This is less strict but allows the feature to work without DOMAIN set
  return !domain;
}

async function insertCommit(commit: CommitInsert): Promise<void> {
  let resolvedEmail = commit.authorEmail;

  // If we have an author ID, try to resolve the email
  if (commit.authorId) {
    if (isRealWorkEmail(commit.authorEmail)) {
      // Real work email - create/update the mapping for future use
      await db
        .insert(identityMappings)
        .values({
          source: 'github',
          externalId: commit.authorId,
          email: commit.authorEmail!,
        })
        .onConflictDoNothing({
          target: [identityMappings.source, identityMappings.externalId],
        });
    } else {
      // Noreply/anonymous email - try to resolve using existing mapping
      const mapping = await db
        .select({ email: identityMappings.email })
        .from(identityMappings)
        .where(and(
          eq(identityMappings.source, 'github'),
          eq(identityMappings.externalId, commit.authorId)
        ));
      if (mapping.length > 0) {
        resolvedEmail = mapping[0].email;
      }
    }
  }

  // Insert commit with message (ai_tool/ai_model still set for backward compatibility)
  const result = await db.execute<{ id: number }>(sql`
    INSERT INTO ${commits} (
      repo_id, commit_id, author_email, author_id, committed_at,
      message, ai_tool, ai_model, additions, deletions
    )
    VALUES (
      ${commit.repoId}, ${commit.commitId}, ${resolvedEmail},
      ${commit.authorId}, ${commit.committedAt.toISOString()},
      ${commit.message}, ${commit.aiTool}, ${commit.aiModel},
      ${commit.additions}, ${commit.deletions}
    )
    ON CONFLICT (repo_id, commit_id) DO UPDATE SET
      author_email = EXCLUDED.author_email,
      author_id = COALESCE(EXCLUDED.author_id, commits.author_id),
      message = COALESCE(EXCLUDED.message, commits.message),
      ai_tool = EXCLUDED.ai_tool,
      ai_model = EXCLUDED.ai_model,
      additions = COALESCE(EXCLUDED.additions, commits.additions),
      deletions = COALESCE(EXCLUDED.deletions, commits.deletions)
    RETURNING id
  `);

  const commitDbId = result.rows[0]?.id;

  // Insert all attributions to junction table
  if (commitDbId && commit.attributions && commit.attributions.length > 0) {
    for (const attr of commit.attributions) {
      await db
        .insert(commitAttributions)
        .values({
          commitId: commitDbId,
          aiTool: attr.tool,
          aiModel: attr.model || null,
          confidence: 'detected',
          source: attr.source || null,
        })
        .onConflictDoUpdate({
          target: [commitAttributions.commitId, commitAttributions.aiTool],
          set: {
            aiModel: sql`COALESCE(EXCLUDED.ai_model, ${commitAttributions.aiModel})`,
            source: sql`COALESCE(EXCLUDED.source, ${commitAttributions.source})`,
          },
        });
    }
  }
}

// ============================================
// Sync State Management
// ============================================

export async function getGitHubSyncState(): Promise<{ lastSyncedDate: string | null }> {
  const result = await db
    .select({ lastSyncedHourEnd: syncState.lastSyncedHourEnd })
    .from(syncState)
    .where(eq(syncState.id, SYNC_STATE_ID));

  if (result.length === 0 || !result[0].lastSyncedHourEnd) {
    return { lastSyncedDate: null };
  }
  return { lastSyncedDate: result[0].lastSyncedHourEnd };
}

async function updateGitHubSyncState(lastSyncedDate: string): Promise<void> {
  await db
    .insert(syncState)
    .values({
      id: SYNC_STATE_ID,
      lastSyncAt: new Date(),
      lastSyncedHourEnd: lastSyncedDate,
    })
    .onConflictDoUpdate({
      target: syncState.id,
      set: {
        lastSyncAt: new Date(),
        lastSyncedHourEnd: lastSyncedDate,
      },
    });
}

export async function getGitHubBackfillState(): Promise<{ oldestDate: string | null; isComplete: boolean }> {
  // Get oldest commit date from database
  const usageResult = await db.execute<{ oldest_date: string | null }>(sql`
    SELECT MIN(committed_at::date)::text as oldest_date FROM ${commits}
  `);
  const oldestDate = usageResult.rows[0]?.oldest_date || null;

  // Check if backfill is marked complete
  const stateResult = await db
    .select({ backfillComplete: syncState.backfillComplete })
    .from(syncState)
    .where(eq(syncState.id, SYNC_STATE_ID));
  const isComplete = stateResult[0]?.backfillComplete === true;

  return { oldestDate, isComplete };
}

async function markGitHubBackfillComplete(): Promise<void> {
  await db
    .insert(syncState)
    .values({
      id: SYNC_STATE_ID,
      lastSyncAt: new Date(),
      backfillComplete: true,
    })
    .onConflictDoUpdate({
      target: syncState.id,
      set: {
        lastSyncAt: new Date(),
        backfillComplete: true,
      },
    });
}

export async function resetGitHubBackfillComplete(): Promise<void> {
  await db
    .update(syncState)
    .set({ backfillComplete: false })
    .where(eq(syncState.id, SYNC_STATE_ID));
}

// ============================================
// Webhook Processing
// ============================================

/**
 * Process a GitHub push webhook event.
 * Extracts commits and stores them with AI attribution detection.
 *
 * Author ID resolution (no API calls):
 * 1. Extract from noreply email pattern: {id}+{username}@users.noreply.github.com
 * 2. Use sender.id if sender.login matches commit author username
 * 3. Otherwise null - backfill will populate later
 *
 * Line stats (additions/deletions) are not available in webhook payload,
 * they will be populated by the backfill process.
 */
export async function processWebhookPush(payload: GitHubPushEvent): Promise<SyncResult> {
  const result: SyncResult = {
    success: true,
    commitsProcessed: 0,
    aiAttributedCommits: 0,
    errors: [],
  };

  const repoFullName = payload.repository.full_name;
  const defaultBranch = payload.repository.default_branch;
  const pushedBranch = payload.ref.replace('refs/heads/', '');

  // Only process commits pushed to the default branch
  if (pushedBranch !== defaultBranch) {
    return result;
  }

  try {
    const repoId = await getOrCreateRepository('github', repoFullName);

    for (const commit of payload.commits) {
      try {
        // Try to extract author ID without API calls:
        // 1. From noreply email pattern: {id}+{username}@users.noreply.github.com
        // 2. From sender if sender.login matches commit author username
        let authorId = extractGitHubUserIdFromEmail(commit.author.email);

        if (!authorId && payload.sender && commit.author.username) {
          if (payload.sender.login === commit.author.username) {
            authorId = payload.sender.id.toString();
          }
        }

        const attributions = detectAllAiAttributions(
          commit.message,
          commit.author.name,
          commit.author.email
        );

        // Use first attribution for backward-compatible ai_tool/ai_model fields
        const primaryAttribution = attributions[0] || null;

        // Line stats will be populated by backfill - webhook doesn't include them
        await insertCommit({
          repoId,
          commitId: commit.id,
          authorEmail: commit.author.email || null,
          authorId,
          committedAt: new Date(commit.timestamp),
          message: commit.message,
          aiTool: primaryAttribution?.tool || null,
          aiModel: primaryAttribution?.model || null,
          additions: null,
          deletions: null,
          attributions,
        });

        result.commitsProcessed++;
        if (attributions.length > 0) {
          result.aiAttributedCommits++;
        }
      } catch (err) {
        result.errors.push(`Commit ${commit.id}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }
  } catch (err) {
    result.success = false;
    result.errors.push(`Repository error: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }

  return result;
}

// ============================================
// API-Based Sync
// ============================================

/**
 * Fetch the default branch for a repository from GitHub API.
 */
async function fetchDefaultBranch(
  repoFullName: string,
  token: string
): Promise<{ branch: string } | { error: string }> {
  const response = await githubFetch(
    `https://api.github.com/repos/${repoFullName}`,
    token
  );

  if (!response.ok) {
    if (response.status === 404) {
      return { error: `Repository not found (may have been deleted or moved)` };
    }
    if (response.status === 403 || response.status === 429) {
      const rateLimitRemaining = response.headers.get('x-ratelimit-remaining');
      if (rateLimitRemaining === '0') {
        const rateLimitReset = response.headers.get('x-ratelimit-reset');
        const resetTime = rateLimitReset
          ? new Date(parseInt(rateLimitReset) * 1000).toISOString()
          : 'unknown';
        return { error: `Rate limited until ${resetTime}` };
      }
      return { error: `Access denied (check GitHub App permissions)` };
    }
    return { error: `API error: ${response.status} ${response.statusText}` };
  }

  const data = await response.json();
  if (!data.default_branch) {
    return { error: `Repository has no default branch` };
  }
  return { branch: data.default_branch };
}

/**
 * Fetch individual commit details including stats (additions/deletions) and merge status.
 * The list commits endpoint doesn't include stats, so we need to fetch each commit.
 */
async function fetchCommitDetails(
  repoFullName: string,
  sha: string,
  token: string
): Promise<{ additions: number; deletions: number; isMerge: boolean } | null> {
  const response = await githubFetch(
    `https://api.github.com/repos/${repoFullName}/commits/${sha}`,
    token
  );

  if (!response.ok) {
    // Don't fail the whole sync for individual commit fetch failures
    return null;
  }

  const data = await response.json();
  return {
    additions: data.stats?.additions || 0,
    deletions: data.stats?.deletions || 0,
    isMerge: (data.parents?.length || 0) > 1,
  };
}

/**
 * Sync commits for a single repository from the GitHub API.
 */
export async function syncGitHubRepo(
  repoFullName: string,
  since: string,
  until?: string,
  options: { onProgress?: (msg: string) => void } = {}
): Promise<SyncResult> {
  const log = options.onProgress || (() => {});

  const result: SyncResult = {
    success: true,
    commitsProcessed: 0,
    aiAttributedCommits: 0,
    errors: [],
    syncedRange: { startDate: since, endDate: until || new Date().toISOString().split('T')[0] },
  };

  let token: string;
  try {
    token = await getGitHubToken();
  } catch (err) {
    result.success = false;
    result.errors.push(err instanceof Error ? err.message : 'Failed to get GitHub token');
    return result;
  }

  try {
    const repoId = await getOrCreateRepository('github', repoFullName);

    // Get the default branch to filter commits
    const branchResult = await fetchDefaultBranch(repoFullName, token);
    if ('error' in branchResult) {
      result.errors.push(`${repoFullName}: ${branchResult.error}`);
      return result;
    }
    const defaultBranch = branchResult.branch;

    let page = 1;
    const perPage = 100;
    let hasMore = true;

    while (hasMore) {
      const params = new URLSearchParams({
        sha: defaultBranch,  // Only fetch commits from the default branch
        since,
        per_page: perPage.toString(),
        page: page.toString(),
      });
      if (until) {
        params.set('until', until);
      }

      const response = await githubFetch(
        `https://api.github.com/repos/${repoFullName}/commits?${params}`,
        token
      );

      // Handle rate limiting
      if (response.status === 403 || response.status === 429) {
        const rateLimitReset = response.headers.get('x-ratelimit-reset');
        const retryAfter = rateLimitReset
          ? new Date(parseInt(rateLimitReset) * 1000).toISOString()
          : 'unknown';
        result.success = false;
        result.errors.push(`Rate limited until ${retryAfter}`);
        return result;
      }

      if (!response.ok) {
        result.success = false;
        result.errors.push(`API error: ${response.status} ${response.statusText}`);
        return result;
      }

      const fetchedCommits: GitHubCommitResponse[] = await response.json();

      if (fetchedCommits.length === 0) {
        hasMore = false;
        continue;
      }

      for (const commit of fetchedCommits) {
        try {
          // Skip merge commits (2+ parents) - they don't represent actual code changes
          if (commit.parents && commit.parents.length > 1) {
            continue;
          }

          // Check if commit already exists in DB with line stats populated
          const existing = await db
            .select({
              id: commits.id,
              additions: commits.additions,
              deletions: commits.deletions,
            })
            .from(commits)
            .where(and(eq(commits.repoId, repoId), eq(commits.commitId, commit.sha)));

          // If commit exists and has line stats (not null), skip it entirely
          if (existing.length > 0 && existing[0].additions !== null) {
            continue;
          }

          const attributions = detectAllAiAttributions(
            commit.commit.message,
            commit.commit.author.name,
            commit.commit.author.email
          );

          // Use first attribution for backward-compatible ai_tool/ai_model fields
          const primaryAttribution = attributions[0] || null;

          // Fetch individual commit to get accurate line stats
          const commitDetails = await fetchCommitDetails(repoFullName, commit.sha, token);
          const additions = commitDetails?.additions ?? null;
          const deletions = commitDetails?.deletions ?? null;

          // Rate limit: small delay between individual commit fetches
          await new Promise(resolve => setTimeout(resolve, 50));

          await insertCommit({
            repoId,
            commitId: commit.sha,
            authorEmail: commit.commit.author.email || null,
            authorId: commit.author?.id?.toString() || null,
            committedAt: new Date(commit.commit.author.date),
            message: commit.commit.message,
            aiTool: primaryAttribution?.tool || null,
            aiModel: primaryAttribution?.model || null,
            additions,
            deletions,
            attributions,
          });

          result.commitsProcessed++;
          if (attributions.length > 0) {
            result.aiAttributedCommits++;
          }
        } catch (err) {
          result.errors.push(`Commit ${commit.sha}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      }

      log(`  ${repoFullName}: Page ${page}, ${fetchedCommits.length} commits (${result.aiAttributedCommits} AI Attributed)`);

      if (fetchedCommits.length < perPage) {
        hasMore = false;
      } else {
        page++;
        // Small delay to be nice to the API
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  } catch (err) {
    result.success = false;
    result.errors.push(err instanceof Error ? err.message : 'Unknown error');
  }

  return result;
}

/**
 * Get list of repositories in an organization.
 */
async function getOrgRepos(org: string): Promise<string[]> {
  const token = await getGitHubToken();
  const repos: string[] = [];
  let page = 1;

  while (true) {
    const response = await githubFetch(
      `https://api.github.com/orgs/${org}/repos?per_page=100&page=${page}`,
      token
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch repos: ${response.status}`);
    }

    const data: Array<{ full_name: string; archived: boolean }> = await response.json();
    if (data.length === 0) break;

    // Skip archived repos
    repos.push(...data.filter(r => !r.archived).map(r => r.full_name));
    page++;

    // Small delay
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return repos;
}

// ============================================
// Backfill
// ============================================

/**
 * Backfill commits for all repos in an organization.
 */
export async function backfillGitHubUsage(
  targetDate: string,
  options: {
    onProgress?: (msg: string) => void;
    org?: string;
    repos?: string[];
  } = {}
): Promise<SyncResult & { rateLimited: boolean }> {
  const log = options.onProgress || (() => {});
  const org = options.org || 'getsentry';

  // Check backfill state
  const { oldestDate: existingOldest, isComplete } = await getGitHubBackfillState();

  if (isComplete) {
    log('Backfill already marked complete, skipping.');
    return {
      success: true,
      commitsProcessed: 0,
      aiAttributedCommits: 0,
      errors: [],
      rateLimited: false,
    };
  }

  if (existingOldest && existingOldest <= targetDate) {
    log(`Already have data back to ${existingOldest}, target is ${targetDate}. Done.`);
    return {
      success: true,
      commitsProcessed: 0,
      aiAttributedCommits: 0,
      errors: [],
      rateLimited: false,
    };
  }

  // Get list of repos
  let repos: string[];
  try {
    repos = options.repos || await getOrgRepos(org);
    log(`Found ${repos.length} repos in ${org}`);
  } catch (err) {
    return {
      success: false,
      commitsProcessed: 0,
      aiAttributedCommits: 0,
      errors: [err instanceof Error ? err.message : 'Failed to get repos'],
      rateLimited: false,
    };
  }

  const aggregateResult: SyncResult & { rateLimited: boolean } = {
    success: true,
    commitsProcessed: 0,
    aiAttributedCommits: 0,
    errors: [],
    rateLimited: false,
    syncedRange: { startDate: targetDate, endDate: existingOldest || new Date().toISOString().split('T')[0] },
  };

  for (const repo of repos) {
    log(`Syncing ${repo}...`);

    const repoResult = await syncGitHubRepo(repo, targetDate, existingOldest || undefined, { onProgress: log });

    aggregateResult.commitsProcessed += repoResult.commitsProcessed;
    aggregateResult.aiAttributedCommits += repoResult.aiAttributedCommits;
    aggregateResult.errors.push(...repoResult.errors);

    if (!repoResult.success) {
      if (repoResult.errors.some(e => e.includes('Rate limited'))) {
        aggregateResult.rateLimited = true;
        log('Rate limited! Stopping backfill.');
        break;
      }
      // Continue with other repos on non-rate-limit errors
    }
  }

  // Mark complete if we processed all repos without rate limiting
  if (!aggregateResult.rateLimited && aggregateResult.success) {
    await markGitHubBackfillComplete();
    log('Backfill complete!');
  }

  return aggregateResult;
}

/**
 * Cron sync - syncs recent commits across all repos.
 * For real-time updates, use webhooks instead.
 */
export async function syncGitHubCron(
  options: { org?: string } = {}
): Promise<SyncResult> {
  const org = options.org || 'getsentry';

  // Sync last 24 hours to catch any missed webhooks
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const today = new Date().toISOString().split('T')[0];

  const result: SyncResult = {
    success: true,
    commitsProcessed: 0,
    aiAttributedCommits: 0,
    errors: [],
    syncedRange: { startDate: since.split('T')[0], endDate: today },
  };

  let repos: string[];
  try {
    repos = await getOrgRepos(org);
  } catch (err) {
    result.success = false;
    result.errors.push(err instanceof Error ? err.message : 'Failed to get repos');
    return result;
  }

  for (const repo of repos) {
    const repoResult = await syncGitHubRepo(repo, since);

    result.commitsProcessed += repoResult.commitsProcessed;
    result.aiAttributedCommits += repoResult.aiAttributedCommits;
    result.errors.push(...repoResult.errors);

    if (!repoResult.success) {
      if (repoResult.errors.some(e => e.includes('Rate limited'))) {
        result.success = false;
        break;
      }
    }
  }

  if (result.success) {
    await updateGitHubSyncState(today);
  }

  return result;
}

// ============================================
// Merge Commit Cleanup
// ============================================

export interface CleanupResult {
  checked: number;
  deleted: number;
  errors: string[];
}

/**
 * Remove existing merge commits from the database.
 * Since we don't store parent count, we must query GitHub API to identify them.
 */
export async function cleanupMergeCommits(
  options: { dryRun?: boolean; onProgress?: (msg: string) => void } = {}
): Promise<CleanupResult> {
  const log = options.onProgress || console.log;
  const result: CleanupResult = { checked: 0, deleted: 0, errors: [] };

  let token: string;
  try {
    token = await getGitHubToken();
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : 'Failed to get GitHub token');
    return result;
  }

  // Get all commits grouped by repo
  const allCommits = await db.execute<{
    id: number;
    commit_id: string;
    full_name: string;
  }>(sql`
    SELECT c.id, c.commit_id, r.full_name
    FROM ${commits} c
    JOIN ${repositories} r ON r.id = c.repo_id
    ORDER BY r.full_name, c.committed_at
  `);

  log(`Checking ${allCommits.rows.length} commits for merge status...`);

  let lastRepo = '';
  for (const commit of allCommits.rows) {
    result.checked++;

    // Log progress every repo change
    if (commit.full_name !== lastRepo) {
      log(`  Checking ${commit.full_name}...`);
      lastRepo = commit.full_name;
    }

    try {
      // Fetch commit details to check parent count
      const details = await fetchCommitDetails(commit.full_name, commit.commit_id, token);

      if (details?.isMerge) {
        log(`  Found merge commit: ${commit.commit_id.slice(0, 7)} in ${commit.full_name}`);

        if (!options.dryRun) {
          // Delete commit (CASCADE will handle commit_attributions)
          await db.delete(commits).where(eq(commits.id, commit.id));
          result.deleted++;
        } else {
          result.deleted++; // Count as "would be deleted"
        }
      }

      // Rate limit
      await new Promise(resolve => setTimeout(resolve, 50));
    } catch (err) {
      result.errors.push(`${commit.commit_id}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }

    // Progress update every 100 commits
    if (result.checked % 100 === 0) {
      log(`  Progress: ${result.checked}/${allCommits.rows.length} checked, ${result.deleted} merge commits ${options.dryRun ? 'found' : 'deleted'}`);
    }
  }

  log(`\nCleanup complete: ${result.checked} checked, ${result.deleted} merge commits ${options.dryRun ? 'would be deleted' : 'deleted'}`);
  return result;
}
