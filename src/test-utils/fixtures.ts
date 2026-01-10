import { sql } from '@vercel/postgres';

/**
 * Test fixture helpers for seeding database with test data.
 * These complement the query helpers in @/lib/queries.
 */

// =============================================================================
// Repository Fixtures
// =============================================================================

export interface TestRepository {
  source?: string;
  fullName: string;
}

/**
 * Insert a repository and return its ID.
 */
export async function insertRepository(repo: TestRepository): Promise<number> {
  const source = repo.source || 'github';
  const result = await sql`
    INSERT INTO repositories (source, full_name)
    VALUES (${source}, ${repo.fullName})
    ON CONFLICT (source, full_name) DO UPDATE SET full_name = EXCLUDED.full_name
    RETURNING id
  `;
  return result.rows[0].id;
}

// =============================================================================
// Commit Fixtures
// =============================================================================

export interface TestCommit {
  repoId: number;
  commitId?: string;
  authorEmail: string;
  authorId?: string;
  committedAt: string; // ISO date string
  message?: string;
  aiTool?: string | null;
  aiModel?: string | null;
  additions?: number;
  deletions?: number;
}

let commitCounter = 0;

/**
 * Insert a commit and return its ID.
 */
export async function insertCommit(commit: TestCommit): Promise<number> {
  const commitId = commit.commitId || `test-commit-${++commitCounter}`;
  const authorId = commit.authorId || null;
  const message = commit.message || 'Test commit';
  const aiTool = commit.aiTool ?? null;
  const aiModel = commit.aiModel ?? null;
  const additions = commit.additions ?? 10;
  const deletions = commit.deletions ?? 5;

  const result = await sql`
    INSERT INTO commits (
      repo_id, commit_id, author_email, author_id, committed_at,
      message, ai_tool, ai_model, additions, deletions
    )
    VALUES (
      ${commit.repoId}, ${commitId}, ${commit.authorEmail}, ${authorId},
      ${commit.committedAt}::timestamp, ${message}, ${aiTool}, ${aiModel},
      ${additions}, ${deletions}
    )
    ON CONFLICT (repo_id, commit_id) DO UPDATE SET
      author_email = EXCLUDED.author_email,
      message = EXCLUDED.message,
      ai_tool = EXCLUDED.ai_tool,
      ai_model = EXCLUDED.ai_model,
      additions = EXCLUDED.additions,
      deletions = EXCLUDED.deletions
    RETURNING id
  `;
  return result.rows[0].id;
}

// =============================================================================
// Convenience Helpers
// =============================================================================

/**
 * Create a repository and multiple commits in one call.
 * Returns the repository ID.
 */
export async function seedRepositoryWithCommits(
  repoFullName: string,
  commits: Array<Omit<TestCommit, 'repoId'>>
): Promise<number> {
  const repoId = await insertRepository({ fullName: repoFullName });
  for (const commit of commits) {
    await insertCommit({ ...commit, repoId });
  }
  return repoId;
}
