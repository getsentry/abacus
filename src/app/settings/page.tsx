'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { MappingAssistant } from '@/components/MappingAssistant';

interface Mapping {
  api_key: string;
  email: string;
}

interface UnmappedKey {
  api_key: string;
  usage_count: number;
  suggested_email: string | null;
}

export default function SettingsPage() {
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [unmapped, setUnmapped] = useState<UnmappedKey[]>([]);
  const [knownEmails, setKnownEmails] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMappings = async () => {
    try {
      const res = await fetch('/api/mappings');
      const data = await res.json();
      setMappings(data.mappings || []);
      setUnmapped(data.unmapped || []);
      setKnownEmails(data.knownEmails || []);
    } catch (error) {
      console.error('Failed to fetch mappings:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMappings();
  }, []);

  const handleSaveMapping = async (apiKey: string, email: string) => {
    await fetch('/api/mappings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey, email }),
    });
    await fetchMappings();
  };

  const handleDeleteMapping = async (apiKey: string) => {
    await fetch('/api/mappings', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey }),
    });
    await fetchMappings();
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white grid-bg">
      {/* Header */}
      <header className="relative z-10 border-b border-white/5 px-8 py-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-white/40 hover:text-white transition-colors">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </Link>
            <div>
              <h1 className="font-display text-2xl font-medium tracking-tight">
                Settings
              </h1>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">
                API Key Mappings
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 p-8 max-w-4xl">
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="font-mono text-sm text-white/40">Loading...</div>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Mapping Assistant for unmapped keys */}
            {unmapped.length > 0 ? (
              <div>
                <h2 className="font-display text-lg text-white mb-4">Unmapped API Keys</h2>
                <p className="font-mono text-xs text-white/40 mb-4">
                  These API keys have usage data but aren't linked to a user email. Map them to see accurate per-user stats.
                </p>
                <MappingAssistant
                  unmappedKeys={unmapped}
                  knownEmails={knownEmails}
                  onSaveMapping={handleSaveMapping}
                />
              </div>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-6 text-center"
              >
                <div className="text-2xl mb-2">✓</div>
                <p className="font-mono text-sm text-emerald-400">All API keys are mapped!</p>
                <p className="font-mono text-xs text-white/40 mt-1">
                  Import more Claude Code data to see unmapped keys here.
                </p>
              </motion.div>
            )}

            {/* Existing Mappings */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <h2 className="font-display text-lg text-white mb-4">Configured Mappings</h2>
              {mappings.length === 0 ? (
                <div className="rounded-lg border border-white/5 bg-white/[0.02] p-6">
                  <p className="font-mono text-xs text-white/30">No mappings configured yet.</p>
                </div>
              ) : (
                <div className="rounded-lg border border-white/5 bg-white/[0.02] overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-white/10 bg-white/[0.02]">
                        <th className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-wider text-white/40">API Key</th>
                        <th className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-wider text-white/40">Mapped To</th>
                        <th className="px-4 py-3 text-right font-mono text-[10px] uppercase tracking-wider text-white/40">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mappings.map((mapping) => (
                        <tr key={mapping.api_key} className="border-b border-white/5">
                          <td className="px-4 py-3">
                            <code className="font-mono text-xs text-white/60">{mapping.api_key}</code>
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-mono text-xs text-emerald-400">{mapping.email}</span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => handleDeleteMapping(mapping.api_key)}
                              className="rounded border border-red-500/30 px-2 py-1 font-mono text-[10px] text-red-400 hover:bg-red-500/10 transition-colors"
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </motion.div>

            {/* Info Section */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="rounded-lg border border-white/5 bg-white/[0.02] p-6"
            >
              <h3 className="font-mono text-xs uppercase tracking-wider text-white/60 mb-3">How Mappings Work</h3>
              <ul className="space-y-2 font-mono text-xs text-white/40">
                <li className="flex items-start gap-2">
                  <span className="text-amber-400">•</span>
                  Claude Code API keys like <code className="text-white/60">claude_code_key_john.doe_xxxx</code> are auto-detected
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-cyan-400">•</span>
                  Cursor data already includes email addresses directly
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400">•</span>
                  When you map a key, all existing records are updated retroactively
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-white/40">•</span>
                  Non-standard keys (e.g., <code className="text-white/60">bruno-opencode</code>) need manual mapping
                </li>
              </ul>
            </motion.div>
          </div>
        )}
      </main>
    </div>
  );
}
