import { describe, it, expect } from 'vitest';
import { mockAuthenticated, mockUnauthenticated } from '@/test-utils/auth';
import { GET } from './route';

describe('GET /api/repositories/[...slug]', () => {
  it('returns 401 for unauthenticated requests', async () => {
    await mockUnauthenticated();

    const response = await GET(
      new Request('http://localhost/api/repositories/github/owner/repo'),
      { params: Promise.resolve({ slug: ['github', 'owner', 'repo'] }) }
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
    const data = await response.json();
    expect(data.error).toContain('Invalid repository path');
  });

  it('returns 400 for invalid startDate', async () => {
    await mockAuthenticated();

    const response = await GET(
      new Request('http://localhost/api/repositories/github/owner/repo?startDate=bad'),
      { params: Promise.resolve({ slug: ['github', 'owner', 'repo'] }) }
    );

    expect(response.status).toBe(400);
  });

  it('returns 404 for non-existent repository', async () => {
    await mockAuthenticated();

    const response = await GET(
      new Request('http://localhost/api/repositories/github/nonexistent/repo'),
      { params: Promise.resolve({ slug: ['github', 'nonexistent', 'repo'] }) }
    );

    expect(response.status).toBe(404);
  });
});
