import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getAdminPassword, isAuthEnabled, isAuthenticated, getAuthCookieConfig, getClearAuthCookieConfig } from '@/lib/auth';

// Check auth status
export async function GET() {
  const enabled = isAuthEnabled();
  const authenticated = await isAuthenticated();

  return NextResponse.json({
    authEnabled: enabled,
    authenticated: authenticated,
  });
}

// Login
export async function POST(request: Request) {
  if (!isAuthEnabled()) {
    return NextResponse.json({ success: true, message: 'Auth not enabled' });
  }

  const { password } = await request.json();
  const adminPassword = getAdminPassword();

  if (password !== adminPassword) {
    return NextResponse.json(
      { success: false, error: 'Invalid password' },
      { status: 401 }
    );
  }

  const cookieStore = await cookies();
  const config = getAuthCookieConfig();
  cookieStore.set(config.name, config.value, {
    httpOnly: config.httpOnly,
    secure: config.secure,
    sameSite: config.sameSite,
    maxAge: config.maxAge,
    path: config.path,
  });

  return NextResponse.json({ success: true });
}

// Logout
export async function DELETE() {
  const cookieStore = await cookies();
  const config = getClearAuthCookieConfig();
  cookieStore.set(config.name, config.value, {
    httpOnly: config.httpOnly,
    secure: config.secure,
    sameSite: config.sameSite,
    maxAge: config.maxAge,
    path: config.path,
  });

  return NextResponse.json({ success: true });
}
