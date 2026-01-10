import { db, repositories, commits } from '@/lib/db';

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
  const result = await db
    .insert(repositories)
    .values({ source, fullName: repo.fullName })
    .onConflictDoUpdate({
      target: [repositories.source, repositories.fullName],
      set: { fullName: repo.fullName },
    })
    .returning({ id: repositories.id });
  return result[0].id;
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

  const result = await db
    .insert(commits)
    .values({
      repoId: commit.repoId,
      commitId,
      authorEmail: commit.authorEmail,
      authorId,
      committedAt: new Date(commit.committedAt),
      message,
      aiTool,
      aiModel,
      additions,
      deletions,
    })
    .onConflictDoUpdate({
      target: [commits.repoId, commits.commitId],
      set: {
        authorEmail: commit.authorEmail,
        message,
        aiTool,
        aiModel,
        additions,
        deletions,
      },
    })
    .returning({ id: commits.id });
  return result[0].id;
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
