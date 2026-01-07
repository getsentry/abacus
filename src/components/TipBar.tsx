'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Lightbulb, ArrowRight } from 'lucide-react';
import { AppLink } from './AppLink';
import { PageContainer } from './PageContainer';
import { getRandomTip, type Tip } from '@/lib/tips';

export function TipBar() {
  const [tip, setTip] = useState<Tip | null>(null);

  useEffect(() => {
    // Random tip on each mount/load
    setTip(getRandomTip());
  }, []);

  // Don't render on server to avoid hydration mismatch
  if (!tip) return null;

  const hasGuide = !!tip.guide;
  const hasExternalUrl = !!tip.externalUrl && !tip.guide;

  // Shared tip content
  const TipContent = () => (
    <>
      {/* Indicator */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="w-1.5 h-1.5 rounded-full bg-amber-500/60" />
        <Lightbulb className="w-3.5 h-3.5 text-amber-500/50" />
      </div>

      {/* Tip text */}
      <p className="font-mono text-[11px] flex-1 min-w-0">
        <span className="text-amber-500/40 mr-1.5">tip:</span>
        <span className="tip-text">{tip.text}</span>
        {(hasGuide || hasExternalUrl) && (
          <span className="tip-action ml-1.5 inline-flex items-center gap-0.5">
            <span>— Learn more</span>
            <ArrowRight className="w-3 h-3 inline" />
          </span>
        )}
      </p>
    </>
  );

  const wrapperClasses = "border-b border-white/5 bg-gradient-to-r from-amber-500/[0.03] via-transparent to-transparent";
  const contentClasses = "py-2 flex items-center gap-3";

  if (hasGuide) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className={wrapperClasses}
      >
        <AppLink
          href={`/tips/${tip.guide}`}
          skipDays
          className="block group cursor-pointer
            [&_.tip-text]:text-white/40 [&_.tip-text]:group-hover:text-white/60
            [&_.tip-action]:text-amber-500/40 [&_.tip-action]:group-hover:text-amber-400
            transition-colors"
        >
          <PageContainer className={contentClasses}>
            <TipContent />
          </PageContainer>
        </AppLink>
      </motion.div>
    );
  }

  if (hasExternalUrl) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className={wrapperClasses}
      >
        <a
          href={tip.externalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block group cursor-pointer
            [&_.tip-text]:text-white/40 [&_.tip-text]:group-hover:text-white/60
            [&_.tip-action]:text-amber-500/40 [&_.tip-action]:group-hover:text-amber-400
            transition-colors"
        >
          <PageContainer className={contentClasses}>
            <TipContent />
          </PageContainer>
        </a>
      </motion.div>
    );
  }

  // Non-clickable tip
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className={wrapperClasses}
    >
      <PageContainer className={`${contentClasses} [&_.tip-text]:text-white/40`}>
        <TipContent />
      </PageContainer>
    </motion.div>
  );
}
