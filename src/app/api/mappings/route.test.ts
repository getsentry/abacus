import { describe, it, expect, beforeEach } from 'vitest';
import { insertUsageRecord } from '@/lib/queries';
import { mockAuthenticated, mockUnauthenticated } from '@/test-utils/auth';
import { GET, POST, DELETE } from './route';

async function seedTestData() {
  await insertUsageRecord({
    date: '2025-01-01',
    email: 'user1@example.com',
    tool: 'claude_code',
    rawModel: 'claude-sonnet-4-20250514',
    model: 'sonnet-4',
    inputTokens: 10000,
    outputTokens: 5000,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
    cost: 0.15,
  });
}

describe('GET /api/mappings', () => {
  beforeEach(async () => {
    await seedTestData();
  });

  it('returns 401 for unauthenticated requests', async () => {
    await mockUnauthenticated();

    const response = await GET(new Request('http://localhost/api/mappings'));

    expect(response.status).toBe(401);
  });

  it('returns mappings for authenticated users', async () => {
    await mockAuthenticated();

    const response = await GET(new Request('http://localhost/api/mappings'));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.mappings).toBeDefined();
    expect(data.unmapped).toBeDefined();
    expect(data.knownEmails).toBeDefined();
  });

  it('supports source filter', async () => {
    await mockAuthenticated();

    const response = await GET(new Request('http://localhost/api/mappings?source=claude_code'));

    expect(response.status).toBe(200);
  });
});

describe('POST /api/mappings', () => {
  it('returns 401 for unauthenticated requests', async () => {
    await mockUnauthenticated();

    const response = await POST(
      new Request('http://localhost/api/mappings', {
        method: 'POST',
        body: JSON.stringify({ source: 'claude_code', externalId: 'key123', email: 'user@example.com' }),
      })
    );

    expect(response.status).toBe(401);
  });

  it('returns 400 when required fields are missing', async () => {
    await mockAuthenticated();

    const response = await POST(
      new Request('http://localhost/api/mappings', {
        method: 'POST',
        body: JSON.stringify({ source: 'claude_code' }),
      })
    );

    expect(response.status).toBe(400);
  });

  it('returns 400 for invalid source', async () => {
    await mockAuthenticated();

    const response = await POST(
      new Request('http://localhost/api/mappings', {
        method: 'POST',
        body: JSON.stringify({ source: 'invalid', externalId: 'key123', email: 'user@example.com' }),
      })
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Invalid source');
  });

  it('returns 400 for invalid email', async () => {
    await mockAuthenticated();

    const response = await POST(
      new Request('http://localhost/api/mappings', {
        method: 'POST',
        body: JSON.stringify({ source: 'claude_code', externalId: 'key123', email: 'invalid' }),
      })
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Invalid email');
  });

  it('creates mapping for valid request', async () => {
    await mockAuthenticated();

    const response = await POST(
      new Request('http://localhost/api/mappings', {
        method: 'POST',
        body: JSON.stringify({ source: 'claude_code', externalId: 'key123', email: 'user@example.com' }),
      })
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
  });
});

describe('DELETE /api/mappings', () => {
  it('returns 401 for unauthenticated requests', async () => {
    await mockUnauthenticated();

    const response = await DELETE(
      new Request('http://localhost/api/mappings', {
        method: 'DELETE',
        body: JSON.stringify({ source: 'claude_code', externalId: 'key123' }),
      })
    );

    expect(response.status).toBe(401);
  });

  it('returns 400 when required fields are missing', async () => {
    await mockAuthenticated();

    const response = await DELETE(
      new Request('http://localhost/api/mappings', {
        method: 'DELETE',
        body: JSON.stringify({ source: 'claude_code' }),
      })
    );

    expect(response.status).toBe(400);
  });

  it('deletes mapping for valid request', async () => {
    await mockAuthenticated();

    const response = await DELETE(
      new Request('http://localhost/api/mappings', {
        method: 'DELETE',
        body: JSON.stringify({ source: 'claude_code', externalId: 'key123' }),
      })
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
  });
});
