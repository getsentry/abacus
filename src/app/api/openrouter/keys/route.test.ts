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
  OpenRouterError,
  type CreateOpenRouterKeyResult,
  type DeleteOpenRouterKeyResult,
  type ListOpenRouterKeysResult,
  type UpdateOpenRouterKeyResult,
} from '@/lib/openrouter';

vi.mock('@/lib/openrouter', async () => {
  const actual = await vi.importActual<typeof import('@/lib/openrouter')>('@/lib/openrouter');
  return {
    ...actual,
    createOpenRouterKey: vi.fn(),
    listOpenRouterKeys: vi.fn(),
    updateOpenRouterKey: vi.fn(),
    deleteOpenRouterKey: vi.fn(),
  };
});

const BASE_KEY_DATA: ListOpenRouterKeysResult['data'][number] = {
  byokUsage: 0,
  byokUsageDaily: 0,
  byokUsageMonthly: 0,
  byokUsageWeekly: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  creatorUserId: null,
  disabled: false,
  limit: null,
  limitRemaining: 0,
  limitReset: null,
  name: 'or name',
  hash: 'hash-default',
  includeByokInLimit: false,
  label: 'openrouter-key-default',
  updatedAt: '2026-01-01T00:00:00.000Z',
  usage: 0,
  usageDaily: 0,
  usageMonthly: 0,
  usageWeekly: 0,
  workspaceId: 'workspace-default',
};

function keyData(overrides: Partial<ListOpenRouterKeysResult['data'][number]> = {}): ListOpenRouterKeysResult['data'][number] {
  return {
    ...BASE_KEY_DATA,
    ...overrides,
  };
}

function createKeysFixture(overrides: Partial<CreateOpenRouterKeyResult> = {}): CreateOpenRouterKeyResult {
  const data = keyData(overrides.data ? { ...overrides.data, hash: overrides.data.hash ?? 'hash-new' } : { hash: 'hash-new' });

  return {
    key: overrides.key ?? 'sk-or-v1-abc',
    data,
  };
}

function listFixture(overrides: ListOpenRouterKeysResult['data'][number][]): ListOpenRouterKeysResult {
  return {
    data: overrides,
  };
}

function updateFixture(overrides: Partial<UpdateOpenRouterKeyResult['data']> = {}): UpdateOpenRouterKeyResult {
  return {
    data: keyData({
      hash: overrides.hash ?? 'hash-self',
      ...overrides,
      limitRemaining: overrides.limitRemaining ?? BASE_KEY_DATA.limitRemaining,
    }),
  };
}

function deleteFixture(): DeleteOpenRouterKeyResult {
  return { deleted: true };
}

function buildOpenRouterError(statusCode: number) {
  const request = new Request('http://localhost/api/openrouter/keys');
  const response = new Response('{}', { status: statusCode });
  return new OpenRouterError('OpenRouter request failed', { request, response, body: '{}'});
}

async function seedOpenRouterKeys(keys: Array<{ hash: string; email: string; name: string }>) {
  await db.insert(openrouterKeys).values(
    keys.map((key) => ({
      hash: key.hash,
      email: key.email,
      name: key.name,
      workspace: 'default',
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

    vi.mocked(listOpenRouterKeys).mockResolvedValue(
      listFixture([
        keyData({ hash: 'hash-user', name: 'or name 1' }),
        keyData({ hash: 'hash-other', name: 'or name 2', disabled: true }),
        keyData({ hash: 'hash-untracked', name: 'or name 3' }),
      ])
    );

    const response = await GET(new Request('http://localhost/api/openrouter/keys'));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({
      hash: 'hash-user',
      name: 'Workstation',
      disabled: false,
      created_at: '2026-01-01T00:00:00.000Z',
    });
  });

  it('returns all keys for admin with ?admin=true', async () => {
    vi.stubEnv('ADMIN_EMAILS', 'admin@example.com');
    await mockAuthenticated({ email: 'admin@example.com' });
    await seedOpenRouterKeys([
      { hash: 'hash-admin', email: 'admin@example.com', name: 'Admin Key' },
      { hash: 'hash-user', email: 'test@example.com', name: 'Test Key' },
    ]);

    vi.mocked(listOpenRouterKeys).mockResolvedValue(
      listFixture([
        keyData({ hash: 'hash-admin', name: 'or admin', disabled: false }),
        keyData({ hash: 'hash-user', name: 'or test', disabled: true }),
        keyData({ hash: 'hash-other', name: 'or other', disabled: false }),
      ])
    );

    const response = await GET(new Request('http://localhost/api/openrouter/keys?admin=true'));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(Object.keys(data)).toEqual(['admin@example.com', 'test@example.com']);
    expect(data['admin@example.com']).toHaveLength(1);
    expect(data['test@example.com']).toHaveLength(1);
    expect(data['test@example.com'][0]).toMatchObject({
      hash: 'hash-user',
      name: 'Test Key',
      created_at: '2026-01-01T00:00:00.000Z',
    });
  });

  it('treats ADMIN_EMAILS env value case-insensitively and trims spaces', async () => {
    vi.stubEnv('ADMIN_EMAILS', '  Admin@Example.Com , other@x.com');
    await mockAuthenticated({ email: 'admin@example.com' });
    await seedOpenRouterKeys([
      { hash: 'hash-admin', email: 'admin@example.com', name: 'Team Key' },
    ]);

    vi.mocked(listOpenRouterKeys).mockResolvedValue(
      listFixture([
        keyData({ hash: 'hash-admin', name: 'or test' }),
      ])
    );

    const response = await GET(new Request('http://localhost/api/openrouter/keys?admin=true'));

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(Object.keys(data)).toEqual(['admin@example.com']);
  });

  it('maps OpenRouter 429 to 503', async () => {
    await mockAuthenticated();
    await seedOpenRouterKeys([{ hash: 'hash-user', email: 'test@example.com', name: 'Workstation' }]);

    vi.mocked(listOpenRouterKeys).mockRejectedValue(buildOpenRouterError(429));

    const response = await GET(new Request('http://localhost/api/openrouter/keys'));

    expect(response.status).toBe(503);
    const data = await response.json();
    expect(data.error).toContain('rate limit');
  });

  it('maps OpenRouter 5xx to 502', async () => {
    await mockAuthenticated();
    await seedOpenRouterKeys([{ hash: 'hash-user', email: 'test@example.com', name: 'Workstation' }]);

    vi.mocked(listOpenRouterKeys).mockRejectedValue(buildOpenRouterError(500));

    const response = await GET(new Request('http://localhost/api/openrouter/keys'));

    expect(response.status).toBe(502);
    const data = await response.json();
    expect(data.error).toContain('temporarily');
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

    vi.mocked(createOpenRouterKey).mockResolvedValue(createKeysFixture());

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
      created_at: '2026-01-01T00:00:00.000Z',
    });

    expect(createOpenRouterKey).toHaveBeenCalledWith('default', {
      name: 'test@example.com - Personal',
    });

    const mapped = await db.select().from(openrouterKeys).where(eq(openrouterKeys.hash, 'hash-new'));
    expect(mapped).toHaveLength(1);
    expect(mapped[0]).toMatchObject({ hash: 'hash-new', email: 'test@example.com', name: 'Personal' });
  });

  it('returns 500 and cleans up when DB insert fails', async () => {
    await mockAuthenticated();
    await seedOpenRouterKeys([{ hash: 'hash-new', email: 'other@example.com', name: 'Duplicate' }]);

    vi.mocked(createOpenRouterKey).mockResolvedValue(createKeysFixture());
    vi.mocked(deleteOpenRouterKey).mockResolvedValue(deleteFixture());

    const response = await POST(
      new Request('http://localhost/api/openrouter/keys', {
        method: 'POST',
        body: JSON.stringify({ name: 'Duplicate attempt' }),
      })
    );

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe('Failed to store key mapping');
    expect(deleteOpenRouterKey).toHaveBeenCalledWith('default', 'hash-new');
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

  it('allows admin to patch another user key', async () => {
    vi.stubEnv('ADMIN_EMAILS', 'admin@example.com');
    await mockAuthenticated({ email: 'admin@example.com' });
    await seedOpenRouterKeys([{ hash: 'hash-other', email: 'other@example.com', name: 'Other' }]);

    vi.mocked(updateOpenRouterKey).mockResolvedValue(updateFixture({ hash: 'hash-other', disabled: true }));

    const response = await PATCH(
      new Request('http://localhost/api/openrouter/keys', {
        method: 'PATCH',
        body: JSON.stringify({ hash: 'hash-other', disabled: true }),
      })
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toMatchObject({
      hash: 'hash-other',
      disabled: true,
      created_at: '2026-01-01T00:00:00.000Z',
    });
    expect(updateOpenRouterKey).toHaveBeenCalledWith('default', 'hash-other', { disabled: true });
  });

  it('maps OpenRouter 5xx to 502 for patch', async () => {
    await mockAuthenticated();
    await seedOpenRouterKeys([{ hash: 'hash-self', email: 'test@example.com', name: 'My Key' }]);

    vi.mocked(updateOpenRouterKey).mockRejectedValue(buildOpenRouterError(503));

    const response = await PATCH(
      new Request('http://localhost/api/openrouter/keys', {
        method: 'PATCH',
        body: JSON.stringify({ hash: 'hash-self', disabled: true }),
      })
    );

    expect(response.status).toBe(502);
    const data = await response.json();
    expect(data.error).toContain('temporarily');
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

  it('maps OpenRouter 429 to 503 for delete', async () => {
    vi.stubEnv('ADMIN_EMAILS', 'admin@example.com');
    await mockAuthenticated({ email: 'admin@example.com' });
    await seedOpenRouterKeys([{ hash: 'hash-admin', email: 'test@example.com', name: 'User Key' }]);

    vi.mocked(deleteOpenRouterKey).mockRejectedValue(buildOpenRouterError(429));

    const response = await DELETE(
      new Request('http://localhost/api/openrouter/keys', {
        method: 'DELETE',
        body: JSON.stringify({ hash: 'hash-admin' }),
      })
    );

    expect(response.status).toBe(503);
    const data = await response.json();
    expect(data.error).toContain('rate limit');
  });

  it('deletes key for admin', async () => {
    vi.stubEnv('ADMIN_EMAILS', 'admin@example.com');
    await mockAuthenticated({ email: 'admin@example.com' });
    await seedOpenRouterKeys([{ hash: 'hash-admin', email: 'test@example.com', name: 'User Key' }]);

    vi.mocked(deleteOpenRouterKey).mockResolvedValue(deleteFixture());

    const response = await DELETE(
      new Request('http://localhost/api/openrouter/keys', {
        method: 'DELETE',
        body: JSON.stringify({ hash: 'hash-admin' }),
      })
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ success: true });
    expect(deleteOpenRouterKey).toHaveBeenCalledWith('default', 'hash-admin');

    const mapped = await db.select().from(openrouterKeys).where(eq(openrouterKeys.hash, 'hash-admin'));
    expect(mapped).toHaveLength(0);
  });
});
