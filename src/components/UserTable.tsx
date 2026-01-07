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
  days?: number;
}

export function UserTable({ users, onUserClick, days = 30 }: UserTableProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.7 }}
      className="rounded-lg border border-white/5 bg-white/[0.02] p-4 sm:p-6"
    >
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-mono text-xs uppercase tracking-wider text-white/60">
          Top Users
        </h3>
        <Link
          href={`/users?days=${days}`}
          className="font-mono text-xs text-amber-500 hover:text-amber-400 transition-colors"
        >
          View All →
        </Link>
      </div>
      <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
        <table className="w-full min-w-[400px]">
          <thead>
            <tr className="border-b border-white/10">
              <th className="pb-2 pr-2 text-left font-mono text-[10px] uppercase tracking-wider text-white/40 w-8 sm:w-10">#</th>
              <th className="pb-2 pr-3 text-left font-mono text-[10px] uppercase tracking-wider text-white/40">User</th>
              <th className="pb-2 pr-3 text-right font-mono text-[10px] uppercase tracking-wider text-white/40 w-20 sm:w-24">Tokens</th>
              <th className="pb-2 pr-3 text-right font-mono text-[10px] uppercase tracking-wider text-white/40 w-16 sm:w-20">Cost</th>
              <th className="pb-2 pr-3 text-left font-mono text-[10px] uppercase tracking-wider text-white/40 w-20 sm:w-28 hidden sm:table-cell">Split</th>
              <th className="pb-2 text-left font-mono text-[10px] uppercase tracking-wider text-white/40 w-24 hidden md:table-cell">Model</th>
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
                <td className="py-2.5 sm:py-3 pr-2 w-8 sm:w-10">
                  <span className="font-mono text-[10px] sm:text-xs text-white/30">{i + 1}</span>
                </td>
                <td className="py-2.5 sm:py-3 pr-3">
                  <p className="font-mono text-xs sm:text-sm text-white group-hover:text-amber-400 transition-colors truncate max-w-[140px] sm:max-w-[200px] lg:max-w-[280px]">
                    {user.email}
                  </p>
                </td>
                <td className="py-2.5 sm:py-3 pr-3 text-right w-20 sm:w-24">
                  <span className="font-mono text-xs sm:text-sm text-white/80">{formatTokens(user.totalTokens)}</span>
                </td>
                <td className="py-2.5 sm:py-3 pr-3 text-right w-16 sm:w-20">
                  <span className="font-mono text-xs sm:text-sm text-white/60">{formatCurrency(user.totalCost)}</span>
                </td>
                <td className="py-2.5 sm:py-3 pr-3 hidden sm:table-cell w-20 sm:w-28">
                  <div className="group/dist relative flex gap-0.5 w-full">
                    {Number(user.totalTokens) > 0 && (
                      <>
                        <div
                          className="h-1.5 sm:h-2 rounded-l bg-amber-500"
                          style={{ width: `${(Number(user.claudeCodeTokens) / Number(user.totalTokens)) * 100}%` }}
                        />
                        <div
                          className="h-1.5 sm:h-2 rounded-r bg-cyan-500"
                          style={{ width: `${(Number(user.cursorTokens) / Number(user.totalTokens)) * 100}%` }}
                        />
                        {/* Tooltip */}
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/dist:block z-20 pointer-events-none">
                          <div className="rounded bg-black/95 px-2 py-1.5 text-[10px] whitespace-nowrap border border-white/10 shadow-lg">
                            <div className="text-amber-400">Claude Code: {formatTokens(user.claudeCodeTokens)} ({Math.round((Number(user.claudeCodeTokens) / Number(user.totalTokens)) * 100)}%)</div>
                            <div className="text-cyan-400">Cursor: {formatTokens(user.cursorTokens)} ({Math.round((Number(user.cursorTokens) / Number(user.totalTokens)) * 100)}%)</div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </td>
                <td className="py-2.5 sm:py-3 hidden md:table-cell w-24">
                  <span className="font-mono text-[10px] text-white/40 truncate block">
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
