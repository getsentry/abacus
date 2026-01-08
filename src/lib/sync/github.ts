import { sql } from '@vercel/postgres';

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
    login: string;
  } | null;
  stats?: {
    additions: number;
    deletions: number;
  };
}

interface AiAttribution {
  tool: string;
  model?: string;
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
// AI Attribution Detection
// ============================================

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
  {
    pattern: /Co-Authored-By:\s*Claude\s*([\w\s.-]*)\s*<[^>]*@anthropic\.com>/i,
    tool: 'claude_code',
    modelExtractor: (match) => {
      const modelPart = match[1]?.trim();
      if (modelPart) {
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

  // ===========================================
  // OpenAI Codex
  // ===========================================
  // Co-authored-by: Codex <*>
  {
    pattern: /Co-Authored-By:\s*Codex\b[^<]*<[^>]*>/i,
    tool: 'codex',
  },

  // ===========================================
  // GitHub Copilot
  // ===========================================
  // Co-Authored-By: GitHub Copilot <*>
  {
    pattern: /Co-Authored-By:\s*GitHub\s*Copilot\s*<[^>]*>/i,
    tool: 'github_copilot',
  },
  // Co-Authored-By: Copilot <*>
  {
    pattern: /Co-Authored-By:\s*Copilot\s*<[^>]*>/i,
    tool: 'github_copilot',
  },

  // ===========================================
  // Cursor
  // ===========================================
  {
    pattern: /Co-Authored-By:\s*Cursor\s*<[^>]*>/i,
    tool: 'cursor',
  },

  // ===========================================
  // Windsurf (Codeium)
  // ===========================================
  {
    pattern: /Co-Authored-By:\s*Windsurf\s*<[^>]*>/i,
    tool: 'windsurf',
  },
  {
    pattern: /Co-Authored-By:\s*Codeium\s*<[^>]*>/i,
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
async function getGitHubToken(): Promise<string> {
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
  const existing = await sql`
    SELECT id FROM repositories WHERE source = ${source} AND full_name = ${fullName}
  `;

  if (existing.rows.length > 0) {
    return existing.rows[0].id;
  }

  // Create new
  const result = await sql`
    INSERT INTO repositories (source, full_name)
    VALUES (${source}, ${fullName})
    ON CONFLICT (source, full_name) DO UPDATE SET source = ${source}
    RETURNING id
  `;

  return result.rows[0].id;
}

// ============================================
// Commit Insertion
// ============================================

interface CommitInsert {
  repoId: number;
  commitId: string;
  authorEmail: string | null;
  committedAt: Date;
  aiTool: string | null;
  aiModel: string | null;
  additions: number;
  deletions: number;
}

async function insertCommit(commit: CommitInsert): Promise<void> {
  await sql`
    INSERT INTO commits (
      repo_id, commit_id, author_email, committed_at,
      ai_tool, ai_model, additions, deletions
    )
    VALUES (
      ${commit.repoId}, ${commit.commitId}, ${commit.authorEmail},
      ${commit.committedAt.toISOString()}, ${commit.aiTool},
      ${commit.aiModel}, ${commit.additions}, ${commit.deletions}
    )
    ON CONFLICT (repo_id, commit_id) DO UPDATE SET
      author_email = EXCLUDED.author_email,
      ai_tool = EXCLUDED.ai_tool,
      ai_model = EXCLUDED.ai_model,
      additions = EXCLUDED.additions,
      deletions = EXCLUDED.deletions
  `;
}

// ============================================
// Sync State Management
// ============================================

export async function getGitHubSyncState(): Promise<{ lastSyncedDate: string | null }> {
  const result = await sql`
    SELECT last_synced_hour_end FROM sync_state WHERE id = ${SYNC_STATE_ID}
  `;
  if (result.rows.length === 0 || !result.rows[0].last_synced_hour_end) {
    return { lastSyncedDate: null };
  }
  return { lastSyncedDate: result.rows[0].last_synced_hour_end };
}

async function updateGitHubSyncState(lastSyncedDate: string): Promise<void> {
  await sql`
    INSERT INTO sync_state (id, last_sync_at, last_synced_hour_end)
    VALUES (${SYNC_STATE_ID}, NOW(), ${lastSyncedDate})
    ON CONFLICT (id) DO UPDATE SET
      last_sync_at = NOW(),
      last_synced_hour_end = ${lastSyncedDate}
  `;
}

export async function getGitHubBackfillState(): Promise<{ oldestDate: string | null; isComplete: boolean }> {
  // Get oldest commit date from database
  const usageResult = await sql`
    SELECT MIN(committed_at::date)::text as oldest_date FROM commits
  `;
  const oldestDate = usageResult.rows[0]?.oldest_date || null;

  // Check if backfill is marked complete
  const stateResult = await sql`
    SELECT backfill_complete FROM sync_state WHERE id = ${SYNC_STATE_ID}
  `;
  const isComplete = stateResult.rows[0]?.backfill_complete === true;

  return { oldestDate, isComplete };
}

async function markGitHubBackfillComplete(): Promise<void> {
  await sql`
    INSERT INTO sync_state (id, last_sync_at, backfill_complete)
    VALUES (${SYNC_STATE_ID}, NOW(), true)
    ON CONFLICT (id) DO UPDATE SET
      last_sync_at = NOW(),
      backfill_complete = true
  `;
}

export async function resetGitHubBackfillComplete(): Promise<void> {
  await sql`
    UPDATE sync_state SET backfill_complete = false WHERE id = ${SYNC_STATE_ID}
  `;
}

// ============================================
// Webhook Processing
// ============================================

/**
 * Process a GitHub push webhook event.
 * Extracts commits and stores them with AI attribution detection.
 */
export async function processWebhookPush(payload: GitHubPushEvent): Promise<SyncResult> {
  const result: SyncResult = {
    success: true,
    commitsProcessed: 0,
    aiAttributedCommits: 0,
    errors: [],
  };

  const repoFullName = payload.repository.full_name;

  try {
    const repoId = await getOrCreateRepository('github', repoFullName);

    for (const commit of payload.commits) {
      try {
        const aiAttribution = detectAiAttribution(
          commit.message,
          commit.author.name,
          commit.author.email
        );

        // Webhook doesn't include stats, estimate from file changes
        const additions = commit.added.length + commit.modified.length;
        const deletions = commit.removed.length;

        await insertCommit({
          repoId,
          commitId: commit.id,
          authorEmail: commit.author.email || null,
          committedAt: new Date(commit.timestamp),
          aiTool: aiAttribution?.tool || null,
          aiModel: aiAttribution?.model || null,
          additions,
          deletions,
        });

        result.commitsProcessed++;
        if (aiAttribution) {
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

    let page = 1;
    const perPage = 100;
    let hasMore = true;

    while (hasMore) {
      const params = new URLSearchParams({
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

      const commits: GitHubCommitResponse[] = await response.json();

      if (commits.length === 0) {
        hasMore = false;
        continue;
      }

      for (const commit of commits) {
        try {
          const aiAttribution = detectAiAttribution(
            commit.commit.message,
            commit.commit.author.name,
            commit.commit.author.email
          );

          await insertCommit({
            repoId,
            commitId: commit.sha,
            authorEmail: commit.commit.author.email || null,
            committedAt: new Date(commit.commit.author.date),
            aiTool: aiAttribution?.tool || null,
            aiModel: aiAttribution?.model || null,
            additions: commit.stats?.additions || 0,
            deletions: commit.stats?.deletions || 0,
          });

          result.commitsProcessed++;
          if (aiAttribution) {
            result.aiAttributedCommits++;
          }
        } catch (err) {
          result.errors.push(`Commit ${commit.sha}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      }

      log(`  ${repoFullName}: Page ${page}, ${commits.length} commits (${result.aiAttributedCommits} AI-attributed)`);

      if (commits.length < perPage) {
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
