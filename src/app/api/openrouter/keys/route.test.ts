import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db, openrouterKeys } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { mockAuthenticated, mockUnauthenticated } from '@/test-utils/auth';
import { DELETE, GET, PATCH, POST } from './route';
import {
  createOpenRouterKey,
  deleteOpenRouterKey,
  listOpenRouterKeys,
  updateOpenRouterKey,
} from '@/lib/openrouter';

vi.mock('@/lib/openrouter', () => ({
  createOpenRouterKey: vi.fn(),
  listOpenRouterKeys: vi.fn(),
  updateOpenRouterKey: vi.fn(),
  deleteOpenRouterKey: vi.fn(),
}));

async function seedOpenRouterKeys(keys: Array<{ hash: string; email: string; name: string; disabled?: boolean }>) {
  await db.insert(openrouterKeys).values(
    keys.map((key) => ({
      hash: key.hash,
      email: key.email,
      name: key.name,
      disabled: key.disabled ?? false,
    }))
  );
}

describe('GET /api/openrouter/keys', () => {

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    await db.delete(openrouterKeys);
    await mockUnauthenticated();
  });

  it('returns 401 for unauthenticated requests', async () => {
    const response = await GET(new Request('http://localhost/api/openrouter/keys'));

    expect(response.status).toBe(401);
  });

  it('returns only the current user keys', async () => {
    await mockAuthenticated();
    await seedOpenRouterKeys([
      { hash: 'hash-user', email: 'test@example.com', name: 'Workstation' },
      { hash: 'hash-other', email: 'other@example.com', name: 'Shared' },
    ]);

    vi.mocked(listOpenRouterKeys).mockResolvedValue({
      data: [
        { hash: 'hash-user', name: 'or name 1', disabled: false },
        { hash: 'hash-other', name: 'or name 2', disabled: true },
        { hash: 'hash-untracked', name: 'or name 3', disabled: false },
      ],
    } as unknown as any);

    const response = await GET(new Request('http://localhost/api/openrouter/keys'));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({
      hash: 'hash-user',
      name: 'Workstation',
      disabled: false,
    });
  });

  it('returns all keys for admin with ?admin=true', async () => {
    vi.stubEnv('ADMIN_EMAILS', 'admin@example.com');
    await mockAuthenticated({ email: 'admin@example.com' });
    await seedOpenRouterKeys([
      { hash: 'hash-admin', email: 'admin@example.com', name: 'Admin Key' },
      { hash: 'hash-user', email: 'test@example.com', name: 'Test Key' },
    ]);

    vi.mocked(listOpenRouterKeys).mockResolvedValue({
      data: [
        { hash: 'hash-admin', name: 'or admin', disabled: false },
        { hash: 'hash-user', name: 'or test', disabled: true },
        { hash: 'hash-other', name: 'or other', disabled: false },
      ],
    } as unknown as any);

    const response = await GET(new Request('http://localhost/api/openrouter/keys?admin=true'));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(Object.keys(data)).toEqual(['admin@example.com', 'test@example.com']);
    expect(data['admin@example.com']).toHaveLength(1);
    expect(data['test@example.com']).toHaveLength(1);
    expect(data['test@example.com'][0]).toMatchObject({ hash: 'hash-user', name: 'Test Key' });
  });

  it('returns 403 for non-admin requesting ?admin=true', async () => {
    vi.stubEnv('ADMIN_EMAILS', 'admin@example.com');
    await mockAuthenticated({ email: 'test@example.com' });

    const response = await GET(new Request('http://localhost/api/openrouter/keys?admin=true'));

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toBe('Forbidden');
  });
});

describe('POST /api/openrouter/keys', () => {

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    await db.delete(openrouterKeys);
    await mockUnauthenticated();
  });

  it('returns 401 for unauthenticated', async () => {
    const response = await POST(
      new Request('http://localhost/api/openrouter/keys', {
        method: 'POST',
        body: JSON.stringify({ name: 'should-not-run' }),
      })
    );

    expect(response.status).toBe(401);
  });

  it('returns 400 when name is missing', async () => {
    await mockAuthenticated();

    const response = await POST(
      new Request('http://localhost/api/openrouter/keys', {
        method: 'POST',
        body: JSON.stringify({}),
      })
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('name is required');
  });

  it('creates key and returns raw secret', async () => {
    await mockAuthenticated();

    vi.mocked(createOpenRouterKey).mockResolvedValue({
      key: 'sk-or-v1-abc',
      data: {
        hash: 'hash-new',
        disabled: false,
      },
    } as unknown as any);

    const response = await POST(
      new Request('http://localhost/api/openrouter/keys', {
        method: 'POST',
        body: JSON.stringify({ name: 'Personal' }),
      })
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({
      key: 'sk-or-v1-abc',
      hash: 'hash-new',
      name: 'Personal',
      disabled: false,
    });

    expect(createOpenRouterKey).toHaveBeenCalledWith({
      name: 'test@example.com - Personal',
    });

    const mapped = await db.select().from(openrouterKeys).where(eq(openrouterKeys.hash, 'hash-new'));
    expect(mapped).toHaveLength(1);
    expect(mapped[0]).toMatchObject({ hash: 'hash-new', email: 'test@example.com', name: 'Personal' });
  });
});

describe('PATCH /api/openrouter/keys', () => {

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    await db.delete(openrouterKeys);
    await mockUnauthenticated();
  });

  it('returns 401 for unauthenticated requests', async () => {
    const response = await PATCH(
      new Request('http://localhost/api/openrouter/keys', {
        method: 'PATCH',
        body: JSON.stringify({ hash: 'hash', disabled: true }),
      })
    );

    expect(response.status).toBe(401);
  });

  it('returns 400 if hash is missing', async () => {
    await mockAuthenticated();

    const response = await PATCH(
      new Request('http://localhost/api/openrouter/keys', {
        method: 'PATCH',
        body: JSON.stringify({ disabled: true }),
      })
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('hash is required');
  });

  it('returns 400 if disabled is not boolean', async () => {
    await mockAuthenticated();

    const response = await PATCH(
      new Request('http://localhost/api/openrouter/keys', {
        method: 'PATCH',
        body: JSON.stringify({ hash: 'hash', disabled: 'no' }),
      })
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('disabled must be boolean');
  });

  it('returns 403 for non-owner', async () => {
    await mockAuthenticated();
    await seedOpenRouterKeys([{ hash: 'hash-other', email: 'other@example.com', name: 'Other' }]);

    const response = await PATCH(
      new Request('http://localhost/api/openrouter/keys', {
        method: 'PATCH',
        body: JSON.stringify({ hash: 'hash-other', disabled: true }),
      })
    );

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toBe('Forbidden');
  });

  it('disables key for owner', async () => {
    await mockAuthenticated();
    await seedOpenRouterKeys([{ hash: 'hash-self', email: 'test@example.com', name: 'My Key' }]);

    vi.mocked(updateOpenRouterKey).mockResolvedValue({
      hash: 'hash-self',
      disabled: true,
      limit: null,
      limitReset: null,
      includeByokInLimit: false,
      createdAt: '2026-01-01T00:00:00.000Z',
    } as unknown as any);

    const response = await PATCH(
      new Request('http://localhost/api/openrouter/keys', {
        method: 'PATCH',
        body: JSON.stringify({ hash: 'hash-self', disabled: true }),
      })
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toMatchObject({
      hash: 'hash-self',
      disabled: true,
    });
    expect(updateOpenRouterKey).toHaveBeenCalledWith('hash-self', { disabled: true });
  });
});

describe('DELETE /api/openrouter/keys', () => {

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    await db.delete(openrouterKeys);
    await mockUnauthenticated();
  });

  it('returns 401 for unauthenticated requests', async () => {
    const response = await DELETE(
      new Request('http://localhost/api/openrouter/keys', {
        method: 'DELETE',
        body: JSON.stringify({ hash: 'hash-self' }),
      })
    );

    expect(response.status).toBe(401);
  });

  it('returns 403 for non-admin', async () => {
    vi.stubEnv('ADMIN_EMAILS', 'admin@example.com');
    await mockAuthenticated();

    const response = await DELETE(
      new Request('http://localhost/api/openrouter/keys', {
        method: 'DELETE',
        body: JSON.stringify({ hash: 'hash-self' }),
      })
    );

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toBe('Forbidden');
  });

  it('deletes key for admin', async () => {
    vi.stubEnv('ADMIN_EMAILS', 'admin@example.com');
    await mockAuthenticated({ email: 'admin@example.com' });
    await seedOpenRouterKeys([{ hash: 'hash-admin', email: 'test@example.com', name: 'User Key' }]);

    vi.mocked(deleteOpenRouterKey).mockResolvedValue({
      deleted: true,
      deletedAt: '2026-01-01T00:00:00.000Z',
    } as unknown as any);

    const response = await DELETE(
      new Request('http://localhost/api/openrouter/keys', {
        method: 'DELETE',
        body: JSON.stringify({ hash: 'hash-admin' }),
      })
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ success: true });
    expect(deleteOpenRouterKey).toHaveBeenCalledWith('hash-admin');

    const mapped = await db.select().from(openrouterKeys).where(eq(openrouterKeys.hash, 'hash-admin'));
    expect(mapped).toHaveLength(0);
  });
});
