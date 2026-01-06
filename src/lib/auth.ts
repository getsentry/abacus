import { cookies } from 'next/headers';

const AUTH_COOKIE = 'ai_tracker_auth';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export function getAdminPassword(): string | undefined {
  return process.env.ADMIN_PASSWORD;
}

export function isAuthEnabled(): boolean {
  return !!getAdminPassword();
}

export async function isAuthenticated(): Promise<boolean> {
  if (!isAuthEnabled()) {
    return true; // No password set, allow all
  }

  const cookieStore = await cookies();
  const authCookie = cookieStore.get(AUTH_COOKIE);

  if (!authCookie?.value) {
    return false;
  }

  // Simple token validation - in production you'd want something more secure
  return authCookie.value === generateAuthToken();
}

export function generateAuthToken(): string {
  const password = getAdminPassword();
  if (!password) return '';

  // Simple hash - in production use crypto
  return Buffer.from(password).toString('base64');
}

export function getAuthCookieConfig() {
  return {
    name: AUTH_COOKIE,
    value: generateAuthToken(),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  };
}

export function getClearAuthCookieConfig() {
  return {
    name: AUTH_COOKIE,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 0,
    path: '/',
  };
}
