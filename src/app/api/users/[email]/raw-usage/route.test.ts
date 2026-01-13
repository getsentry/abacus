import { describe, it, expect, beforeEach } from 'vitest';
import { insertUsageRecord } from '@/lib/queries';
import { mockAuthenticated, mockUnauthenticated } from '@/test-utils/auth';
import { GET } from './route';

async function seedTestData() {
  // Insert multiple records for testing pagination and filtering
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

  await insertUsageRecord({
    date: '2025-01-02',
    email: 'user1@example.com',
    tool: 'cursor',
    rawModel: 'claude-sonnet-4-20250514',
    model: 'sonnet-4',
    inputTokens: 8000,
    outputTokens: 4000,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
    cost: 0.12,
  });

  await insertUsageRecord({
    date: '2025-01-03',
    email: 'user1@example.com',
    tool: 'claude_code',
    rawModel: 'claude-opus-4-20250514',
    model: 'opus-4',
    inputTokens: 20000,
    outputTokens: 10000,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
    cost: 0.45,
  });
}

describe('GET /api/users/[email]/raw-usage', () => {
  beforeEach(async () => {
    await seedTestData();
  });

  it('returns 401 for unauthenticated requests', async () => {
    await mockUnauthenticated();

    const response = await GET(
      new Request('http://localhost/api/users/user1@example.com/raw-usage?startDate=2025-01-01&endDate=2025-01-31'),
      { params: Promise.resolve({ email: 'user1@example.com' }) }
    );

    expect(response.status).toBe(401);
  });

  it('returns 400 when startDate is missing', async () => {
    await mockAuthenticated();

    const response = await GET(
      new Request('http://localhost/api/users/user1@example.com/raw-usage?endDate=2025-01-31'),
      { params: Promise.resolve({ email: 'user1@example.com' }) }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('startDate and endDate are required');
  });

  it('returns 400 when endDate is missing', async () => {
    await mockAuthenticated();

    const response = await GET(
      new Request('http://localhost/api/users/user1@example.com/raw-usage?startDate=2025-01-01'),
      { params: Promise.resolve({ email: 'user1@example.com' }) }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('startDate and endDate are required');
  });

  it('returns 400 for invalid startDate format', async () => {
    await mockAuthenticated();

    const response = await GET(
      new Request('http://localhost/api/users/user1@example.com/raw-usage?startDate=invalid&endDate=2025-01-31'),
      { params: Promise.resolve({ email: 'user1@example.com' }) }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Invalid startDate format');
  });

  it('returns 400 for invalid endDate format', async () => {
    await mockAuthenticated();

    const response = await GET(
      new Request('http://localhost/api/users/user1@example.com/raw-usage?startDate=2025-01-01&endDate=invalid'),
      { params: Promise.resolve({ email: 'user1@example.com' }) }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Invalid endDate format');
  });

  it('returns empty results for non-existent user email', async () => {
    await mockAuthenticated();

    const response = await GET(
      new Request('http://localhost/api/users/nonexistent@example.com/raw-usage?startDate=2025-01-01&endDate=2025-01-31'),
      { params: Promise.resolve({ email: 'nonexistent@example.com' }) }
    );

    // Email addresses are returned as-is, so we get empty results not 404
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.records).toEqual([]);
    expect(data.totalCount).toBe(0);
  });

  it('returns 404 for non-existent username', async () => {
    await mockAuthenticated();

    const response = await GET(
      new Request('http://localhost/api/users/nonexistent/raw-usage?startDate=2025-01-01&endDate=2025-01-31'),
      { params: Promise.resolve({ email: 'nonexistent' }) }
    );

    // Usernames (without @) are resolved via lookup, returns 404 if not found
    expect(response.status).toBe(404);
  });

  it('returns raw usage records for authenticated users', async () => {
    await mockAuthenticated();

    const response = await GET(
      new Request('http://localhost/api/users/user1@example.com/raw-usage?startDate=2025-01-01&endDate=2025-01-31'),
      { params: Promise.resolve({ email: 'user1@example.com' }) }
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.records).toBeDefined();
    expect(data.totalCount).toBe(3);
    expect(data.availableTools).toContain('claude_code');
    expect(data.availableTools).toContain('cursor');
    expect(data.availableModels).toContain('sonnet-4');
    expect(data.availableModels).toContain('opus-4');
  });

  it('returns records in descending date order', async () => {
    await mockAuthenticated();

    const response = await GET(
      new Request('http://localhost/api/users/user1@example.com/raw-usage?startDate=2025-01-01&endDate=2025-01-31'),
      { params: Promise.resolve({ email: 'user1@example.com' }) }
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.records[0].date).toBe('2025-01-03');
    expect(data.records[1].date).toBe('2025-01-02');
    expect(data.records[2].date).toBe('2025-01-01');
  });

  it('filters by tool', async () => {
    await mockAuthenticated();

    const response = await GET(
      new Request('http://localhost/api/users/user1@example.com/raw-usage?startDate=2025-01-01&endDate=2025-01-31&tool=claude_code'),
      { params: Promise.resolve({ email: 'user1@example.com' }) }
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.totalCount).toBe(2);
    expect(data.records.every((r: { tool: string }) => r.tool === 'claude_code')).toBe(true);
  });

  it('filters by model', async () => {
    await mockAuthenticated();

    const response = await GET(
      new Request('http://localhost/api/users/user1@example.com/raw-usage?startDate=2025-01-01&endDate=2025-01-31&model=sonnet-4'),
      { params: Promise.resolve({ email: 'user1@example.com' }) }
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.totalCount).toBe(2);
    expect(data.records.every((r: { model: string }) => r.model === 'sonnet-4')).toBe(true);
  });

  it('filters by both tool and model', async () => {
    await mockAuthenticated();

    const response = await GET(
      new Request('http://localhost/api/users/user1@example.com/raw-usage?startDate=2025-01-01&endDate=2025-01-31&tool=claude_code&model=sonnet-4'),
      { params: Promise.resolve({ email: 'user1@example.com' }) }
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.totalCount).toBe(1);
    expect(data.records[0].tool).toBe('claude_code');
    expect(data.records[0].model).toBe('sonnet-4');
  });

  it('supports pagination', async () => {
    await mockAuthenticated();

    const response = await GET(
      new Request('http://localhost/api/users/user1@example.com/raw-usage?startDate=2025-01-01&endDate=2025-01-31&page=0&limit=2'),
      { params: Promise.resolve({ email: 'user1@example.com' }) }
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.records.length).toBe(2);
    expect(data.totalCount).toBe(3);
  });

  it('returns second page correctly', async () => {
    await mockAuthenticated();

    const response = await GET(
      new Request('http://localhost/api/users/user1@example.com/raw-usage?startDate=2025-01-01&endDate=2025-01-31&page=1&limit=2'),
      { params: Promise.resolve({ email: 'user1@example.com' }) }
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.records.length).toBe(1);
    expect(data.totalCount).toBe(3);
  });

  it('handles negative page number by treating as 0', async () => {
    await mockAuthenticated();

    const response = await GET(
      new Request('http://localhost/api/users/user1@example.com/raw-usage?startDate=2025-01-01&endDate=2025-01-31&page=-5'),
      { params: Promise.resolve({ email: 'user1@example.com' }) }
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.records.length).toBe(3);
  });

  it('handles NaN page number by treating as 0', async () => {
    await mockAuthenticated();

    const response = await GET(
      new Request('http://localhost/api/users/user1@example.com/raw-usage?startDate=2025-01-01&endDate=2025-01-31&page=abc'),
      { params: Promise.resolve({ email: 'user1@example.com' }) }
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.records.length).toBe(3);
  });

  it('caps limit at 100', async () => {
    await mockAuthenticated();

    const response = await GET(
      new Request('http://localhost/api/users/user1@example.com/raw-usage?startDate=2025-01-01&endDate=2025-01-31&limit=500'),
      { params: Promise.resolve({ email: 'user1@example.com' }) }
    );

    expect(response.status).toBe(200);
    // Should not error, limit is capped internally
  });

  it('supports URL-encoded email addresses', async () => {
    await mockAuthenticated();

    const response = await GET(
      new Request('http://localhost/api/users/user1%40example.com/raw-usage?startDate=2025-01-01&endDate=2025-01-31'),
      { params: Promise.resolve({ email: 'user1%40example.com' }) }
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.totalCount).toBe(3);
  });

  it('returns correct totalTokens calculation', async () => {
    await mockAuthenticated();

    const response = await GET(
      new Request('http://localhost/api/users/user1@example.com/raw-usage?startDate=2025-01-01&endDate=2025-01-31'),
      { params: Promise.resolve({ email: 'user1@example.com' }) }
    );

    expect(response.status).toBe(200);
    const data = await response.json();

    // First record (Jan 3): 20000 + 10000 = 30000 tokens
    const jan3Record = data.records.find((r: { date: string }) => r.date === '2025-01-03');
    expect(jan3Record.totalTokens).toBe(30000);
  });
});
