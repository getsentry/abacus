'use client';

import { motion } from 'framer-motion';
import { AppLink } from '@/components/AppLink';
import { PageContainer } from '@/components/PageContainer';
import { formatTokens, formatCurrency } from '@/lib/utils';

interface UserProfileHeaderProps {
  email: string;
  lifetime: {
    totalCost: number;
    totalTokens: number;
    firstRecordDate: string | null;
    favoriteTool: string | null;
    recordDay: { date: string; tokens: number } | null;
  } | null;
  days: number;
}

const TOOL_COLORS: Record<string, { bg: string; text: string }> = {
  claude_code: { bg: 'bg-amber-500', text: 'text-amber-400' },
  cursor: { bg: 'bg-cyan-500', text: 'text-cyan-400' },
  windsurf: { bg: 'bg-emerald-500', text: 'text-emerald-400' },
  github_copilot: { bg: 'bg-sky-500', text: 'text-sky-400' },
  codex: { bg: 'bg-teal-500', text: 'text-teal-400' },
  default: { bg: 'bg-rose-500', text: 'text-rose-400' },
};

function getToolColor(tool: string) {
  return TOOL_COLORS[tool] || TOOL_COLORS.default;
}

function formatToolName(tool: string): string {
  const names: Record<string, string> = {
    claude_code: 'Claude Code',
    cursor: 'Cursor',
    windsurf: 'Windsurf',
    github_copilot: 'GitHub Copilot',
    codex: 'Codex',
  };
  return names[tool] || tool.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function formatSinceDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const month = date.toLocaleString('en-US', { month: 'short' });
  const year = date.getFullYear().toString().slice(-2);
  return `since ${month} '${year}`;
}

export function UserProfileHeader({ email, lifetime, days }: UserProfileHeaderProps) {
  return (
    <div className="border-b border-white/5 bg-gradient-to-b from-white/[0.02] to-transparent">
      <PageContainer className="py-6 sm:py-8">
        {/* Back Link */}
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
        >
          <AppLink
            href="/users"
            className="inline-flex items-center gap-2 font-mono text-xs text-white/40 hover:text-white/70 transition-colors group"
          >
            <span className="group-hover:-translate-x-0.5 transition-transform">&larr;</span>
            <span>Back to Users</span>
          </AppLink>
        </motion.div>

        {/* User Identity */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="mt-4"
        >
          <h1 className="font-display text-2xl sm:text-3xl font-light text-white tracking-tight">
            {email}
          </h1>

          {/* Decorative line */}
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="h-px bg-gradient-to-r from-amber-500/50 via-amber-500/20 to-transparent mt-3 origin-left max-w-md"
          />
        </motion.div>

        {/* Lifetime Stats */}
        {lifetime && lifetime.totalTokens > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.25 }}
            className="mt-5 flex items-center gap-8 sm:gap-12 flex-wrap"
          >
            <div>
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-faint block mb-1">
                Lifetime Tokens
              </span>
              <span className="font-display text-xl sm:text-2xl font-light text-white">
                {formatTokens(lifetime.totalTokens)}
              </span>
            </div>

            <div className="w-px h-10 bg-white/10 hidden sm:block" />

            <div>
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-faint block mb-1">
                Lifetime Spend
              </span>
              <span className="font-display text-xl sm:text-2xl font-light text-white">
                {formatCurrency(lifetime.totalCost)}
              </span>
            </div>

            {lifetime.favoriteTool && (
              <>
                <div className="w-px h-10 bg-white/10 hidden sm:block" />
                <div className="hidden sm:block">
                  <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-faint block mb-1">
                    Preferred Tool
                  </span>
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${getToolColor(lifetime.favoriteTool).bg}`} />
                    <span className={`font-mono text-sm ${getToolColor(lifetime.favoriteTool).text}`}>
                      {formatToolName(lifetime.favoriteTool)}
                    </span>
                  </div>
                </div>
              </>
            )}

            {lifetime.recordDay && (
              <>
                <div className="w-px h-10 bg-white/10 hidden sm:block" />
                <div className="hidden sm:block">
                  <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-faint block mb-1">
                    Record Day
                  </span>
                  <span className="font-mono text-sm text-white/60">
                    {formatTokens(lifetime.recordDay.tokens)} tokens
                  </span>
                </div>
              </>
            )}

            {lifetime.firstRecordDate && (
              <>
                <div className="w-px h-10 bg-white/10 hidden lg:block" />
                <div className="hidden lg:block">
                  <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-faint block mb-1">
                    Tracking
                  </span>
                  <span className="font-mono text-sm text-white/60">
                    {formatSinceDate(lifetime.firstRecordDate)}
                  </span>
                </div>
              </>
            )}
          </motion.div>
        )}
      </PageContainer>
    </div>
  );
}
