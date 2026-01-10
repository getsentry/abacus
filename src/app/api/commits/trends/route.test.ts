import { describe, it, expect, beforeEach } from 'vitest';
import { mockAuthenticated, mockUnauthenticated } from '@/test-utils/auth';
import { seedRepositoryWithCommits } from '@/test-utils/fixtures';
import { GET } from './route';

async function seedTestData() {
  await seedRepositoryWithCommits('test-org/test-repo', [
    // AI-assisted commits
    {
      authorEmail: 'dev1@example.com',
      committedAt: '2025-01-15T10:00:00Z',
      aiTool: 'claude_code',
      aiModel: 'claude-sonnet-4',
      additions: 100,
      deletions: 20,
    },
    {
      authorEmail: 'dev1@example.com',
      committedAt: '2025-01-15T14:00:00Z',
      aiTool: 'cursor',
      additions: 50,
      deletions: 10,
    },
    {
      authorEmail: 'dev2@example.com',
      committedAt: '2025-01-16T09:00:00Z',
      aiTool: 'claude_code',
      additions: 200,
      deletions: 50,
    },
    // Human commits (no AI tool)
    {
      authorEmail: 'dev2@example.com',
      committedAt: '2025-01-16T11:00:00Z',
      aiTool: null,
      additions: 30,
      deletions: 5,
    },
  ]);
}

describe('GET /api/commits/trends', () => {
  beforeEach(async () => {
    await seedTestData();
  });

  it('returns 401 for unauthenticated requests', async () => {
    await mockUnauthenticated();

    const response = await GET(new Request('http://localhost/api/commits/trends'));

    expect(response.status).toBe(401);
  });

  it('returns 400 when dates are missing', async () => {
    await mockAuthenticated();

    const response = await GET(new Request('http://localhost/api/commits/trends'));

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('required');
  });

  it('returns 400 for invalid date format', async () => {
    await mockAuthenticated();

    const response = await GET(
      new Request('http://localhost/api/commits/trends?startDate=bad&endDate=2025-01-31')
    );

    expect(response.status).toBe(400);
  });

  it('returns commit trends with correct counts', async () => {
    await mockAuthenticated();

    const response = await GET(
      new Request('http://localhost/api/commits/trends?startDate=2025-01-01&endDate=2025-01-31')
    );

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.daily).toBeDefined();
    expect(data.overall).toBeDefined();
    expect(data.overall.totalCommits).toBe(4);
    expect(data.overall.aiAssistedCommits).toBe(3);
    // humanCommits = totalCommits - aiAssistedCommits (not a separate field)
  });

  it('returns daily breakdown', async () => {
    await mockAuthenticated();

    const response = await GET(
      new Request('http://localhost/api/commits/trends?startDate=2025-01-15&endDate=2025-01-16')
    );

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.daily.length).toBeGreaterThan(0);
    // Check that we have data for both days
    const jan15 = data.daily.find((d: { date: string }) => d.date === '2025-01-15');
    const jan16 = data.daily.find((d: { date: string }) => d.date === '2025-01-16');
    expect(jan15).toBeDefined();
    expect(jan16).toBeDefined();
  });

  it('supports comparison mode', async () => {
    await mockAuthenticated();

    const response = await GET(
      new Request('http://localhost/api/commits/trends?startDate=2025-01-15&endDate=2025-01-16&comparison=true')
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.overall.previousPeriod).toBeDefined();
  });
});
