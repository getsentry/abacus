'use client';

import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { formatTokens, formatCurrency } from '@/lib/utils';
import { DEFAULT_DAYS } from '@/lib/constants';
import { UserLink } from '@/components/UserLink';
import { AnimatedCard } from '@/components/Card';
import { AppLink } from '@/components/AppLink';
import { SectionLabel } from '@/components/SectionLabel';
import { ToolSplitBar } from '@/components/ToolSplitBar';

interface UserSummary {
  email: string;
  totalTokens: number;
  totalCost: number;
  claudeCodeTokens: number;
  cursorTokens: number;
  favoriteModel: string;
  lastActive: string;
}

// Build tool breakdown from summary data
function getToolBreakdownFromSummary(user: UserSummary) {
  const tools = [];
  if (user.claudeCodeTokens > 0) {
    tools.push({ tool: 'claude_code', value: Number(user.claudeCodeTokens) });
  }
  if (user.cursorTokens > 0) {
    tools.push({ tool: 'cursor', value: Number(user.cursorTokens) });
  }
  return tools.sort((a, b) => b.value - a.value);
}

interface UserTableProps {
  users: UserSummary[];
  onUserClick?: (email: string) => void; // Deprecated, use UserLink context
  days?: number;
}

export function UserTable({ users, days = DEFAULT_DAYS }: UserTableProps) {
  return (
    <AnimatedCard delay={0.7} responsivePadding>
      <div className="mb-4 flex items-center justify-between">
        <SectionLabel days={days}>Top Users</SectionLabel>
        <AppLink
          href="/team"
          className="p-1 rounded hover:bg-white/5 text-white/40 hover:text-amber-400 transition-colors"
          aria-label="View all"
        >
          <ArrowRight className="w-4 h-4" />
        </AppLink>
      </div>
      <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
        <table className="w-full min-w-[400px]">
          <thead>
            <tr className="border-b border-white/10">
              <th className="pb-2 pr-2 text-left text-xs font-medium uppercase tracking-wider text-white/50 w-8 sm:w-10">#</th>
              <th className="pb-2 pr-3 text-left text-xs font-medium uppercase tracking-wider text-white/50">User</th>
              <th className="pb-2 pr-3 text-right text-xs font-medium uppercase tracking-wider text-white/50 w-20 sm:w-24">Tokens</th>
              <th className="pb-2 pr-3 text-right text-xs font-medium uppercase tracking-wider text-white/50 w-16 sm:w-20">Cost</th>
              <th className="pb-2 pr-3 text-left text-xs font-medium uppercase tracking-wider text-white/50 w-20 sm:w-28 hidden sm:table-cell">Split</th>
              <th className="pb-2 text-left text-xs font-medium uppercase tracking-wider text-white/50 w-24 hidden md:table-cell">Model</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user, i) => (
              <motion.tr
                key={user.email}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 + i * 0.03 }}
                className="group border-b border-white/5 transition-colors hover:bg-white/[0.02]"
              >
                <td className="py-2.5 sm:py-3 pr-2 w-8 sm:w-10">
                  <span className="font-mono text-xs text-faint">{i + 1}</span>
                </td>
                <td className="py-2.5 sm:py-3 pr-3">
                  <UserLink
                    email={user.email}
                    className="text-sm text-white truncate block max-w-[140px] sm:max-w-[200px] lg:max-w-[280px]"
                  />
                </td>
                <td className="py-2.5 sm:py-3 pr-3 text-right w-20 sm:w-24">
                  <span className="font-mono text-sm text-muted">{formatTokens(user.totalTokens)}</span>
                </td>
                <td className="py-2.5 sm:py-3 pr-3 text-right w-16 sm:w-20">
                  <span className="font-mono text-sm text-muted">{formatCurrency(user.totalCost)}</span>
                </td>
                <td className="py-2.5 sm:py-3 pr-3 hidden sm:table-cell w-20 sm:w-28">
                  <ToolSplitBar
                    data={getToolBreakdownFromSummary(user)}
                    total={Number(user.totalTokens)}
                    valueType="tokens"
                  />
                </td>
                <td className="py-2.5 sm:py-3 hidden md:table-cell w-24">
                  <span className="text-xs text-muted truncate block">
                    {user.favoriteModel.replace('claude-', '').split('-').slice(0, 2).join('-')}
                  </span>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </AnimatedCard>
  );
}
