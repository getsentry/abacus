'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { formatTokens, formatCurrency } from '@/lib/utils';

interface UserSummary {
  email: string;
  totalTokens: number;
  totalCost: number;
  claudeCodeTokens: number;
  cursorTokens: number;
  favoriteModel: string;
  lastActive: string;
}

interface UserTableProps {
  users: UserSummary[];
  onUserClick: (email: string) => void;
}

export function UserTable({ users, onUserClick }: UserTableProps) {
  return (
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
        <Link
          href="/users"
          className="font-mono text-xs text-amber-500 hover:text-amber-400 transition-colors"
        >
          View All →
        </Link>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/10">
              <th className="pb-2 pr-4 text-left font-mono text-[10px] uppercase tracking-wider text-white/40">Rank</th>
              <th className="pb-2 pr-4 text-left font-mono text-[10px] uppercase tracking-wider text-white/40">User</th>
              <th className="pb-2 pr-4 text-right font-mono text-[10px] uppercase tracking-wider text-white/40">Tokens</th>
              <th className="pb-2 pr-4 text-right font-mono text-[10px] uppercase tracking-wider text-white/40">Cost</th>
              <th className="pb-2 pr-4 text-left font-mono text-[10px] uppercase tracking-wider text-white/40">Distribution</th>
              <th className="pb-2 text-left font-mono text-[10px] uppercase tracking-wider text-white/40">Top Model</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user, i) => (
              <motion.tr
                key={user.email}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 + i * 0.03 }}
                onClick={() => onUserClick(user.email)}
                className="group cursor-pointer border-b border-white/5 transition-colors hover:bg-white/[0.02]"
              >
                <td className="py-3 pr-4">
                  <span className="font-mono text-xs text-white/30">#{i + 1}</span>
                </td>
                <td className="py-3 pr-4">
                  <p className="font-mono text-sm text-white group-hover:text-amber-400 transition-colors truncate max-w-[200px]">
                    {user.email.split('@')[0]}
                  </p>
                </td>
                <td className="py-3 pr-4 text-right">
                  <span className="font-mono text-sm text-white/80">{formatTokens(user.totalTokens)}</span>
                </td>
                <td className="py-3 pr-4 text-right">
                  <span className="font-mono text-sm text-white/60">{formatCurrency(user.totalCost)}</span>
                </td>
                <td className="py-3 pr-4">
                  <div className="flex gap-0.5 w-24">
                    {user.totalTokens > 0 && (
                      <>
                        <div
                          className="h-2 rounded-l bg-amber-500"
                          style={{ width: `${(user.claudeCodeTokens / user.totalTokens) * 100}%` }}
                        />
                        <div
                          className="h-2 rounded-r bg-cyan-500"
                          style={{ width: `${(user.cursorTokens / user.totalTokens) * 100}%` }}
                        />
                      </>
                    )}
                  </div>
                </td>
                <td className="py-3">
                  <span className="font-mono text-[10px] text-white/40 truncate max-w-[100px] block">
                    {user.favoriteModel.replace('claude-', '').split('-').slice(0, 2).join('-')}
                  </span>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}
