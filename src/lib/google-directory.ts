import { JWT } from 'google-auth-library';

const DIRECTORY_SCOPE = 'https://www.googleapis.com/auth/admin.directory.user.readonly';
const DIRECTORY_API_BASE = 'https://admin.googleapis.com/admin/directory/v1';

type AccountStatus = 'active' | 'inactive' | 'unknown';

type GoogleServiceAccountCredentials = {
  client_email: string;
  private_key: string;
};

function parseGoogleServiceAccountCredentials(): GoogleServiceAccountCredentials | null {
  const encoded = process.env.GOOGLE_SA_KEY_JSON;
  if (!encoded) return null;

  try {
    const decoded = Buffer.from(encoded, 'base64').toString('utf8');
    const parsed = JSON.parse(decoded) as Partial<GoogleServiceAccountCredentials>;

    if (!parsed.client_email || !parsed.private_key) {
      return null;
    }

    return {
      client_email: parsed.client_email,
      private_key: parsed.private_key,
    };
  } catch {
    return null;
  }
}

export function isGoogleDirectoryConfigured(): boolean {
  const credentials = parseGoogleServiceAccountCredentials();
  const subject = process.env.GOOGLE_DIRECTORY_SUBJECT;

  return !!(credentials && subject);
}

export async function checkAccountStatus(email: string): Promise<AccountStatus> {
  const credentials = parseGoogleServiceAccountCredentials();
  const subject = process.env.GOOGLE_DIRECTORY_SUBJECT;

  if (!credentials || !subject) {
    return 'unknown';
  }

  const client = new JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: [DIRECTORY_SCOPE],
    subject,
  });

  try {
    const token = await client.authorize();

    const response = await fetch(
      `${DIRECTORY_API_BASE}/users/${encodeURIComponent(email)}?fields=suspended,archived`,
      {
        headers: {
          Authorization: `Bearer ${token.access_token}`,
        },
      }
    );

    if (response.status === 404) return 'inactive';
    if (response.status === 403) {
      console.warn('[Google Directory] Permission denied while checking account status');
      return 'unknown';
    }
    if (!response.ok) return 'unknown';

    let user: Partial<{ suspended: boolean; archived: boolean }>;

    try {
      user = await response.json();
    } catch {
      return 'unknown';
    }

    if (user.suspended === true || user.archived === true) {
      return 'inactive';
    }

    return 'active';
  } catch {
    return 'unknown';
  }
}
