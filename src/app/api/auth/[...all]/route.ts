import { NextRequest, NextResponse } from 'next/server';
import { auth, isAuthBypassed, mockSession } from '@/lib/auth';
import { toNextJsHandler } from 'better-auth/next-js';

const { GET: betterAuthGET, POST: betterAuthPOST } = toNextJsHandler(auth);

// Wrap GET to intercept get-session when auth is bypassed
export async function GET(request: NextRequest) {
  // When auth is bypassed, return mock session for get-session endpoint
  if (isAuthBypassed && request.nextUrl.pathname.includes('get-session')) {
    return NextResponse.json(mockSession);
  }

  return betterAuthGET(request);
}

export { betterAuthPOST as POST };
