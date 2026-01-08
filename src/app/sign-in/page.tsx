'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useState, useEffect, useCallback, useRef } from 'react';
import { authClient } from '@/lib/auth-client';
import { AbacusLogo } from '@/components/AbacusLogo';

function SignInContent() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/';
  const error = searchParams.get('error');
  const [loading, setLoading] = useState(false);
  const fallbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset loading state when user returns to page
  // Handles: bfcache restore (back button), tab switching, app switching on mobile
  useEffect(() => {
    let visibilityTimeoutId: ReturnType<typeof setTimeout> | null = null;

    // Handle bfcache restore (back-forward cache)
    // This is the PRIMARY fix for mobile back button navigation
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        // Page was restored from bfcache - reset loading state
        setLoading(false);
        if (fallbackTimeoutRef.current) {
          clearTimeout(fallbackTimeoutRef.current);
          fallbackTimeoutRef.current = null;
        }
      }
    };

    // Handle tab/app switching (works on most browsers, but NOT Safari navigation)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && loading) {
        // Clear any pending timeout
        if (visibilityTimeoutId) clearTimeout(visibilityTimeoutId);
        // Small delay to allow redirect to complete if successful
        visibilityTimeoutId = setTimeout(() => setLoading(false), 1000);
      }
    };

    window.addEventListener('pageshow', handlePageShow);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('pageshow', handlePageShow);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (visibilityTimeoutId) clearTimeout(visibilityTimeoutId);
    };
  }, [loading]);

  const handleGoogleSignIn = useCallback(async () => {
    setLoading(true);

    // Fallback timeout: reset loading if OAuth doesn't redirect within 10s
    // This handles cases where the redirect fails silently (popup blocked, etc.)
    fallbackTimeoutRef.current = setTimeout(() => {
      setLoading(false);
    }, 10000);

    try {
      await authClient.signIn.social({
        provider: 'google',
        callbackURL: callbackUrl,
      });
    } catch {
      if (fallbackTimeoutRef.current) {
        clearTimeout(fallbackTimeoutRef.current);
        fallbackTimeoutRef.current = null;
      }
      setLoading(false);
    }
  }, [callbackUrl]);

  return (
    <div className="flex-1 bg-[#050507] text-white grid-bg flex items-center justify-center p-4">
      {/* Subtle ambient glow */}
      <div
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] pointer-events-none opacity-[0.03]"
        style={{
          background: 'radial-gradient(circle, #ffffff 0%, transparent 70%)',
        }}
      />

      <div className="relative z-10 w-full max-w-sm">
        {/* Branding */}
        <div
          className="text-center mb-8 opacity-0"
          style={{ animation: 'slideUp 0.6s ease-out forwards' }}
        >
          <div className="inline-flex items-center justify-center w-12 h-12 mb-2">
            <AbacusLogo className="w-10 h-10 text-white" />
          </div>
          <h1 className="font-display text-2xl font-semibold text-white tracking-tight">
            Abacus
          </h1>
          <p className="font-mono text-xs text-muted mt-1">
            AI usage analytics for your team
          </p>
        </div>

        {/* Sign-in card */}
        <div
          className="rounded-xl border border-white/10 bg-white/[0.02] backdrop-blur-sm p-6 opacity-0"
          style={{ animation: 'slideUp 0.6s ease-out 0.1s forwards' }}
        >
          <h2 className="font-display text-lg text-white mb-1">Sign in</h2>
          <p className="font-mono text-xs text-muted mb-6">
            Use your organization Google account
          </p>

          {error && (
            <div
              className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20"
              style={{ animation: 'slideUp 0.3s ease-out' }}
            >
              <p className="font-mono text-xs text-red-400">
                {error === 'AccessDenied'
                  ? 'Access denied. Your account is not authorized.'
                  : 'Authentication failed. Please try again.'}
              </p>
            </div>
          )}

          <button
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="group w-full flex items-center justify-center gap-3 rounded-lg bg-white px-4 py-3 font-mono text-sm text-gray-800 cursor-pointer transition-all duration-200 hover:bg-gray-50 hover:shadow-lg hover:shadow-white/5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {/* Colored Google logo */}
            <svg className="w-5 h-5 transition-transform duration-200 group-hover:scale-110" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            <span className="font-medium">
              {loading ? 'Signing in...' : 'Continue with Google'}
            </span>
          </button>
        </div>

        {/* Footer hint */}
        <p
          className="text-center font-mono text-[10px] text-white/20 mt-6 opacity-0"
          style={{ animation: 'slideUp 0.6s ease-out 0.2s forwards' }}
        >
          Restricted to authorized domains
        </p>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 bg-[#050507] grid-bg flex items-center justify-center">
          <div className="font-mono text-muted text-sm">Loading...</div>
        </div>
      }
    >
      <SignInContent />
    </Suspense>
  );
}
