'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, Check, ClipboardCopy, Copy, KeyRound, Loader2, Plus, Shield } from 'lucide-react';
import { AppHeader } from '@/components/AppHeader';
import { AnimatedCard, Card } from '@/components/Card';
import { PageContainer } from '@/components/PageContainer';
import { SectionLabel } from '@/components/SectionLabel';
import { ErrorState, LoadingState } from '@/components/PageState';

interface WorkspaceError {
  workspace: string;
  message: string;
}

interface OpenRouterKey {
  hash: string;
  name: string;
  label: string;
  disabled: boolean;
  created_at?: string | null;
  usage?: number;
  usage_daily?: number;
  usage_weekly?: number;
  usage_monthly?: number;
  workspace?: string | null;
}

type GroupedOpenRouterKeys = Record<string, OpenRouterKey[]>;

type KeyListView = 'mine' | 'all';

function isGroupedKeyPayload(value: unknown): value is GroupedOpenRouterKeys {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value).every(Array.isArray);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return 'Unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

function formatSpend(value: number | undefined): string {
  const amount = value ?? 0;
  if (amount === 0) return '$0';
  if (amount < 0.01) return '<$0.01';
  return `$${amount.toFixed(2)}`;
}

function maskLabel(label: string) {
  if (label.length <= 14) return label;
  return `${label.slice(0, 7)}••••••${label.slice(-5)}`;
}

function statusTextClass(disabled: boolean) {
  return disabled
    ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
    : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
}

function copyWithFallback(copy: (value: string) => Promise<void>, value: string) {
  return () => {
    void copy(value);
  };
}

function useClipboard() {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(value);
    setTimeout(() => setCopied(null), 1600);
  };

  return { copy, copied };
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<OpenRouterKey[]>([]);
  const [groupedKeys, setGroupedKeys] = useState<GroupedOpenRouterKeys>({});
  const [isAdmin, setIsAdmin] = useState(false);
  const [view, setView] = useState<KeyListView>('mine');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [pending, setPending] = useState<Set<string>>(new Set());

  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [workspaces, setWorkspaces] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState<string>('');
  const [workspaceErrors, setWorkspaceErrors] = useState<WorkspaceError[]>([]);
  const [adminWorkspaces, setAdminWorkspaces] = useState<Array<{ id: string; name: string; enabled: boolean }>>([]);
  const [adminWorkspacesError, setAdminWorkspacesError] = useState<string | null>(null);
  const [savingWorkspaces, setSavingWorkspaces] = useState(false);

  const { copy, copied } = useClipboard();

  const showWorkspace = workspaces.length >= 2;
  const totalMyKeys = keys.length;
  const totalAllKeys = useMemo(
    () => Object.values(groupedKeys).reduce((acc, list) => acc + list.length, 0),
    [groupedKeys],
  );

  const setupKey = revealedKey || 'sk-or-v1-...';
  const claudeCodeSetup = `export OPENROUTER_API_KEY="${setupKey}"
export ANTHROPIC_BASE_URL="https://openrouter.ai/api"
export ANTHROPIC_AUTH_TOKEN="$OPENROUTER_API_KEY"
export ANTHROPIC_API_KEY=""`;

  const codexSetup = `export OPENROUTER_API_KEY="${setupKey}"

model = "anthropic/claude-sonnet-4-5"
model_provider = "openrouter"

[model_providers.openrouter]
name = "OpenRouter"
base_url = "https://openrouter.ai/api/v1"
env_key = "OPENROUTER_API_KEY"
wire_api = "chat"`;

  const withError = async (response: Response, context: string) => {
    if (response.ok) return;

    const payload = await response.json().catch(() => null);
    const message =
      payload && typeof payload === 'object' && 'error' in payload
        ? String((payload as { error: string }).error)
        : `${context} (${response.status})`;

    throw new Error(message);
  };

  const loadWorkspaces = useCallback(async () => {
    try {
      const response = await fetch('/api/openrouter/workspaces');
      if (!response.ok) return;
      const data = await response.json();
      const items: Array<{ id: string; name: string }> = Array.isArray(data?.workspaces) ? data.workspaces : [];
      setWorkspaces(items);
      setSelectedWorkspace((prev) => prev || (items[0]?.id ?? ''));
    } catch {
      // non-critical; page works without workspace selector
    }
  }, []);

  const loadAdminWorkspaces = useCallback(async () => {
    try {
      const response = await fetch('/api/openrouter/workspaces?admin=true');
      if (response.status === 403) return;
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setAdminWorkspacesError(
          payload && typeof payload === 'object' && 'error' in payload
            ? String((payload as { error: string }).error)
            : 'Failed to load OpenRouter workspaces'
        );
        return;
      }
      const data = await response.json();
      setAdminWorkspaces(Array.isArray(data?.workspaces) ? data.workspaces : []);
      setAdminWorkspacesError(null);
    } catch {
      setAdminWorkspacesError('Failed to load OpenRouter workspaces');
    }
  }, []);

  const toggleWorkspace = useCallback(
    async (id: string) => {
      const next = adminWorkspaces.map((ws) => (ws.id === id ? { ...ws, enabled: !ws.enabled } : ws));
      setSavingWorkspaces(true);
      try {
        const response = await fetch('/api/openrouter/workspaces', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: next.filter((ws) => ws.enabled).map((ws) => ws.id) }),
        });
        await withError(response, 'Failed to update workspaces');
        setAdminWorkspaces(next);
        setAdminWorkspacesError(null);
        await loadWorkspaces();
      } catch (err) {
        setAdminWorkspacesError(err instanceof Error ? err.message : 'Failed to update workspaces');
      } finally {
        setSavingWorkspaces(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [adminWorkspaces, loadWorkspaces]
  );

  const loadMyKeys = useCallback(async () => {
    const response = await fetch('/api/openrouter/keys');
    await withError(response, 'Failed to fetch keys');
    const data = await response.json();
    if (Array.isArray(data)) {
      setKeys(data);
      setWorkspaceErrors([]);
    } else if (data && typeof data === 'object' && Array.isArray(data.keys)) {
      setKeys(data.keys);
      setWorkspaceErrors(Array.isArray(data.workspaceErrors) ? data.workspaceErrors : []);
    } else {
      setKeys([]);
      setWorkspaceErrors([]);
    }
  }, []);

  const loadAdminKeys = useCallback(async (): Promise<boolean> => {
    const response = await fetch('/api/openrouter/keys?admin=true');

    if (response.status === 403) {
      return false;
    }

    await withError(response, 'Failed to fetch admin keys');
    const data = await response.json();

    if (!isGroupedKeyPayload(data)) {
      throw new Error('Unexpected admin key payload shape');
    }

    setGroupedKeys(data);
    return true;
  }, []);

  const loadKeys = useCallback(async () => {
    setLoading(true);
    setError(null);
    setGroupedKeys({});

    try {
      const isAdminUser = await loadAdminKeys();
      setIsAdmin(isAdminUser);
      await loadMyKeys();

      if (isAdminUser) {
        setView('all');
      } else {
        setView('mine');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load keys');
      setWorkspaceErrors([]);
    } finally {
      setLoading(false);
    }
  }, [loadAdminKeys, loadMyKeys]);

  useEffect(() => {
    void loadKeys();
    void loadWorkspaces();
    void loadAdminWorkspaces();
  }, [loadKeys, loadWorkspaces, loadAdminWorkspaces]);
  function withPending(hash: string, task: () => Promise<void>) {
    return async () => {
      setPending((prev) => {
        const next = new Set(prev);
        next.add(hash);
        return next;
      });

      try {
        await task();
      } finally {
        setPending((prev) => {
          const next = new Set(prev);
          next.delete(hash);
          return next;
        });
      }
    };
  }

  async function handleToggle(key: OpenRouterKey) {
    try {
      await withPending(key.hash, async () => {
        const response = await fetch('/api/openrouter/keys', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hash: key.hash, disabled: !key.disabled }),
        });

        await withError(response, 'Failed to update key');
      })();
      await loadKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update key');
    }
  }

  async function handleDelete(hash: string) {
    if (!window.confirm('Delete this key permanently?')) {
      return;
    }

    try {
      await withPending(hash, async () => {
        const response = await fetch('/api/openrouter/keys', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hash }),
        });

        await withError(response, 'Failed to delete key');
      })();
      await loadKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete key');
    }
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = keyName.trim();
    if (!trimmed) return;

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/openrouter/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(workspaces.length >= 2 ? { name: trimmed, workspaceId: selectedWorkspace } : { name: trimmed }),
      });

      await withError(response, 'Failed to create key');
      const data = await response.json();
      setRevealedKey(data.key);
      setShowModal(true);
      setKeyName('');
      await loadKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create key');
    } finally {
      setSubmitting(false);
    }
  }

  function KeyRows({ items }: { items: OpenRouterKey[] }) {
    if (items.length === 0) {
      return (
        <tr>
          <td colSpan={showWorkspace ? 6 : 5} className="px-4 py-6 text-center">
            <span className="font-mono text-sm text-white/40">No keys found.</span>
          </td>
        </tr>
      );
    }

    return items.map((key) => {
      const keyPending = pending.has(key.hash);

      return (
        <tr key={key.hash} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition-colors">
          <td className="px-4 py-3">
            <div className="font-mono text-xs text-white/70">{key.name || 'Unnamed key'}</div>
            <div className="font-mono text-[11px] text-white/50 mt-1">{maskLabel(key.label || 'sk-or-v1...')}</div>
          </td>
          <td className="px-4 py-3 text-right whitespace-nowrap">
            <div className="font-mono text-xs text-white/70" title="OpenRouter credit spend (USD): current UTC day / week / month">
              <span className="text-white/90">{formatSpend(key.usage_daily)}</span>
              <span className="text-white/30"> / </span>
              <span>{formatSpend(key.usage_weekly)}</span>
              <span className="text-white/30"> / </span>
              <span>{formatSpend(key.usage_monthly)}</span>
            </div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-white/40 mt-1">day / wk / mo</div>
          </td>
          <td className="px-4 py-3 text-right w-40">
            <div className="font-mono text-xs text-white/70">{formatDate(key.created_at)}</div>
          </td>
          {showWorkspace && (
            <td className="px-4 py-3">
              <span className="font-mono text-xs text-white/60">{key.workspace ?? '—'}</span>
            </td>
          )}
          <td className="px-4 py-3 text-center w-28">
            <span className={`px-2 py-0.5 rounded text-[11px] uppercase tracking-wider font-mono border ${statusTextClass(Boolean(key.disabled))}`}>
              {key.disabled ? 'Disabled' : 'Active'}
            </span>
          </td>
          <td className="px-4 py-3 text-right w-44">
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => void handleToggle(key)}
                disabled={keyPending}
                className={`px-2.5 py-1.5 rounded font-mono text-[10px] uppercase tracking-wider border transition-colors ${
                  key.disabled
                    ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20'
                    : 'text-amber-400 border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20'
                } ${keyPending ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {keyPending ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Updating
                  </span>
                ) : key.disabled ? (
                  'Enable'
                ) : (
                  'Disable'
                )}
              </button>

              {isAdmin && (
                <button
                  type="button"
                  onClick={() => void handleDelete(key.hash)}
                  disabled={keyPending}
                  className={`px-2.5 py-1.5 rounded font-mono text-[10px] uppercase tracking-wider border text-rose-400 bg-rose-500/10 border-rose-500/30 hover:bg-rose-500/20 transition-colors ${
                    keyPending ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  Delete
                </button>
              )}
            </div>
          </td>
        </tr>
      );
    });
  }

  function AllKeysList() {
    const entries = Object.entries(groupedKeys);
    if (entries.length === 0) {
      return (
        <AnimatedCard>
          <div className="text-center py-8 font-mono text-white/40">No team keys found.</div>
        </AnimatedCard>
      );
    }

    return (
      <div className="space-y-4">
        {entries
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([email, items], index) => (
            <AnimatedCard key={email} padding="none" delay={index * 0.05} className="overflow-hidden">
              <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
                <span className="font-mono text-sm text-white">{email}</span>
                <span className="font-mono text-xs text-white/40">({items.length})</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/5 bg-white/[0.02]">
                      <th className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-wider text-white/50">Name / Label</th>
                      <th className="px-4 py-3 text-right font-mono text-[10px] uppercase tracking-wider text-white/50">Spend</th>
                      <th className="px-4 py-3 text-right font-mono text-[10px] uppercase tracking-wider text-white/50">Created</th>
                      {showWorkspace && <th className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-wider text-white/50">Workspace</th>}
                      <th className="px-4 py-3 text-center font-mono text-[10px] uppercase tracking-wider text-white/50">Status</th>
                      <th className="px-4 py-3 text-right font-mono text-[10px] uppercase tracking-wider text-white/50">Controls</th>
                    </tr>
                  </thead>
                  <tbody>
                    <KeyRows items={items} />
                  </tbody>
                </table>
              </div>
            </AnimatedCard>
          ))}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050507] text-white grid-bg">
      <AppHeader />

      <div className="border-b border-white/5">
        <PageContainer className="py-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-wider text-white/60">OpenRouter API Keys</p>
              <h1 className="font-display text-2xl text-white mt-1">API Keys</h1>
            </div>

            {isAdmin && (
              <div className="inline-flex border border-white/10 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setView('mine')}
                  className={`px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider border-r border-white/10 transition-colors ${
                    view === 'mine'
                      ? 'bg-amber-500/20 text-amber-400'
                      : 'text-white/50 hover:text-white/70 bg-white/5'
                  }`}
                >
                  My Keys ({totalMyKeys})
                </button>
                <button
                  type="button"
                  onClick={() => setView('all')}
                  className={`px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider transition-colors ${
                    view === 'all'
                      ? 'bg-amber-500/20 text-amber-400'
                      : 'text-white/50 hover:text-white/70 bg-white/5'
                  }`}
                >
                  All Keys ({totalAllKeys})
                </button>
              </div>
            )}
          </div>
        </PageContainer>
      </div>

      <main className="py-8">
        <PageContainer>
          <div className="space-y-8">
            <SectionLabel divider margin="lg">Create new key</SectionLabel>
            <AnimatedCard padding="lg">
              <div className="space-y-4 max-w-xl">
                <div className="inline-flex items-center gap-2 text-xs text-white/60">
                  <Shield className="w-4 h-4" />
                  <span className="font-mono">Provisioning key with your management key.</span>
                </div>
                <form onSubmit={(event) => void handleCreate(event)} className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="text"
                    value={keyName}
                    onChange={(event) => setKeyName(event.target.value)}
                    placeholder="Key name (e.g. Claude Code)"
                    className="w-full bg-[#0a0a0c] border border-white/10 rounded px-3 py-2 text-sm font-mono text-white/90 placeholder:text-white/30 focus:outline-none focus:border-white/30"
                  />
                  {workspaces.length >= 2 && (
                    <select
                      value={selectedWorkspace}
                      onChange={(e) => setSelectedWorkspace(e.target.value)}
                      className="bg-[#0a0a0c] border border-white/10 rounded px-3 py-2 text-sm font-mono text-white/70 focus:outline-none focus:border-white/30 flex-shrink-0"
                    >
                      {workspaces.map((ws) => (
                        <option key={ws.id} value={ws.id} className="bg-[#0a0a0c]">
                          {ws.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <button
                    type="submit"
                    disabled={submitting || !keyName.trim()}
                    className={`inline-flex items-center justify-center gap-2 rounded px-4 py-2 font-mono text-xs uppercase tracking-wider border transition-colors ${
                      submitting || !keyName.trim()
                        ? 'text-white/30 bg-white/5 border-white/10 cursor-not-allowed'
                        : 'text-amber-400 bg-amber-500/20 border-amber-500/30 hover:bg-amber-500/30'
                    }`}
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Creating
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4" /> Create Key
                      </>
                    )}
                  </button>
                </form>
              </div>
            </AnimatedCard>

            <section>
              <SectionLabel divider margin="lg">Your keys</SectionLabel>
              {loading ? (
                <LoadingState />
              ) : error ? (
                <ErrorState message={error} />
              ) : (
                <div className="space-y-4">
                  {view === 'all' && isAdmin ? (
                    <AllKeysList />
                  ) : (
                    <AnimatedCard padding="none" className="overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[640px]">
                          <thead>
                            <tr className="border-b border-white/5 bg-white/[0.02]">
                              <th className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-wider text-white/50">Name / Label</th>
                              <th className="px-4 py-3 text-right font-mono text-[10px] uppercase tracking-wider text-white/50">Spend</th>
                              <th className="px-4 py-3 text-right font-mono text-[10px] uppercase tracking-wider text-white/50">Created</th>
                              {showWorkspace && <th className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-wider text-white/50">Workspace</th>}
                              <th className="px-4 py-3 text-center font-mono text-[10px] uppercase tracking-wider text-white/50">Status</th>
                              <th className="px-4 py-3 text-right font-mono text-[10px] uppercase tracking-wider text-white/50">Controls</th>
                            </tr>
                          </thead>
                          <tbody>
                            <KeyRows items={view === 'mine' ? keys : []} />
                          </tbody>
                        </table>
                      </div>
                    </AnimatedCard>
                  )}
                  {workspaceErrors.length > 0 && (
                    <Card>
                      <div className="flex items-start gap-2 text-xs text-amber-400">
                        <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        <div>
                          <div className="font-mono font-semibold mb-1">Some workspaces failed to load</div>
                          {workspaceErrors.map((e) => (
                            <div key={e.workspace} className="font-mono text-amber-400/80">
                              {e.workspace}: {e.message}
                            </div>
                          ))}
                        </div>
                      </div>
                    </Card>
                  )}
                  <Card>
                    <div className="inline-flex items-center gap-2 text-xs text-white/60">
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                      <span className="font-mono">Disabled keys can be re-enabled. Deleted keys are removed permanently.</span>
                    </div>
                  </Card>
                </div>
              )}
            </section>

            {isAdmin && adminWorkspaces.length > 0 && (
              <section>
                <SectionLabel divider margin="lg">Workspaces</SectionLabel>
                <Card>
                  <p className="font-mono text-xs text-white/50 mb-3">
                    Enable the OpenRouter workspaces users can create keys in. With none enabled, keys go to the
                    account default workspace. The selector appears once two or more are enabled.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {adminWorkspaces.map((ws) => (
                      <button
                        key={ws.id}
                        type="button"
                        disabled={savingWorkspaces}
                        onClick={() => void toggleWorkspace(ws.id)}
                        className={`px-3 py-1.5 rounded font-mono text-[11px] uppercase tracking-wider border transition-colors ${
                          ws.enabled
                            ? 'bg-violet-500/20 text-violet-300 border-violet-500/40 hover:bg-violet-500/30'
                            : 'text-white/40 border-white/10 bg-white/5 hover:text-white/60'
                        } ${savingWorkspaces ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        {ws.enabled ? '✓ ' : ''}{ws.name}
                      </button>
                    ))}
                  </div>
                  {adminWorkspacesError && (
                    <div className="mt-3 font-mono text-xs text-rose-400">{adminWorkspacesError}</div>
                  )}
                </Card>
              </section>
            )}

            <section>
              <SectionLabel divider margin="lg">Setup Instructions</SectionLabel>
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <div className="flex items-center gap-2 mb-3">
                    <KeyRound className="w-4 h-4 text-amber-400" />
                    <span className="font-display text-sm text-white">Claude Code</span>
                  </div>
                  <pre className="w-full rounded border border-white/10 bg-black/30 p-3 text-[11px] font-mono text-emerald-200 overflow-x-auto">
{claudeCodeSetup}
                  </pre>
                  <button
                    type="button"
                    onClick={copyWithFallback(copy, claudeCodeSetup)}
                    className="inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider border border-white/10 text-white/60 hover:text-white hover:bg-white/5 transition-colors mt-3"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    {copied === claudeCodeSetup ? 'Copied' : 'Copy snippet'}
                  </button>
                </Card>

                <Card>
                  <div className="flex items-center gap-2 mb-3">
                    <KeyRound className="w-4 h-4 text-cyan-400" />
                    <span className="font-display text-sm text-white">Codex CLI</span>
                  </div>
                  <pre className="w-full rounded border border-white/10 bg-black/30 p-3 text-[11px] font-mono text-emerald-200 overflow-x-auto">
{codexSetup}
                  </pre>
                  <button
                    type="button"
                    onClick={copyWithFallback(copy, codexSetup)}
                    className="inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider border border-white/10 text-white/60 hover:text-white hover:bg-white/5 transition-colors mt-3"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    {copied === codexSetup ? 'Copied' : 'Copy snippet'}
                  </button>
                </Card>
              </div>
            </section>
          </div>
        </PageContainer>
      </main>

      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-xl rounded-lg border border-amber-500/40 bg-[#0a0a0c]"
          >
            <div className="p-5 sm:p-6">
              <div className="inline-flex items-center gap-2 text-amber-400 mb-4">
                <KeyRound className="w-4 h-4" />
                <span className="font-mono text-[11px] uppercase tracking-wider">Secret key (shown once)</span>
              </div>

              <div className="rounded border border-white/10 bg-black/40 p-3">
                <pre className="text-xs font-mono text-emerald-200 break-all">{revealedKey}</pre>
              </div>
              <div className="mt-2 font-mono text-xs text-amber-400">This key will not be shown again</div>

              <div className="mt-4 flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={copyWithFallback(copy, revealedKey || 'no key')}
                  className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded border border-amber-500/30 bg-amber-500/10 text-amber-400 font-mono text-[11px] uppercase tracking-wider hover:bg-amber-500/20 transition-colors"
                >
                  <ClipboardCopy className="w-3.5 h-3.5" />
                  {copied === revealedKey ? 'Copied' : 'Copy to clipboard'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setRevealedKey(null);
                  }}
                  className="inline-flex items-center justify-center px-3 py-2 rounded border border-white/5 bg-white/5 text-white/80 font-mono text-[11px] uppercase tracking-wider hover:bg-white/10 transition-colors"
                >
                  <Check className="w-3.5 h-3.5 mr-1" />
                  I have copied it
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );

}
