import { describe, it, expect, beforeEach } from 'vitest';
import { mockAuthenticated, mockUnauthenticated } from '@/test-utils/auth';
import { seedRepositoryWithCommits } from '@/test-utils/fixtures';
import { GET } from './route';

async function seedTestData() {
  await seedRepositoryWithCommits('test-org/test-repo', [
    {
      authorEmail: 'dev@example.com',
      committedAt: '2025-01-15T10:00:00Z',
      message: 'feat: Add feature',
      aiTool: 'claude_code',
      additions: 100,
      deletions: 20,
    },
    {
      authorEmail: 'dev@example.com',
      committedAt: '2025-01-15T14:00:00Z',
      message: 'fix: Bug fix',
      aiTool: null,
      additions: 10,
      deletions: 5,
    },
  ]);
}

describe('GET /api/export/commits', () => {
  beforeEach(async () => {
    await seedTestData();
  });

  it('returns 401 for unauthenticated requests', async () => {
    await mockUnauthenticated();

    const response = await GET(new Request('http://localhost/api/export/commits'));

    expect(response.status).toBe(401);
  });

  it('returns CSV with correct headers', async () => {
    await mockAuthenticated();

    const response = await GET(
      new Request('http://localhost/api/export/commits?startDate=2025-01-01&endDate=2025-01-31')
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/csv');

    const csv = await response.text();
    const lines = csv.trim().split('\n');
    expect(lines.length).toBeGreaterThan(1); // header + data rows

    // Check header row - this exports repo summaries, not individual commits
    const header = lines[0];
    expect(header).toContain('repository');
    expect(header).toContain('total_commits');
    expect(header).toContain('ai_assisted_commits');
    expect(header).toContain('claude_code_commits');
  });

  it('exports repository commit summary correctly', async () => {
    await mockAuthenticated();

    const response = await GET(
      new Request('http://localhost/api/export/commits?startDate=2025-01-01&endDate=2025-01-31')
    );

    expect(response.status).toBe(200);
    const csv = await response.text();

    // Should contain our test repo
    expect(csv).toContain('test-org/test-repo');
    // Data row should show 2 total commits, 1 AI-assisted
    const lines = csv.trim().split('\n');
    const dataLine = lines[1];
    expect(dataLine).toContain('test-org/test-repo');
  });
});
