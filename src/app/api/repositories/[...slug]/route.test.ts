import { describe, it, expect, beforeEach } from 'vitest';
import { mockAuthenticated, mockUnauthenticated } from '@/test-utils/auth';
import { seedRepositoryWithCommits } from '@/test-utils/fixtures';
import { GET } from './route';

async function seedTestData() {
  await seedRepositoryWithCommits('test-org/test-repo', [
    {
      authorEmail: 'dev1@example.com',
      committedAt: '2025-01-15T10:00:00Z',
      message: 'feat: Add new feature\n\nCo-Authored-By: Claude <noreply@anthropic.com>',
      aiTool: 'claude_code',
      additions: 100,
      deletions: 20,
    },
    {
      authorEmail: 'dev2@example.com',
      committedAt: '2025-01-15T14:00:00Z',
      message: 'fix: Bug fix',
      aiTool: null,
      additions: 10,
      deletions: 5,
    },
  ]);
}

describe('GET /api/repositories/[...slug]', () => {
  beforeEach(async () => {
    await seedTestData();
  });

  it('returns 401 for unauthenticated requests', async () => {
    await mockUnauthenticated();

    const response = await GET(
      new Request('http://localhost/api/repositories/github/test-org/test-repo'),
      { params: Promise.resolve({ slug: ['github', 'test-org', 'test-repo'] }) }
    );

    expect(response.status).toBe(401);
  });

  it('returns 400 for invalid slug', async () => {
    await mockAuthenticated();

    const response = await GET(
      new Request('http://localhost/api/repositories/github'),
      { params: Promise.resolve({ slug: ['github'] }) }
    );

    expect(response.status).toBe(400);
  });

  it('returns 404 for non-existent repository', async () => {
    await mockAuthenticated();

    const response = await GET(
      new Request('http://localhost/api/repositories/github/non-existent/repo?startDate=2025-01-01&endDate=2025-01-31'),
      { params: Promise.resolve({ slug: ['github', 'non-existent', 'repo'] }) }
    );

    expect(response.status).toBe(404);
  });

  it('returns repository details and commits', async () => {
    await mockAuthenticated();

    const response = await GET(
      new Request('http://localhost/api/repositories/github/test-org/test-repo?startDate=2025-01-01&endDate=2025-01-31'),
      { params: Promise.resolve({ slug: ['github', 'test-org', 'test-repo'] }) }
    );

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.details).toBeDefined();
    expect(data.details.fullName).toBe('test-org/test-repo');
    expect(data.details.totalCommits).toBe(2);
    expect(data.details.aiAssistedCommits).toBe(1);
    expect(data.commits.length).toBe(2);
    expect(data.totalCommits).toBe(2);
  });

  it('supports aiFilter parameter', async () => {
    await mockAuthenticated();

    const response = await GET(
      new Request('http://localhost/api/repositories/github/test-org/test-repo?startDate=2025-01-01&endDate=2025-01-31&aiFilter=ai'),
      { params: Promise.resolve({ slug: ['github', 'test-org', 'test-repo'] }) }
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.commits.length).toBe(1);
    expect(data.commits[0].aiTool).toBe('claude_code');
  });
});
