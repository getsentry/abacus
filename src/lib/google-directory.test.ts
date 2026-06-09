import { describe, it, expect, beforeEach, vi } from 'vitest';
import { checkAccountStatus, isGoogleDirectoryConfigured } from './google-directory';

const authorizeMock = vi.fn();

vi.mock('google-auth-library', () => ({
  JWT: vi.fn().mockImplementation(function () {
    return { authorize: authorizeMock };
  }),
}));
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

describe('isGoogleDirectoryConfigured', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();

    const encoded = Buffer.from(
      JSON.stringify({ client_email: 'user@project.iam.gserviceaccount.com', private_key: 'private-key' })
    ).toString('base64');
    vi.stubEnv('GOOGLE_SA_KEY_JSON', encoded);
    vi.stubEnv('GOOGLE_DIRECTORY_SUBJECT', 'admin@example.com');
  });

  it('returns true when both env vars are set', () => {
    expect(isGoogleDirectoryConfigured()).toBe(true);
  });

  it('returns false when GOOGLE_SA_KEY_JSON is missing', () => {
    vi.unstubAllEnvs();
    vi.stubEnv('GOOGLE_DIRECTORY_SUBJECT', 'admin@example.com');

    expect(isGoogleDirectoryConfigured()).toBe(false);
  });

  it('returns false when GOOGLE_DIRECTORY_SUBJECT is missing', () => {
    vi.unstubAllEnvs();
    const encoded = Buffer.from(JSON.stringify({
      client_email: 'user@project.iam.gserviceaccount.com',
      private_key: 'private-key',
    })).toString('base64');
    vi.stubEnv('GOOGLE_SA_KEY_JSON', encoded);

    expect(isGoogleDirectoryConfigured()).toBe(false);
  });

  it('returns false when GOOGLE_SA_KEY_JSON is invalid base64', () => {
    vi.unstubAllEnvs();
    vi.stubEnv('GOOGLE_SA_KEY_JSON', 'not-a-valid-base64');
    vi.stubEnv('GOOGLE_DIRECTORY_SUBJECT', 'admin@example.com');

    expect(isGoogleDirectoryConfigured()).toBe(false);
  });
});

describe('checkAccountStatus', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();

    const encoded = Buffer.from(
      JSON.stringify({ client_email: 'user@project.iam.gserviceaccount.com', private_key: 'private-key' })
    ).toString('base64');
    vi.stubEnv('GOOGLE_SA_KEY_JSON', encoded);
    vi.stubEnv('GOOGLE_DIRECTORY_SUBJECT', 'admin@example.com');
    authorizeMock.mockResolvedValue({ access_token: 'access-token' });
  });

  it('returns inactive for suspended user', async () => {
    fetchMock.mockResolvedValue(new Response('{"suspended": true, "archived": false}', { status: 200 }));

    const result = await checkAccountStatus('suspended@example.com');

    expect(result).toBe('inactive');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(authorizeMock).toHaveBeenCalledTimes(1);
  });

  it('returns inactive for archived user', async () => {
    fetchMock.mockResolvedValue(new Response('{"suspended": false, "archived": true}', { status: 200 }));

    const result = await checkAccountStatus('archived@example.com');

    expect(result).toBe('inactive');
  });

  it('returns inactive for deleted user (404)', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 404 }));

    const result = await checkAccountStatus('deleted@example.com');

    expect(result).toBe('inactive');
  });

  it('returns active for normal user', async () => {
    fetchMock.mockResolvedValue(
      new Response('{"suspended": false, "archived": false}', { status: 200 })
    );

    const result = await checkAccountStatus('active@example.com');

    expect(result).toBe('active');
  });

  it('returns unknown on 403', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 403 }));

    const result = await checkAccountStatus('forbidden@example.com');

    expect(result).toBe('unknown');
  });

  it('returns unknown on 500', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 500 }));

    const result = await checkAccountStatus('server-error@example.com');

    expect(result).toBe('unknown');
  });

  it('returns unknown when env vars are not configured', async () => {
    vi.unstubAllEnvs();
    vi.stubEnv('GOOGLE_SA_KEY_JSON', '');

    const result = await checkAccountStatus('missing-env@example.com');

    expect(result).toBe('unknown');
    expect(authorizeMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns unknown when SA JSON is invalid', async () => {
    vi.unstubAllEnvs();
    vi.stubEnv('GOOGLE_SA_KEY_JSON', Buffer.from('not-json', 'utf8').toString('base64'));
    vi.stubEnv('GOOGLE_DIRECTORY_SUBJECT', 'admin@example.com');

    const result = await checkAccountStatus('invalid-sa@example.com');

    expect(result).toBe('unknown');
    expect(authorizeMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
