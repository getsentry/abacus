import { vi } from 'vitest';

/**
 * Test authentication helpers
 *
 * Auth is globally mocked in setup.ts. Use these helpers to control
 * the authentication state in your tests.
 */

export const testUser = {
  id: 'test-user-id',
  email: 'test@example.com',
  name: 'Test User',
  emailVerified: true,
  image: null,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

export const testSession = {
  id: 'test-session-id',
  userId: testUser.id,
  expiresAt: new Date(Date.now() + 86400000),
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
  token: 'test-token',
  ipAddress: '127.0.0.1',
  userAgent: 'vitest',
};

type UserOverrides = Partial<typeof testUser>;

/**
 * Mock authenticated session for the current test.
 * Call in beforeEach or at the start of a test.
 */
export async function mockAuthenticated(overrides?: UserOverrides) {
  const { getSession, requireSession } = await import('@/lib/auth');
  const session = {
    user: { ...testUser, ...overrides },
    session: testSession,
  };
  vi.mocked(getSession).mockResolvedValue(session);
  vi.mocked(requireSession).mockResolvedValue(session);
}

/**
 * Mock unauthenticated state for the current test.
 * This is the default state - call explicitly for clarity.
 */
export async function mockUnauthenticated() {
  const { getSession, requireSession } = await import('@/lib/auth');
  vi.mocked(getSession).mockResolvedValue(null);
  vi.mocked(requireSession).mockRejectedValue(new Error('Unauthorized'));
}
