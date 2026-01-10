import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useSearchParams: () => ({
    get: vi.fn().mockReturnValue(null),
  }),
}));

// Mock auth client
vi.mock('@/lib/auth-client', () => ({
  authClient: {
    signIn: {
      social: vi.fn().mockResolvedValue(undefined),
    },
  },
}));

describe('SignInPage', () => {
  it('renders the sign-in page', async () => {
    const { default: SignInPage } = await import('@/app/sign-in/page');

    render(<SignInPage />);

    // Check for key elements
    expect(screen.getByText('Abacus')).toBeInTheDocument();
    expect(screen.getByText('Sign in')).toBeInTheDocument();
  });

  it('renders Google sign-in button', async () => {
    const { default: SignInPage } = await import('@/app/sign-in/page');

    render(<SignInPage />);

    expect(screen.getByText('Continue with Google')).toBeInTheDocument();
  });

  it('shows organization account hint', async () => {
    const { default: SignInPage } = await import('@/app/sign-in/page');

    render(<SignInPage />);

    expect(screen.getByText(/organization Google account/i)).toBeInTheDocument();
  });

  it('shows access restriction notice', async () => {
    const { default: SignInPage } = await import('@/app/sign-in/page');

    render(<SignInPage />);

    expect(screen.getByText(/authorized domains/i)).toBeInTheDocument();
  });
});

describe('SignInPage with error', () => {
  it('displays access denied error', async () => {
    // Override the mock to return an error
    vi.doMock('next/navigation', () => ({
      useSearchParams: () => ({
        get: vi.fn((key: string) => (key === 'error' ? 'AccessDenied' : null)),
      }),
    }));

    // Clear module cache and re-import
    vi.resetModules();
    const { default: SignInPage } = await import('@/app/sign-in/page');

    render(<SignInPage />);

    // The error message should be displayed
    expect(screen.getByText(/not authorized/i)).toBeInTheDocument();
  });
});
