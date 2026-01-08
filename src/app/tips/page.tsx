'use client';

import { Suspense } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Compass, RefreshCw, Command, MapPin, Cpu, MessageSquare, GitBranch, Users, FileCode, Plug } from 'lucide-react';
import { AppLink } from '@/components/AppLink';
import { AppHeader } from '@/components/AppHeader';
import { TipBar } from '@/components/TipBar';
import { PageContainer } from '@/components/PageContainer';
import { GUIDES } from '@/lib/tips';

const GUIDE_ICONS: Record<string, typeof Compass> = {
  'subagents': Users,
  'compaction': RefreshCw,
  'skills': Command,
  'plan-mode': MapPin,
  'model-selection': Cpu,
  'context-management': MessageSquare,
  'git-workflow': GitBranch,
  'multi-agent': Users,
  'project-config': FileCode,
  'mcp': Plug,
};

const GUIDE_COLORS: Record<string, { bg: string; border: string; text: string; glow: string }> = {
  'subagents': { bg: 'bg-violet-500/10', border: 'border-violet-500/20', text: 'text-violet-400', glow: 'group-hover:shadow-violet-500/10' },
  'compaction': { bg: 'bg-blue-500/10', border: 'border-blue-500/20', text: 'text-blue-400', glow: 'group-hover:shadow-blue-500/10' },
  'skills': { bg: 'bg-amber-500/10', border: 'border-amber-500/20', text: 'text-amber-400', glow: 'group-hover:shadow-amber-500/10' },
  'plan-mode': { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-400', glow: 'group-hover:shadow-emerald-500/10' },
  'model-selection': { bg: 'bg-rose-500/10', border: 'border-rose-500/20', text: 'text-rose-400', glow: 'group-hover:shadow-rose-500/10' },
  'context-management': { bg: 'bg-cyan-500/10', border: 'border-cyan-500/20', text: 'text-cyan-400', glow: 'group-hover:shadow-cyan-500/10' },
  'git-workflow': { bg: 'bg-orange-500/10', border: 'border-orange-500/20', text: 'text-orange-400', glow: 'group-hover:shadow-orange-500/10' },
  'multi-agent': { bg: 'bg-pink-500/10', border: 'border-pink-500/20', text: 'text-pink-400', glow: 'group-hover:shadow-pink-500/10' },
  'project-config': { bg: 'bg-teal-500/10', border: 'border-teal-500/20', text: 'text-teal-400', glow: 'group-hover:shadow-teal-500/10' },
  'mcp': { bg: 'bg-indigo-500/10', border: 'border-indigo-500/20', text: 'text-indigo-400', glow: 'group-hover:shadow-indigo-500/10' },
};

// Categorize guides
const CATEGORIES = [
  {
    name: 'Getting Started',
    description: 'Fundamentals for effective AI-assisted coding',
    guides: ['context-management', 'model-selection', 'git-workflow'],
  },
  {
    name: 'Power Features',
    description: 'Advanced capabilities to boost your workflow',
    guides: ['plan-mode', 'subagents', 'skills', 'mcp'],
  },
  {
    name: 'Scaling Up',
    description: 'Optimize for larger projects and teams',
    guides: ['compaction', 'multi-agent', 'project-config'],
  },
];

const TOOL_LABELS = {
  'claude-code': 'Claude Code',
  'cursor': 'Cursor',
} as const;

function TipsIndexContent() {
  return (
    <div className="min-h-screen bg-[#050507] text-white grid-bg">
      {/* Gradient background */}
      <div className="fixed inset-0 bg-gradient-to-br from-amber-500/[0.02] via-transparent to-cyan-500/[0.02] pointer-events-none" />

      <AppHeader />

      <TipBar />

      {/* Main Content */}
      <main className="relative z-10 py-4 sm:py-8">
        <PageContainer>
          {/* Page Header */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-10"
          >
            <h1 className="font-display text-3xl sm:text-4xl text-white mb-3">
              AI Productivity Tips
            </h1>
            <p className="font-mono text-sm text-white/50 leading-relaxed max-w-2xl">
              Practical guides for getting the most out of Claude Code and Cursor.
              Each guide includes real examples you can try immediately.
            </p>
          </motion.div>

          <div className="space-y-12">
          {CATEGORIES.map((category, categoryIndex) => (
            <motion.section
              key={category.name}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: categoryIndex * 0.1 }}
            >
              {/* Category Header */}
              <div className="mb-4">
                <h2 className="font-display text-lg text-white mb-1">{category.name}</h2>
                <p className="font-mono text-xs text-white/40">{category.description}</p>
              </div>

              {/* Guide Grid */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {category.guides.map((slug, guideIndex) => {
                  const guide = GUIDES[slug];
                  if (!guide) return null;

                  const Icon = GUIDE_ICONS[slug] || Compass;
                  const colors = GUIDE_COLORS[slug] || GUIDE_COLORS['subagents'];

                  return (
                    <motion.div
                      key={slug}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: categoryIndex * 0.1 + guideIndex * 0.05 }}
                    >
                      <AppLink
                        href={`/tips/${slug}`}
                        skipDays
                        className={`
                          group block p-4 rounded-lg border transition-all duration-200
                          ${colors.bg} ${colors.border}
                          hover:border-white/20 hover:shadow-lg ${colors.glow}
                        `}
                      >
                        {/* Icon and Title */}
                        <div className="flex items-start gap-3 mb-3">
                          <div className={`p-2 rounded-lg ${colors.bg} border ${colors.border}`}>
                            <Icon className={`w-4 h-4 ${colors.text}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-display text-base text-white group-hover:text-white/90 transition-colors">
                              {guide.title}
                            </h3>
                            <p className="font-mono text-[11px] text-white/40 mt-0.5 line-clamp-2">
                              {guide.description}
                            </p>
                          </div>
                        </div>

                        {/* Footer */}
                        <div className="flex items-center justify-between">
                          {/* Tool badges */}
                          <div className="flex gap-1">
                            {guide.tools.map(tool => (
                              <span
                                key={tool}
                                className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-faint"
                              >
                                {TOOL_LABELS[tool]}
                              </span>
                            ))}
                          </div>

                          {/* Arrow */}
                          <ArrowRight className={`w-3.5 h-3.5 ${colors.text} opacity-0 group-hover:opacity-100 transition-opacity`} />
                        </div>
                      </AppLink>
                    </motion.div>
                  );
                })}
              </div>
            </motion.section>
          ))}
          </div>
        </PageContainer>
      </main>
    </div>
  );
}

export default function TipsIndexPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#050507] text-white flex items-center justify-center">
        <div className="font-mono text-sm text-white/40">Loading...</div>
      </div>
    }>
      <TipsIndexContent />
    </Suspense>
  );
}
