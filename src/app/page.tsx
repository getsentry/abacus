'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { StatCard } from '@/components/StatCard';
import { UsageChart } from '@/components/UsageChart';
import { ModelBreakdown } from '@/components/ModelBreakdown';
import { UserTable } from '@/components/UserTable';
import { UserDetailPanel } from '@/components/UserDetailPanel';
import { SearchInput } from '@/components/SearchInput';
import { ImportModal } from '@/components/ImportModal';
import { AuthModal } from '@/components/AuthModal';
import { formatTokens, formatCurrency } from '@/lib/utils';
import Link from 'next/link';

interface Stats {
  totalTokens: number;
  totalCost: number;
  activeUsers: number;
  claudeCodeTokens: number;
  cursorTokens: number;
  unattributed?: {
    totalTokens: number;
    totalCost: number;
  };
}

interface UserSummary {
  email: string;
  totalTokens: number;
  totalCost: number;
  claudeCodeTokens: number;
  cursorTokens: number;
  favoriteModel: string;
  lastActive: string;
}

interface DailyUsage {
  date: string;
  claudeCode: number;
  cursor: number;
}

interface ModelData {
  model: string;
  tokens: number;
  percentage: number;
  tool: string;
}

// Wrapper component to handle Suspense boundary for useSearchParams
function AuthRedirectHandler({
  setIsAuthOpen,
  setAuthRedirect
}: {
  setIsAuthOpen: (v: boolean) => void;
  setAuthRedirect: (v: string | null) => void;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    if (searchParams.get('auth') === 'required') {
      setAuthRedirect(searchParams.get('redirect') || '/settings');
      setIsAuthOpen(true);
      router.replace('/', { scroll: false });
    }
  }, [searchParams, router, setIsAuthOpen, setAuthRedirect]);

  return null;
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [trends, setTrends] = useState<DailyUsage[]>([]);
  const [models, setModels] = useState<ModelData[]>([]);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authRedirect, setAuthRedirect] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [unmappedCount, setUnmappedCount] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);

  // Check auth status on mount
  useEffect(() => {
    fetch('/api/auth')
      .then(res => res.json())
      .then(data => {
        setIsAdmin(!data.authEnabled || data.authenticated);
      })
      .catch(() => setIsAdmin(false));
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, usersRes, trendsRes, modelsRes, mappingsRes] = await Promise.all([
        fetch('/api/stats'),
        fetch(`/api/users?limit=20${searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : ''}`),
        fetch('/api/trends?days=14'),
        fetch('/api/models'),
        fetch('/api/mappings'),
      ]);

      const [statsData, usersData, trendsData, modelsData, mappingsData] = await Promise.all([
        statsRes.json(),
        usersRes.json(),
        trendsRes.json(),
        modelsRes.json(),
        mappingsRes.json(),
      ]);

      setStats(statsData);
      setUsers(usersData);
      setTrends(trendsData);
      setModels(modelsData);
      setUnmappedCount(mappingsData.unmapped?.length || 0);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const hasData = stats && stats.totalTokens > 0;

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white grid-bg">
      {/* Header */}
      <header className="relative z-10 border-b border-white/5 px-8 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-light tracking-tight">
              AI Usage <span className="text-amber-500">Tracker</span>
            </h1>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">
              Engineering Intelligence Dashboard
            </p>
          </div>
          <div className="flex items-center gap-4">
            <SearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search users..."
            />
            {isAdmin && (
              <button
                onClick={() => setIsImportOpen(true)}
                className="rounded-lg bg-amber-500 px-4 py-2 font-mono text-xs text-black hover:bg-amber-400 transition-colors"
              >
                Import CSV
              </button>
            )}
            <Link
              href="/users"
              className="rounded-lg border border-white/10 px-4 py-2 font-mono text-xs text-white/60 hover:bg-white/5 hover:text-white transition-colors"
            >
              All Users
            </Link>
            {isAdmin && (
              <Link
                href="/settings"
                className="rounded-lg border border-white/10 px-4 py-2 font-mono text-xs text-white/60 hover:bg-white/5 hover:text-white transition-colors"
              >
                Settings
              </Link>
            )}
            <div className="flex items-center gap-4 ml-4 border-l border-white/10 pl-4">
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full bg-amber-500" />
                <span className="font-mono text-[10px] text-white/50">Claude Code</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full bg-cyan-500" />
                <span className="font-mono text-[10px] text-white/50">Cursor</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 p-8">
        {loading && !stats ? (
          <div className="flex h-64 items-center justify-center">
            <div className="font-mono text-sm text-white/40">Loading...</div>
          </div>
        ) : !hasData ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="text-6xl mb-4">📊</div>
            <h2 className="font-display text-2xl text-white mb-2">No usage data yet</h2>
            <p className="font-mono text-sm text-white/40 mb-6">
              {isAdmin ? 'Import a CSV export from Claude Code or Cursor to get started' : 'Usage data will appear here once synced'}
            </p>
            {isAdmin && (
              <button
                onClick={() => setIsImportOpen(true)}
                className="rounded-lg bg-amber-500 px-6 py-3 font-mono text-sm text-black hover:bg-amber-400 transition-colors"
              >
                Import Your First CSV
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {/* Unattributed Usage Alert (admin only) */}
            {isAdmin && stats.unattributed && stats.unattributed.totalTokens > 0 && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-amber-400 text-lg">⚠</span>
                  <div>
                    <p className="font-mono text-sm text-amber-400">
                      {formatTokens(stats.unattributed.totalTokens)} unattributed tokens ({formatCurrency(stats.unattributed.totalCost)})
                    </p>
                    <p className="font-mono text-xs text-white/50">
                      {unmappedCount > 0 ? `${unmappedCount} unmapped API key${unmappedCount !== 1 ? 's' : ''} - ` : ''}Usage can't be attributed to specific users
                    </p>
                  </div>
                </div>
                <Link
                  href="/settings"
                  className="rounded-lg bg-amber-500 px-4 py-2 font-mono text-xs text-black hover:bg-amber-400 transition-colors"
                >
                  Fix Mappings
                </Link>
              </div>
            )}

            {/* Stats Grid */}
            <div className="grid grid-cols-4 gap-4">
              <StatCard
                label="Total Tokens"
                value={formatTokens(stats.totalTokens)}
                subValue="all time"
                delay={0}
              />
              <StatCard
                label="Estimated Cost"
                value={formatCurrency(stats.totalCost)}
                accentColor="#06b6d4"
                delay={0.1}
              />
              <StatCard
                label="Active Users"
                value={stats.activeUsers.toString()}
                subValue="with usage"
                accentColor="#10b981"
                delay={0.2}
              />
              <StatCard
                label="Avg per User"
                value={formatTokens(stats.activeUsers > 0 ? Math.round(stats.totalTokens / stats.activeUsers) : 0)}
                subValue="tokens"
                accentColor="#8b5cf6"
                delay={0.3}
              />
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-3 gap-6">
              <div className="col-span-2">
                <UsageChart data={trends} />
              </div>
              <ModelBreakdown data={models} />
            </div>

            {/* Users Table */}
            <UserTable users={users} onUserClick={setSelectedUser} />
          </div>
        )}
      </main>

      {/* User Detail Panel */}
      <UserDetailPanel email={selectedUser} onClose={() => setSelectedUser(null)} />

      {/* Import Modal */}
      <ImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onImportComplete={fetchData}
      />

      {/* Auth Modal */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => {
          setIsAuthOpen(false);
          setAuthRedirect(null);
        }}
        onSuccess={() => setIsAuthOpen(false)}
        redirectPath={authRedirect || undefined}
      />

      {/* Auth redirect handler (wrapped in Suspense for useSearchParams) */}
      <Suspense fallback={null}>
        <AuthRedirectHandler setIsAuthOpen={setIsAuthOpen} setAuthRedirect={setAuthRedirect} />
      </Suspense>
    </div>
  );
}
