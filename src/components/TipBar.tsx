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

  const wrapperClasses = "border-b border-white/5 bg-gradient-to-r from-amber-500/[0.03] via-transparent to-transparent";
  const contentClasses = "py-2 flex items-center gap-3";
  const linkClasses = "text-amber-500/60 hover:text-amber-400 transition-colors inline-flex items-center gap-0.5";

  const TipContent = () => (
    <>
      {/* Indicator */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="w-1.5 h-1.5 rounded-full bg-amber-500/60" />
        <Lightbulb className="w-3.5 h-3.5 text-amber-500/50" />
      </div>

      {/* Tip text */}
      <p className="font-mono text-xs flex-1 min-w-0 text-muted">
        <span className="text-amber-500/60 mr-1.5">tip:</span>
        <span>{tip.text}</span>
        {hasGuide && (
          <>
            <span className="mx-1.5">—</span>
            <AppLink href={`/tips/${tip.guide}`} skipDays className={linkClasses}>
              Learn more <ArrowRight className="w-3 h-3" />
            </AppLink>
          </>
        )}
        {hasExternalUrl && (
          <>
            <span className="mx-1.5">—</span>
            <a href={tip.externalUrl} target="_blank" rel="noopener noreferrer" className={linkClasses}>
              Learn more <ArrowRight className="w-3 h-3" />
            </a>
          </>
        )}
      </p>
    </>
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className={wrapperClasses}
    >
      <PageContainer className={contentClasses}>
        <TipContent />
      </PageContainer>
    </motion.div>
  );
}
