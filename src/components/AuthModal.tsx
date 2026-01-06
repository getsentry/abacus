'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  redirectPath?: string;
}

export function AuthModal({ isOpen, onClose, onSuccess, redirectPath }: AuthModalProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();

      if (data.success) {
        setPassword('');
        onSuccess();
        if (redirectPath) {
          window.location.href = redirectPath;
        }
      } else {
        setError(data.error || 'Invalid password');
      }
    } catch {
      setError('Failed to authenticate');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/70"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-white/10 bg-[#0a0a0f] p-6"
          >
            <h2 className="font-display text-xl text-white mb-1">Admin Access Required</h2>
            <p className="font-mono text-xs text-white/40 mb-6">
              Enter the admin password to access settings
            </p>

            <form onSubmit={handleSubmit}>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="w-full rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3 font-mono text-sm text-white placeholder-white/30 outline-none focus:border-amber-500/50"
                autoFocus
              />

              {error && (
                <p className="mt-2 font-mono text-xs text-red-400">{error}</p>
              )}

              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 rounded-lg border border-white/10 px-4 py-2 font-mono text-xs text-white/60 hover:bg-white/5 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !password}
                  className="flex-1 rounded-lg bg-amber-500 px-4 py-2 font-mono text-xs text-black hover:bg-amber-400 transition-colors disabled:opacity-50"
                >
                  {loading ? 'Checking...' : 'Login'}
                </button>
              </div>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
