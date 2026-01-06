'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Types
interface UsageRecord {
  id: string;
  user: string;
  email: string;
  team: string;
  tool: 'claude-code' | 'cursor';
  model: string;
  tokens: number;
  cost: number;
  timestamp: Date;
}

interface UserSummary {
  name: string;
  email: string;
  team: string;
  totalTokens: number;
  totalCost: number;
  claudeCodeTokens: number;
  cursorTokens: number;
  favoriteModel: string;
  lastActive: Date;
  trend: number; // percentage change
}

// Mock data
const mockUsers: UserSummary[] = [
  { name: 'Sarah Chen', email: 'sarah@company.com', team: 'Platform', totalTokens: 2847293, totalCost: 142.36, claudeCodeTokens: 1923847, cursorTokens: 923446, favoriteModel: 'claude-sonnet-4', lastActive: new Date(), trend: 23 },
  { name: 'Marcus Johnson', email: 'marcus@company.com', team: 'Frontend', totalTokens: 2103847, totalCost: 105.19, claudeCodeTokens: 892374, cursorTokens: 1211473, favoriteModel: 'gpt-4o', lastActive: new Date(), trend: -5 },
  { name: 'Elena Rodriguez', email: 'elena@company.com', team: 'Backend', totalTokens: 1892374, totalCost: 94.62, claudeCodeTokens: 1782934, cursorTokens: 109440, favoriteModel: 'claude-opus-4', lastActive: new Date(), trend: 45 },
  { name: 'James Park', email: 'james@company.com', team: 'Data', totalTokens: 1723984, totalCost: 86.20, claudeCodeTokens: 234987, cursorTokens: 1488997, favoriteModel: 'claude-sonnet-4', lastActive: new Date(), trend: 12 },
  { name: 'Priya Sharma', email: 'priya@company.com', team: 'Platform', totalTokens: 1534298, totalCost: 76.71, claudeCodeTokens: 1234298, cursorTokens: 300000, favoriteModel: 'claude-sonnet-4', lastActive: new Date(), trend: -2 },
  { name: 'David Kim', email: 'david@company.com', team: 'Mobile', totalTokens: 1298347, totalCost: 64.92, claudeCodeTokens: 498347, cursorTokens: 800000, favoriteModel: 'gpt-4o-mini', lastActive: new Date(), trend: 31 },
];

const modelBreakdown = [
  { model: 'claude-sonnet-4', tokens: 8234987, percentage: 42, color: '#f59e0b' },
  { model: 'claude-opus-4', tokens: 3892347, percentage: 20, color: '#d97706' },
  { model: 'gpt-4o', tokens: 4123847, percentage: 21, color: '#06b6d4' },
  { model: 'gpt-4o-mini', tokens: 2398472, percentage: 12, color: '#0891b2' },
  { model: 'claude-haiku', tokens: 982374, percentage: 5, color: '#fbbf24' },
];

const weeklyData = [
  { week: 'W48', claudeCode: 4200000, cursor: 2800000 },
  { week: 'W49', claudeCode: 4800000, cursor: 3100000 },
  { week: 'W50', claudeCode: 5100000, cursor: 3400000 },
  { week: 'W51', claudeCode: 4900000, cursor: 3800000 },
  { week: 'W52', claudeCode: 5600000, cursor: 4100000 },
  { week: 'W1', claudeCode: 6200000, cursor: 4500000 },
];

// Utility functions
const formatTokens = (n: number): string => {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return n.toString();
};

const formatCurrency = (n: number): string => `$${n.toFixed(2)}`;

// Components
const NoiseOverlay = () => (
  <div
    className="pointer-events-none fixed inset-0 z-50 opacity-[0.015]"
    style={{
      backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
    }}
  />
);

const GridBackground = () => (
  <div
    className="pointer-events-none fixed inset-0 opacity-[0.03]"
    style={{
      backgroundImage: `
        linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)
      `,
      backgroundSize: '40px 40px',
    }}
  />
);

const StatCard = ({
  label,
  value,
  subValue,
  trend,
  accentColor = '#f59e0b',
  delay = 0
}: {
  label: string;
  value: string;
  subValue?: string;
  trend?: number;
  accentColor?: string;
  delay?: number;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5, delay }}
    className="relative overflow-hidden rounded-lg border border-white/5 bg-white/[0.02] p-5 backdrop-blur-sm"
  >
    <div
      className="absolute left-0 top-0 h-full w-1"
      style={{ backgroundColor: accentColor }}
    />
    <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">{label}</p>
    <p className="mt-2 font-display text-3xl font-light tracking-tight text-white">{value}</p>
    <div className="mt-2 flex items-center gap-3">
      {subValue && (
        <span className="font-mono text-xs text-white/50">{subValue}</span>
      )}
      {trend !== undefined && (
        <span className={`font-mono text-xs ${trend >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}%
        </span>
      )}
    </div>
  </motion.div>
);

const MiniBarChart = ({ data, maxValue }: { data: typeof weeklyData; maxValue: number }) => (
  <div className="flex h-32 items-end gap-2">
    {data.map((item, i) => (
      <div key={item.week} className="flex flex-1 flex-col items-center gap-1">
        <div className="flex w-full flex-col gap-0.5">
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: `${(item.claudeCode / maxValue) * 100}%` }}
            transition={{ duration: 0.8, delay: i * 0.1 }}
            className="w-full rounded-t bg-amber-500/80"
            style={{ minHeight: item.claudeCode > 0 ? '2px' : '0' }}
          />
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: `${(item.cursor / maxValue) * 100}%` }}
            transition={{ duration: 0.8, delay: i * 0.1 + 0.05 }}
            className="w-full rounded-b bg-cyan-500/80"
            style={{ minHeight: item.cursor > 0 ? '2px' : '0' }}
          />
        </div>
        <span className="font-mono text-[9px] text-white/30">{item.week}</span>
      </div>
    ))}
  </div>
);

const ModelBar = ({ model, tokens, percentage, color, delay }: {
  model: string;
  tokens: number;
  percentage: number;
  color: string;
  delay: number;
}) => (
  <motion.div
    initial={{ opacity: 0, x: -20 }}
    animate={{ opacity: 1, x: 0 }}
    transition={{ duration: 0.4, delay }}
    className="group"
  >
    <div className="mb-1 flex items-center justify-between">
      <span className="font-mono text-xs text-white/70 group-hover:text-white transition-colors">
        {model}
      </span>
      <span className="font-mono text-[10px] text-white/40">
        {formatTokens(tokens)}
      </span>
    </div>
    <div className="h-2 w-full overflow-hidden rounded-full bg-white/5">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${percentage}%` }}
        transition={{ duration: 0.8, delay: delay + 0.2 }}
        className="h-full rounded-full"
        style={{ backgroundColor: color }}
      />
    </div>
  </motion.div>
);

const UserRow = ({ user, rank, onClick }: { user: UserSummary; rank: number; onClick: () => void }) => (
  <motion.tr
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    transition={{ delay: rank * 0.05 }}
    onClick={onClick}
    className="group cursor-pointer border-b border-white/5 transition-colors hover:bg-white/[0.02]"
  >
    <td className="py-3 pr-4">
      <span className="font-mono text-xs text-white/30">#{rank}</span>
    </td>
    <td className="py-3 pr-4">
      <div>
        <p className="font-sans text-sm text-white group-hover:text-amber-400 transition-colors">
          {user.name}
        </p>
        <p className="font-mono text-[10px] text-white/40">{user.team}</p>
      </div>
    </td>
    <td className="py-3 pr-4 text-right">
      <span className="font-mono text-sm text-white/80">{formatTokens(user.totalTokens)}</span>
    </td>
    <td className="py-3 pr-4 text-right">
      <span className="font-mono text-sm text-white/60">{formatCurrency(user.totalCost)}</span>
    </td>
    <td className="py-3 pr-4">
      <div className="flex gap-1">
        <div
          className="h-1.5 rounded-full bg-amber-500"
          style={{ width: `${(user.claudeCodeTokens / user.totalTokens) * 60}px` }}
        />
        <div
          className="h-1.5 rounded-full bg-cyan-500"
          style={{ width: `${(user.cursorTokens / user.totalTokens) * 60}px` }}
        />
      </div>
    </td>
    <td className="py-3 text-right">
      <span className={`font-mono text-xs ${user.trend >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
        {user.trend >= 0 ? '+' : ''}{user.trend}%
      </span>
    </td>
  </motion.tr>
);

const SearchInput = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
  <div className="relative">
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Search users..."
      className="w-64 rounded-lg border border-white/10 bg-white/[0.02] px-4 py-2 pl-10 font-mono text-sm text-white placeholder-white/30 outline-none transition-colors focus:border-amber-500/50 focus:bg-white/[0.04]"
    />
    <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  </div>
);

const TabButton = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button
    onClick={onClick}
    className={`relative px-4 py-2 font-mono text-xs uppercase tracking-wider transition-colors ${
      active ? 'text-white' : 'text-white/40 hover:text-white/60'
    }`}
  >
    {children}
    {active && (
      <motion.div
        layoutId="activeTab"
        className="absolute bottom-0 left-0 right-0 h-px bg-amber-500"
      />
    )}
  </button>
);

// User Detail Panel
const UserDetailPanel = ({ user, onClose }: { user: UserSummary | null; onClose: () => void }) => (
  <AnimatePresence>
    {user && (
      <motion.div
        initial={{ opacity: 0, x: 300 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 300 }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="fixed right-0 top-0 z-40 h-full w-96 border-l border-white/10 bg-[#0a0a0f]/95 p-6 backdrop-blur-xl"
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-white/40 hover:text-white transition-colors"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="mb-6">
          <h2 className="font-display text-2xl text-white">{user.name}</h2>
          <p className="font-mono text-xs text-white/40">{user.email}</p>
          <span className="mt-2 inline-block rounded bg-white/10 px-2 py-0.5 font-mono text-[10px] text-white/60">
            {user.team}
          </span>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-white/5 bg-white/[0.02] p-4">
            <p className="font-mono text-[10px] uppercase tracking-wider text-white/40">Total Tokens</p>
            <p className="mt-1 font-display text-2xl text-white">{formatTokens(user.totalTokens)}</p>
            <p className="font-mono text-xs text-white/50">{formatCurrency(user.totalCost)} estimated cost</p>
          </div>

          <div className="rounded-lg border border-white/5 bg-white/[0.02] p-4">
            <p className="mb-3 font-mono text-[10px] uppercase tracking-wider text-white/40">Tool Breakdown</p>
            <div className="space-y-2">
              <div>
                <div className="flex justify-between mb-1">
                  <span className="font-mono text-xs text-amber-400">Claude Code</span>
                  <span className="font-mono text-xs text-white/60">{formatTokens(user.claudeCodeTokens)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/5">
                  <div
                    className="h-full rounded-full bg-amber-500"
                    style={{ width: `${(user.claudeCodeTokens / user.totalTokens) * 100}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between mb-1">
                  <span className="font-mono text-xs text-cyan-400">Cursor</span>
                  <span className="font-mono text-xs text-white/60">{formatTokens(user.cursorTokens)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/5">
                  <div
                    className="h-full rounded-full bg-cyan-500"
                    style={{ width: `${(user.cursorTokens / user.totalTokens) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-white/5 bg-white/[0.02] p-4">
            <p className="font-mono text-[10px] uppercase tracking-wider text-white/40">Favorite Model</p>
            <p className="mt-1 font-mono text-sm text-white">{user.favoriteModel}</p>
          </div>

          <div className="rounded-lg border border-white/5 bg-white/[0.02] p-4">
            <p className="mb-3 font-mono text-[10px] uppercase tracking-wider text-white/40">Weekly Activity</p>
            <div className="flex h-16 items-end gap-1">
              {[65, 80, 45, 90, 70, 85, 95].map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t bg-gradient-to-t from-amber-500/60 to-amber-500"
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
            <div className="mt-1 flex justify-between font-mono text-[8px] text-white/30">
              <span>Mon</span>
              <span>Sun</span>
            </div>
          </div>
        </div>
      </motion.div>
    )}
  </AnimatePresence>
);

// Main Dashboard Component
export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<'overview' | 'trends' | 'data'>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserSummary | null>(null);

  const filteredUsers = mockUsers.filter(u =>
    u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.team.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalTokens = mockUsers.reduce((sum, u) => sum + u.totalTokens, 0);
  const totalCost = mockUsers.reduce((sum, u) => sum + u.totalCost, 0);
  const totalClaudeCode = mockUsers.reduce((sum, u) => sum + u.claudeCodeTokens, 0);
  const totalCursor = mockUsers.reduce((sum, u) => sum + u.cursorTokens, 0);
  const maxWeeklyValue = Math.max(...weeklyData.map(d => d.claudeCode + d.cursor));

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <NoiseOverlay />
      <GridBackground />

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
          <div className="flex items-center gap-6">
            <SearchInput value={searchQuery} onChange={setSearchQuery} />
            <div className="flex items-center gap-2">
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

        {/* Tabs */}
        <nav className="mt-6 flex gap-2 border-b border-white/5">
          <TabButton active={activeTab === 'overview'} onClick={() => setActiveTab('overview')}>
            Overview
          </TabButton>
          <TabButton active={activeTab === 'trends'} onClick={() => setActiveTab('trends')}>
            Trends
          </TabButton>
          <TabButton active={activeTab === 'data'} onClick={() => setActiveTab('data')}>
            Raw Data
          </TabButton>
        </nav>
      </header>

      {/* Main Content */}
      <main className="relative z-10 p-8">
        {activeTab === 'overview' && (
          <div className="space-y-8">
            {/* Stats Grid */}
            <div className="grid grid-cols-4 gap-4">
              <StatCard
                label="Total Tokens"
                value={formatTokens(totalTokens)}
                subValue="this period"
                trend={18}
                delay={0}
              />
              <StatCard
                label="Estimated Cost"
                value={formatCurrency(totalCost)}
                subValue="$0.05/1K tokens avg"
                trend={12}
                accentColor="#06b6d4"
                delay={0.1}
              />
              <StatCard
                label="Active Users"
                value="47"
                subValue="of 52 engineers"
                trend={8}
                accentColor="#10b981"
                delay={0.2}
              />
              <StatCard
                label="Avg per User"
                value={formatTokens(totalTokens / mockUsers.length)}
                subValue="tokens/week"
                trend={-3}
                accentColor="#8b5cf6"
                delay={0.3}
              />
            </div>

            {/* Two Column Layout */}
            <div className="grid grid-cols-3 gap-6">
              {/* Left: Usage Chart */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="col-span-2 rounded-lg border border-white/5 bg-white/[0.02] p-6"
              >
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="font-mono text-xs uppercase tracking-wider text-white/60">
                    Weekly Token Consumption
                  </h3>
                  <div className="flex gap-4">
                    <span className="font-mono text-xs text-amber-400">
                      Claude Code: {formatTokens(totalClaudeCode)}
                    </span>
                    <span className="font-mono text-xs text-cyan-400">
                      Cursor: {formatTokens(totalCursor)}
                    </span>
                  </div>
                </div>
                <MiniBarChart data={weeklyData} maxValue={maxWeeklyValue} />
              </motion.div>

              {/* Right: Model Breakdown */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="rounded-lg border border-white/5 bg-white/[0.02] p-6"
              >
                <h3 className="mb-4 font-mono text-xs uppercase tracking-wider text-white/60">
                  Model Distribution
                </h3>
                <div className="space-y-4">
                  {modelBreakdown.map((m, i) => (
                    <ModelBar key={m.model} {...m} delay={0.6 + i * 0.1} />
                  ))}
                </div>
              </motion.div>
            </div>

            {/* Users Table */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 }}
              className="rounded-lg border border-white/5 bg-white/[0.02] p-6"
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-mono text-xs uppercase tracking-wider text-white/60">
                  Top Users
                </h3>
                <button className="font-mono text-xs text-amber-500 hover:text-amber-400 transition-colors">
                  View All →
                </button>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="pb-2 pr-4 text-left font-mono text-[10px] uppercase tracking-wider text-white/40">Rank</th>
                    <th className="pb-2 pr-4 text-left font-mono text-[10px] uppercase tracking-wider text-white/40">User</th>
                    <th className="pb-2 pr-4 text-right font-mono text-[10px] uppercase tracking-wider text-white/40">Tokens</th>
                    <th className="pb-2 pr-4 text-right font-mono text-[10px] uppercase tracking-wider text-white/40">Cost</th>
                    <th className="pb-2 pr-4 text-left font-mono text-[10px] uppercase tracking-wider text-white/40">Distribution</th>
                    <th className="pb-2 text-right font-mono text-[10px] uppercase tracking-wider text-white/40">Trend</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user, i) => (
                    <UserRow
                      key={user.email}
                      user={user}
                      rank={i + 1}
                      onClick={() => setSelectedUser(user)}
                    />
                  ))}
                </tbody>
              </table>
            </motion.div>
          </div>
        )}

        {activeTab === 'trends' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-6"
          >
            <div className="grid grid-cols-2 gap-6">
              <div className="rounded-lg border border-white/5 bg-white/[0.02] p-6">
                <h3 className="mb-4 font-mono text-xs uppercase tracking-wider text-white/60">
                  Model Adoption Over Time
                </h3>
                <div className="flex h-48 items-center justify-center text-white/20 font-mono text-sm">
                  [Stacked Area Chart]
                </div>
              </div>
              <div className="rounded-lg border border-white/5 bg-white/[0.02] p-6">
                <h3 className="mb-4 font-mono text-xs uppercase tracking-wider text-white/60">
                  Team Comparison
                </h3>
                <div className="flex h-48 items-center justify-center text-white/20 font-mono text-sm">
                  [Horizontal Bar Chart]
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-white/5 bg-white/[0.02] p-6">
              <h3 className="mb-4 font-mono text-xs uppercase tracking-wider text-white/60">
                Cost Projection
              </h3>
              <div className="flex h-48 items-center justify-center text-white/20 font-mono text-sm">
                [Line Chart with Forecast]
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'data' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-lg border border-white/5 bg-white/[0.02] p-6"
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-mono text-xs uppercase tracking-wider text-white/60">
                Raw Usage Data
              </h3>
              <div className="flex gap-2">
                <button className="rounded border border-white/10 px-3 py-1.5 font-mono text-xs text-white/60 hover:border-white/20 hover:text-white transition-colors">
                  Export CSV
                </button>
                <button className="rounded border border-amber-500/50 bg-amber-500/10 px-3 py-1.5 font-mono text-xs text-amber-400 hover:bg-amber-500/20 transition-colors">
                  Import Data
                </button>
              </div>
            </div>
            <div className="flex h-64 items-center justify-center text-white/20 font-mono text-sm">
              [Filterable Data Table with Pagination]
            </div>
          </motion.div>
        )}
      </main>

      {/* User Detail Slide-out */}
      <UserDetailPanel user={selectedUser} onClose={() => setSelectedUser(null)} />

      {/* Global Styles */}
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500&family=Playfair+Display:wght@300;400;500&display=swap');

        .font-mono {
          font-family: 'JetBrains Mono', monospace;
        }

        .font-display {
          font-family: 'Playfair Display', serif;
        }

        .font-sans {
          font-family: 'JetBrains Mono', monospace;
        }
      `}</style>
    </div>
  );
}
