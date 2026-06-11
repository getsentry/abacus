import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GET, POST } from './route';
import { updateOpenRouterKey } from '@/lib/openrouter';
import { checkAccountStatus, isGoogleDirectoryConfigured } from '@/lib/google-directory';

vi.mock('@/lib/google-directory', () => ({
  checkAccountStatus: vi.fn(),
  isGoogleDirectoryConfigured: vi.fn(),
}));

vi.mock('@/lib/openrouter', async () => {
  const actual = await vi.importActual<typeof import('@/lib/openrouter')>('@/lib/openrouter');
  return {
    ...actual,
    updateOpenRouterKey: vi.fn(),
  };
});

type MockDb = {
  selectDistinct: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

function getMockDb(): MockDb {
  return (globalThis as unknown as Record<string, MockDb>)['__revoke-offboarded-db-mock'];
}

vi.mock('@/lib/db', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/db')>();
  const dbMock: MockDb = {
    selectDistinct: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
  };
  (globalThis as unknown as Record<string, MockDb>)['__revoke-offboarded-db-mock'] = dbMock;
  return {
    ...original,
    db: dbMock,
  };
});

function mockDistinctEmails(emails: string[]) {
  getMockDb().selectDistinct.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(emails.map((email) => ({ email }))),
    }),
  });
}

type KeyRow = { hash: string; workspace: string };

function mockEmailKeys(keysByEmail: Array<string[] | KeyRow[]>) {
  getMockDb().select.mockReset();
  keysByEmail.forEach((keys) => {
    const rows: KeyRow[] = keys.map((k) =>
      typeof k === 'string' ? { hash: k, workspace: 'default' } : k
    );
    getMockDb().select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(rows),
      }),
    });
  });
}

function mockUpdateSuccess() {
  getMockDb().update.mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    }),
  });
}

describe('GET /api/cron/revoke-offboarded', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv('CRON_SECRET', 'test-secret');
    mockDistinctEmails([]);
    mockEmailKeys([]);
    mockUpdateSuccess();

    vi.mocked(isGoogleDirectoryConfigured).mockReturnValue(true);
    vi.mocked(checkAccountStatus).mockResolvedValue('active');
    vi.mocked(updateOpenRouterKey).mockResolvedValue({
      data: {
        hash: 'hash',
        name: 'key',
        createdAt: '2026-01-01T00:00:00.000Z',
        workspaceId: 'workspace-id',
        creatorUserId: null,
        disabled: false,
        limit: null,
        limitReset: null,
        includeByokInLimit: false,
        byokUsage: 0,
        byokUsageDaily: 0,
        byokUsageMonthly: 0,
        byokUsageWeekly: 0,
        usage: 0,
        usageDaily: 0,
        usageMonthly: 0,
        usageWeekly: 0,
        limitRemaining: 0,
        updatedAt: '2026-01-01T00:00:00.000Z',
        label: 'key',
      },
    });
  });

  const authorizedRequest = new Request('http://localhost/api/cron/revoke-offboarded', {
    headers: { Authorization: 'Bearer test-secret' },
  });

  it('returns 401 without authorization header', async () => {
    const response = await GET(new Request('http://localhost/api/cron/revoke-offboarded'));

    expect(response.status).toBe(401);
  });

  it('returns 401 with invalid authorization', async () => {
    const response = await GET(
      new Request('http://localhost/api/cron/revoke-offboarded', {
        headers: { Authorization: 'Bearer wrong-secret' },
      })
    );

    expect(response.status).toBe(401);
  });

  it('returns skipped when Google Directory is not configured', async () => {
    vi.mocked(isGoogleDirectoryConfigured).mockReturnValue(false);

    const response = await GET(authorizedRequest);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      success: true,
      service: 'revoke-offboarded',
      skipped: true,
      reason: 'Google Directory not configured',
    });
  });

  it('disables keys for suspended user', async () => {
    mockDistinctEmails(['suspended@example.com']);
    mockEmailKeys([['hash-suspended']]);
    vi.mocked(checkAccountStatus).mockResolvedValue('inactive');

    const response = await GET(authorizedRequest);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      checked: 1,
      inactive: 1,
      keysDisabled: 1,
      skipped: 0,
      errors: [],
    });
    expect(updateOpenRouterKey).toHaveBeenCalledWith('default', 'hash-suspended', { disabled: true });
    expect(getMockDb().update).toHaveBeenCalledTimes(1);
  });

  it('disables keys for archived user', async () => {
    mockDistinctEmails(['archived@example.com']);
    mockEmailKeys([['hash-archived']]);
    vi.mocked(checkAccountStatus).mockResolvedValue('inactive');

    const response = await GET(authorizedRequest);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      checked: 1,
      inactive: 1,
      keysDisabled: 1,
      skipped: 0,
      errors: [],
    });
    expect(updateOpenRouterKey).toHaveBeenCalledWith('default', 'hash-archived', { disabled: true });
  });

  it('disables keys for deleted user (404 from Directory)', async () => {
    mockDistinctEmails(['deleted@example.com']);
    mockEmailKeys([['hash-deleted']]);
    vi.mocked(checkAccountStatus).mockResolvedValue('inactive');

    const response = await GET(authorizedRequest);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      checked: 1,
      inactive: 1,
      keysDisabled: 1,
      skipped: 0,
      errors: [],
    });
    expect(updateOpenRouterKey).toHaveBeenCalledWith('default', 'hash-deleted', { disabled: true });
  });

  it('disables multiple keys for same inactive user', async () => {
    mockDistinctEmails(['multi@example.com']);
    mockEmailKeys([['hash-a', 'hash-b', 'hash-c']]);
    vi.mocked(checkAccountStatus).mockResolvedValue('inactive');

    const response = await GET(authorizedRequest);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      checked: 1,
      inactive: 1,
      keysDisabled: 3,
      skipped: 0,
      errors: [],
    });
    expect(updateOpenRouterKey).toHaveBeenCalledTimes(3);
    expect(updateOpenRouterKey).toHaveBeenNthCalledWith(1, 'default', 'hash-a', { disabled: true });
    expect(updateOpenRouterKey).toHaveBeenNthCalledWith(3, 'default', 'hash-c', { disabled: true });
  });

  it('does not disable keys for active user', async () => {
    mockDistinctEmails(['active@example.com']);
    mockEmailKeys([[]]);
    vi.mocked(checkAccountStatus).mockResolvedValue('active');

    const response = await GET(authorizedRequest);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      checked: 1,
      inactive: 0,
      keysDisabled: 0,
      skipped: 0,
      errors: [],
    });
    expect(updateOpenRouterKey).not.toHaveBeenCalled();
  });

  it('does not disable keys when Directory API returns unknown error', async () => {
    mockDistinctEmails(['uncertain@example.com']);
    mockEmailKeys([['should-not-run']]);
    vi.mocked(checkAccountStatus).mockResolvedValue('unknown');

    const response = await GET(authorizedRequest);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      checked: 1,
      inactive: 0,
      keysDisabled: 0,
      skipped: 1,
      errors: [],
    });
    expect(updateOpenRouterKey).not.toHaveBeenCalled();
    expect(getMockDb().select).not.toHaveBeenCalled();
  });

  it('skips already-revoked emails (revoked_at IS NULL filter)', async () => {
    mockDistinctEmails(['fresh@example.com']);
    mockEmailKeys([['hash-active-key']]);
    vi.mocked(checkAccountStatus).mockResolvedValue('inactive');

    const response = await GET(authorizedRequest);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      checked: 1,
      inactive: 1,
      keysDisabled: 1,
      skipped: 0,
      errors: [],
    });

    expect(getMockDb().select).toHaveBeenCalledTimes(1);
    expect(getMockDb().update).toHaveBeenCalledTimes(1);
  });

  it('continues processing when one email fails Directory lookup', async () => {
    mockDistinctEmails(['bad@example.com', 'good@example.com']);
    mockEmailKeys([['hash-good']]);

    vi.mocked(checkAccountStatus).mockImplementation(async (email) => {
      if (email === 'bad@example.com') throw new Error('directory fail');
      return 'inactive';
    });

    const response = await GET(authorizedRequest);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      checked: 2,
      inactive: 1,
      keysDisabled: 1,
      skipped: 1,
      errors: ['Could not check directory status for bad@example.com: directory fail'],
    });

    expect(updateOpenRouterKey).toHaveBeenCalledWith('default', 'hash-good', { disabled: true });
  });

  it('continues processing when OpenRouter disable fails for one key', async () => {
    mockDistinctEmails(['error-user@example.com']);
    mockEmailKeys([['hash-good', 'hash-bad', 'hash-good-2']]);

    vi.mocked(checkAccountStatus).mockResolvedValue('inactive');
    vi.mocked(updateOpenRouterKey).mockImplementation(async (workspace, hash) => {
      if (hash === 'hash-bad') {
        throw new Error('openrouter 429');
      }
      return {
        data: {
          hash,
          name: 'key',
          createdAt: '2026-01-01T00:00:00.000Z',
          workspaceId: 'workspace-id',
          creatorUserId: null,
          disabled: false,
          limit: null,
          limitReset: null,
          includeByokInLimit: false,
          byokUsage: 0,
          byokUsageDaily: 0,
          byokUsageMonthly: 0,
          byokUsageWeekly: 0,
          usage: 0,
          usageDaily: 0,
          usageMonthly: 0,
          usageWeekly: 0,
          limitRemaining: 0,
          updatedAt: '2026-01-01T00:00:00.000Z',
          label: 'key',
        },
      };
    });

    const response = await GET(authorizedRequest);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      checked: 1,
      inactive: 1,
      keysDisabled: 2,
      skipped: 0,
    });
    expect(data.errors).toHaveLength(1);
    expect(data.errors[0]).toContain('Failed to disable key hash-bad for error-user@example.com');
  });

  it('includes errors in response summary (max 5)', async () => {
    const emails = Array.from({ length: 6 }, (_, i) => `user${i}@example.com`);
    mockDistinctEmails(emails);
    mockEmailKeys([[], [], [], [], [], []]);
    vi.mocked(checkAccountStatus).mockRejectedValue(new Error('oops'));

    const response = await GET(authorizedRequest);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.checked).toBe(6);
    expect(data.skipped).toBe(6);
    expect(data.errors).toHaveLength(5);
    expect(data.errors[0]).toContain('Could not check directory status for user0@example.com');
    expect(data.errors[4]).toContain('Could not check directory status for user4@example.com');
  });

  it('routes disable call through the workspace stored on each key row', async () => {
    mockDistinctEmails(['multiws@example.com']);
    mockEmailKeys([
      [
        { hash: 'hash-ws-a', workspace: 'Workspace A' },
        { hash: 'hash-ws-b', workspace: 'Workspace B' },
      ],
    ]);
    vi.mocked(checkAccountStatus).mockResolvedValue('inactive');

    const response = await GET(authorizedRequest);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.keysDisabled).toBe(2);
    expect(updateOpenRouterKey).toHaveBeenCalledWith('Workspace A', 'hash-ws-a', { disabled: true });
    expect(updateOpenRouterKey).toHaveBeenCalledWith('Workspace B', 'hash-ws-b', { disabled: true });
  });

  it('returns structured summary with checked/inactive/keysDisabled/skipped/errors', async () => {
    mockDistinctEmails(['summary@example.com']);
    mockEmailKeys([['hash-summary-1', 'hash-summary-2']]);
    vi.mocked(checkAccountStatus).mockResolvedValue('inactive');

    const response = await GET(authorizedRequest);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      success: true,
      service: 'revoke-offboarded',
      checked: 1,
      inactive: 1,
      keysDisabled: 2,
      skipped: 0,
      errors: [],
    });
  });
});

describe('POST /api/cron/revoke-offboarded', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv('CRON_SECRET', 'test-secret');
    mockDistinctEmails([]);
    mockEmailKeys([]);
    mockUpdateSuccess();
    vi.mocked(isGoogleDirectoryConfigured).mockReturnValue(true);
    vi.mocked(checkAccountStatus).mockResolvedValue('active');
  });

  it('returns 401 with missing authorization header', async () => {
    const response = await POST(new Request('http://localhost/api/cron/revoke-offboarded', { method: 'POST' }));

    expect(response.status).toBe(401);
  });
});
