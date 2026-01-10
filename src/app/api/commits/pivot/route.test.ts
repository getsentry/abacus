import { describe, it, expect, beforeEach } from 'vitest';
import { mockAuthenticated, mockUnauthenticated } from '@/test-utils/auth';
import { seedRepositoryWithCommits } from '@/test-utils/fixtures';
import { GET } from './route';

async function seedTestData() {
  // Repo 1: heavy AI usage
  await seedRepositoryWithCommits('org/repo-with-ai', [
    {
      authorEmail: 'dev1@example.com',
      committedAt: '2025-01-15T10:00:00Z',
      aiTool: 'claude_code',
      additions: 100,
      deletions: 20,
    },
    {
      authorEmail: 'dev1@example.com',
      committedAt: '2025-01-15T14:00:00Z',
      aiTool: 'claude_code',
      additions: 50,
      deletions: 10,
    },
  ]);

  // Repo 2: mixed usage
  await seedRepositoryWithCommits('org/repo-mixed', [
    {
      authorEmail: 'dev2@example.com',
      committedAt: '2025-01-15T09:00:00Z',
      aiTool: 'cursor',
      additions: 80,
      deletions: 15,
    },
    {
      authorEmail: 'dev2@example.com',
      committedAt: '2025-01-15T16:00:00Z',
      aiTool: null, // human commit
      additions: 30,
      deletions: 5,
    },
  ]);
}

describe('GET /api/commits/pivot', () => {
  beforeEach(async () => {
    await seedTestData();
  });

  it('returns 401 for unauthenticated requests', async () => {
    await mockUnauthenticated();

    const response = await GET(new Request('http://localhost/api/commits/pivot'));

    expect(response.status).toBe(401);
  });

  it('returns repository breakdown without dates (uses all time)', async () => {
    await mockAuthenticated();

    const response = await GET(new Request('http://localhost/api/commits/pivot'));

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.repositories).toBeDefined();
    expect(data.repositories.length).toBe(2);
    expect(data.totalCount).toBe(2);
  });

  it('returns correct stats per repository', async () => {
    await mockAuthenticated();

    const response = await GET(
      new Request('http://localhost/api/commits/pivot?startDate=2025-01-01&endDate=2025-01-31')
    );

    expect(response.status).toBe(200);
    const data = await response.json();

    // Find repo with all AI commits
    const aiRepo = data.repositories.find((r: { fullName: string }) => r.fullName === 'org/repo-with-ai');
    expect(aiRepo).toBeDefined();
    expect(aiRepo.totalCommits).toBe(2);
    expect(aiRepo.aiAssistedCommits).toBe(2);

    // Find mixed repo
    const mixedRepo = data.repositories.find((r: { fullName: string }) => r.fullName === 'org/repo-mixed');
    expect(mixedRepo).toBeDefined();
    expect(mixedRepo.totalCommits).toBe(2);
    expect(mixedRepo.aiAssistedCommits).toBe(1);
  });

  it('supports search filter', async () => {
    await mockAuthenticated();

    const response = await GET(
      new Request('http://localhost/api/commits/pivot?search=repo-with-ai')
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.repositories.length).toBe(1);
    expect(data.repositories[0].fullName).toBe('org/repo-with-ai');
  });
});
