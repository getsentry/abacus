'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { formatTokens } from '@/lib/utils';
import { getToolConfig } from '@/lib/tools';
import { Card } from '@/components/Card';
import { SectionLabel } from '@/components/SectionLabel';
import { AppLink } from '@/components/AppLink';

interface ModelData {
  model: string;
  tokens: number;
  percentage: number;
  tool: string;
}

interface ModelBreakdownProps {
  data: ModelData[];
  days?: number;
}

function formatModelName(model: string): string {
  // Shorten model names for display
  return model
    .replace('claude-', '')
    .replace('-20251001', '')
    .replace('-20250929', '')
    .replace('-20250514', '')
    .replace('-20250805', '')
    .replace('-20251101', '')
    .replace('-20241022', '')
    .replace('-high-thinking', ' (HT)')
    .replace('-thinking', ' (T)');
}

export function ModelBreakdown({ data, days }: ModelBreakdownProps) {
  // Aggregate data by model, combining tools
  const aggregatedModels = useMemo(() => {
    const modelMap = new Map<string, { totalTokens: number; tools: Map<string, number> }>();

    for (const item of data) {
      const existing = modelMap.get(item.model);
      if (existing) {
        existing.totalTokens += item.tokens;
        existing.tools.set(item.tool, (existing.tools.get(item.tool) || 0) + item.tokens);
      } else {
        modelMap.set(item.model, {
          totalTokens: item.tokens,
          tools: new Map([[item.tool, item.tokens]]),
        });
      }
    }

    // Convert to array and sort by total tokens
    const sorted = Array.from(modelMap.entries())
      .map(([model, data]) => ({
        model,
        totalTokens: data.totalTokens,
        tools: Array.from(data.tools.entries())
          .map(([tool, value]) => ({ tool, value }))
          .sort((a, b) => b.value - a.value),
      }))
      .sort((a, b) => b.totalTokens - a.totalTokens);

    // Calculate percentages based on max
    const maxTokens = sorted[0]?.totalTokens || 1;
    return sorted.map(item => ({
      ...item,
      percentage: (item.totalTokens / maxTokens) * 100,
    }));
  }, [data]);

  return (
    <Card animate delay={0.5} padding="lg" className="h-full">
      <div className="mb-4 flex items-center justify-between">
        <SectionLabel days={days}>Model Distribution</SectionLabel>
        <AppLink
          href="/usage"
          className="p-1 rounded hover:bg-white/5 text-white/40 hover:text-amber-400 transition-colors"
          aria-label="View more"
        >
          <ArrowRight className="w-4 h-4" />
        </AppLink>
      </div>
      <div className="space-y-3">
        {aggregatedModels.slice(0, 6).map((m, i) => (
          <motion.div
            key={m.model}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.6 + i * 0.05 }}
            className="group"
          >
            <div className="mb-1 flex items-center justify-between">
              <span className="text-sm text-white/70 group-hover:text-white transition-colors truncate max-w-[140px]">
                {formatModelName(m.model)}
              </span>
              <span className="font-mono text-sm text-white/40">
                {formatTokens(m.totalTokens)}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/5">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${m.percentage}%` }}
                transition={{ duration: 0.8, delay: 0.7 + i * 0.05 }}
                className="h-full rounded-full overflow-hidden flex"
              >
                {m.tools.map((tool, idx) => {
                  const config = getToolConfig(tool.tool);
                  const pct = (tool.value / m.totalTokens) * 100;
                  return (
                    <div
                      key={tool.tool}
                      className={`h-full ${config.bg}`}
                      style={{ width: `${pct}%` }}
                    />
                  );
                })}
              </motion.div>
            </div>
          </motion.div>
        ))}
      </div>
    </Card>
  );
}
