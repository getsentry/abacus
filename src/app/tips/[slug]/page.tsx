'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { ExternalLink, Compass, RefreshCw, Command, MapPin, Cpu, MessageSquare, GitBranch, Users, FileCode, Plug } from 'lucide-react';
import { AppLink } from '@/components/AppLink';
import { AppHeader } from '@/components/AppHeader';
import { TipBar } from '@/components/TipBar';
import { PageContainer } from '@/components/PageContainer';
import { getGuide } from '@/lib/tips';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

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

const TOOL_LABELS = {
  'claude-code': { label: 'Claude Code', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  'cursor': { label: 'Cursor', color: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' },
} as const;

function GuideContent() {
  const params = useParams();
  const slug = params.slug as string;
  const guide = getGuide(slug);

  if (!guide) {
    return (
      <div className="min-h-screen bg-[#050507] text-white grid-bg">
        <AppHeader />

        <TipBar />

        <div className="flex h-64 items-center justify-center">
          <div className="text-center">
            <p className="font-mono text-sm text-white/40 mb-4">Guide not found</p>
            <AppLink
              href="/tips"
              className="font-mono text-xs text-amber-500/70 hover:text-amber-400 transition-colors"
            >
              ← Back to tips
            </AppLink>
          </div>
        </div>
      </div>
    );
  }

  const Icon = GUIDE_ICONS[slug] || Compass;

  return (
    <div className="min-h-screen bg-[#050507] text-white grid-bg">
      {/* Subtle gradient background */}
      <div className="fixed inset-0 bg-gradient-to-b from-amber-500/[0.02] via-transparent to-transparent pointer-events-none" />

      <AppHeader />

      <TipBar />

      {/* Content */}
      <main className="relative pt-8 sm:pt-12 pb-16 sm:pb-24">
        <PageContainer>
        <div className="max-w-2xl mx-auto">
        {/* Back Link */}
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
          className="mb-6"
        >
          <AppLink
            href="/tips"
            skipDays
            className="inline-flex items-center gap-2 font-mono text-xs text-white/40 hover:text-white/70 transition-colors group"
          >
            <span className="group-hover:-translate-x-0.5 transition-transform">&larr;</span>
            <span>All Tips</span>
          </AppLink>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          {/* Hero section */}
          <div className="mb-8 pb-6 border-b border-white/5">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-500/5 border border-amber-500/20 shrink-0">
                <Icon className="w-6 h-6 text-amber-500" />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="font-display text-2xl sm:text-3xl text-white mb-1">{guide.title}</h1>
                <p className="font-mono text-sm text-white/50">{guide.description}</p>
              </div>
            </div>

            {/* Tool badges */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[11px] text-faint uppercase tracking-wider">Works with:</span>
              {guide.tools.map(tool => (
                <span
                  key={tool}
                  className={`inline-flex items-center px-2 py-0.5 rounded border font-mono text-[11px] ${TOOL_LABELS[tool].color}`}
                >
                  {TOOL_LABELS[tool].label}
                </span>
              ))}
            </div>
          </div>

          {/* External docs link */}
          {guide.externalDocs && (
            <a
              href={guide.externalDocs}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 font-mono text-xs text-amber-500/70 hover:text-amber-400 transition-colors mb-8 group"
            >
              <ExternalLink className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              View official documentation
            </a>
          )}

          {/* Guide content with proper markdown styling */}
          <article className="guide-content">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h2: ({ children }) => (
                  <h2 className="font-display text-lg text-white/90 mt-10 mb-4 first:mt-0 flex items-center gap-2">
                    <span className="w-1 h-5 bg-amber-500/50 rounded-full" />
                    {children}
                  </h2>
                ),
                h3: ({ children }) => (
                  <h3 className="font-display text-base text-white/90 mt-6 mb-3">{children}</h3>
                ),
                p: ({ children }) => (
                  <p className="font-mono text-[13px] text-white/60 leading-relaxed mb-4">{children}</p>
                ),
                ul: ({ children }) => (
                  <ul className="space-y-2 mb-4 ml-4">{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol className="space-y-2 mb-4 ml-4 list-decimal">{children}</ol>
                ),
                li: ({ children }) => (
                  <li className="font-mono text-[13px] text-white/60 leading-relaxed pl-1">
                    <span className="text-amber-500/50 mr-2">•</span>
                    {children}
                  </li>
                ),
                strong: ({ children }) => (
                  <strong className="text-white/90 font-medium">{children}</strong>
                ),
                code: ({ className, children }) => {
                  // Check if this is inside a pre (code block) or inline
                  const isInline = !className;
                  if (isInline) {
                    return (
                      <code className="text-amber-400/80 bg-amber-500/10 px-1.5 py-0.5 rounded font-mono text-xs">
                        {children}
                      </code>
                    );
                  }
                  // For code blocks, just return children - pre handles the styling
                  return <code className="font-mono text-xs text-amber-300/80 leading-relaxed whitespace-pre">{children}</code>;
                },
                pre: ({ children }) => (
                  <pre className="bg-white/[0.03] border border-white/5 rounded-lg p-4 mb-4 overflow-x-auto font-mono text-xs text-amber-300/80 leading-relaxed whitespace-pre">
                    {children}
                  </pre>
                ),
                table: ({ children }) => (
                  <div className="mb-4 overflow-x-auto">
                    <table className="w-full font-mono text-xs border-collapse">
                      {children}
                    </table>
                  </div>
                ),
                thead: ({ children }) => (
                  <thead className="border-b border-white/10">{children}</thead>
                ),
                tbody: ({ children }) => (
                  <tbody className="divide-y divide-white/5">{children}</tbody>
                ),
                tr: ({ children }) => (
                  <tr>{children}</tr>
                ),
                th: ({ children }) => (
                  <th className="text-left py-2 px-3 text-white/60 font-normal">{children}</th>
                ),
                td: ({ children }) => (
                  <td className="py-2 px-3 text-white/50">{children}</td>
                ),
                a: ({ href, children }) => (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-amber-500/70 hover:text-amber-400 underline underline-offset-2 transition-colors"
                  >
                    {children}
                  </a>
                ),
              }}
            >
              {guide.content}
            </ReactMarkdown>
          </article>
        </motion.div>
        </div>
        </PageContainer>
      </main>
    </div>
  );
}

export default function GuidePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#050507] text-white flex items-center justify-center">
        <div className="font-mono text-sm text-white/40">Loading...</div>
      </div>
    }>
      <GuideContent />
    </Suspense>
  );
}
