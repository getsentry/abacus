'use client';

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Activity, TrendingUp, Cpu, Users } from 'lucide-react';
import { StatCard } from '@/components/StatCard';
import { AppHeader } from '@/components/AppHeader';
import { TimeRangeSelector } from '@/components/TimeRangeSelector';
import { TipBar } from '@/components/TipBar';
import { PageContainer } from '@/components/PageContainer';
import { LoadingBar } from '@/components/LoadingBar';
import { LoadingState, ErrorState } from '@/components/PageState';
import { AnimatedCard, Card } from '@/components/Card';
import { SectionLabel } from '@/components/SectionLabel';
import { TrendLine } from '@/components/TrendLine';
import { TooltipContent } from '@/components/Tooltip';
import { ExportButton } from '@/components/ExportButton';
import { ToolSplitBar, type ToolSplitData } from '@/components/ToolSplitBar';
import { useTimeRange } from '@/contexts/TimeRangeContext';
import { formatTokens, formatDate, formatCurrency } from '@/lib/utils';
import { getToolConfig, TOOL_CONFIGS } from '@/lib/tools';
import { aggregateToWeekly } from '@/lib/dateUtils';
import { calculateDelta } from '@/lib/comparison';
import { hasProjectedData } from '@/lib/projection';
import { InlineLegend } from '@/components/Legend';
import type { DailyUsage } from '@/lib/queries';

interface ModelTrendData {
  date: string;
  model: string;
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  tool: string;
}

interface ToolTrendData {
  date: string;
  tool: string;
  tokens: number;
  cost: number;
  users: number;
}

interface ModelBreakdown {
  model: string;
  tokens: number;
  percentage: number;
  tool: string;
}

interface Stats {
  totalTokens: number;
  totalCost: number;
  activeUsers: number;
  claudeCodeTokens: number;
  cursorTokens: number;
  claudeCodeUsers: number;
  cursorUsers: number;
  previousPeriod?: {
    totalTokens: number;
    totalCost: number;
    activeUsers: number;
  };
}

type ViewMode = 'models' | 'tools';

const AGGREGATION_THRESHOLD = 90;

// Curated color palette for models - designed for dark backgrounds
const MODEL_COLOR_PALETTE = [
  '#f59e0b', // amber-500
  '#8b5cf6', // violet-500
  '#06b6d4', // cyan-500
  '#10b981', // emerald-500
  '#f97316', // orange-500
  '#ec4899', // pink-500
  '#3b82f6', // blue-500
  '#84cc16', // lime-500
  '#ef4444', // red-500
  '#14b8a6', // teal-500
];

// Cache for model colors to ensure consistency across renders
const modelColorCache = new Map<string, string>();
let colorIndex = 0;

function getModelColor(model: string): string {
  if (!modelColorCache.has(model)) {
    modelColorCache.set(model, MODEL_COLOR_PALETTE[colorIndex % MODEL_COLOR_PALETTE.length]);
    colorIndex++;
  }
  return modelColorCache.get(model)!;
}

function formatModelName(model: string): string {
  return model
    .replace('claude-', '')
    .replace(/-\d{8}$/, '')
    .replace('-high-thinking', ' (HT)')
    .replace('-thinking', ' (T)');
}

function UsagePageContent() {
  const { range, setRange, days, isPending, getDateParams } = useTimeRange();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Get view mode from URL, default to 'models'
  const viewParam = searchParams.get('view');
  const viewMode: ViewMode = viewParam === 'tools' ? 'tools' : 'models';

  const setViewMode = useCallback((view: ViewMode) => {
    const params = new URLSearchParams(searchParams.toString());
    if (view === 'models') {
      params.delete('view'); // Default, don't need in URL
    } else {
      params.set('view', view);
    }
    router.push(`/usage?${params.toString()}`, { scroll: false });
  }, [router, searchParams]);

  const [modelTrends, setModelTrends] = useState<ModelTrendData[]>([]);
  const [toolTrends, setToolTrends] = useState<ToolTrendData[]>([]);
  const [dailyUsage, setDailyUsage] = useState<DailyUsage[]>([]);
  const [modelBreakdown, setModelBreakdown] = useState<ModelBreakdown[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTrend, setShowTrend] = useState(true);

  const isRefreshing = isPending || (loading && stats !== null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { startDate, endDate } = getDateParams();
      const [modelTrendsRes, toolTrendsRes, trendsRes, modelsRes, statsRes] = await Promise.all([
        fetch(`/api/models/trends?startDate=${startDate}&endDate=${endDate}&view=models`),
        fetch(`/api/models/trends?startDate=${startDate}&endDate=${endDate}&view=tools`),
        fetch(`/api/trends?startDate=${startDate}&endDate=${endDate}`),
        fetch(`/api/models?startDate=${startDate}&endDate=${endDate}`),
        fetch(`/api/stats?startDate=${startDate}&endDate=${endDate}&comparison=true`),
      ]);

      if (!modelTrendsRes.ok || !toolTrendsRes.ok || !trendsRes.ok || !modelsRes.ok || !statsRes.ok) {
        throw new Error('Failed to fetch usage data');
      }

      const [modelTrendsData, toolTrendsData, trendsData, modelsData, statsData] = await Promise.all([
        modelTrendsRes.json(),
        toolTrendsRes.json(),
        trendsRes.json(),
        modelsRes.json(),
        statsRes.json(),
      ]);

      setModelTrends(modelTrendsData.trends || []);
      setToolTrends(toolTrendsData.trends || []);
      setDailyUsage(trendsData.data || []);
      setModelBreakdown(modelsData.models || modelsData || []);
      setStats(statsData);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch data';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [getDateParams]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Process model trends into chart data
  const modelChartData = useMemo(() => {
    if (!modelTrends.length) return { data: [] as Array<Record<string, number | string>>, models: [] as string[] };

    // Group by date, aggregate by model
    const dateMap = new Map<string, Map<string, number>>();
    const modelSet = new Set<string>();

    for (const item of modelTrends) {
      modelSet.add(item.model);
      if (!dateMap.has(item.date)) {
        dateMap.set(item.date, new Map());
      }
      const modelMap = dateMap.get(item.date)!;
      modelMap.set(item.model, (modelMap.get(item.model) || 0) + Number(item.tokens));
    }

    // Get top models by total tokens
    const modelTotals = new Map<string, number>();
    for (const [, modelMap] of dateMap) {
      for (const [model, tokens] of modelMap) {
        modelTotals.set(model, (modelTotals.get(model) || 0) + tokens);
      }
    }
    const topModels = Array.from(modelTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([model]) => model);

    // Create chart data
    const data: Array<Record<string, number | string>> = Array.from(dateMap.entries())
      .map(([date, modelMap]) => ({
        date,
        ...Object.fromEntries(topModels.map(m => [m, modelMap.get(m) || 0])),
        total: Array.from(modelMap.values()).reduce((a, b) => a + b, 0),
      }))
      .sort((a, b) => (a.date as string).localeCompare(b.date as string));

    return { data, models: topModels };
  }, [modelTrends]);

  // Use dailyUsage for tool chart data (with projections already applied)
  const toolChartData = useMemo(() => {
    return dailyUsage;
  }, [dailyUsage]);

  // Apply weekly aggregation if needed
  const { chartData: toolDataFinal, isWeekly } = useMemo(() => {
    if (toolChartData.length > AGGREGATION_THRESHOLD) {
      return { chartData: aggregateToWeekly(toolChartData), isWeekly: true };
    }
    return { chartData: toolChartData, isWeekly: false };
  }, [toolChartData]);

  // Calculate totals for trend line
  const toolTotalValues = useMemo(
    () => toolDataFinal.map(d => Number(d.claudeCode) + Number(d.cursor)),
    [toolDataFinal]
  );

  const maxToolValue = Math.max(...toolTotalValues, 1);

  // Check if we have projected data in tools view
  // Don't show projected legend for weekly data since projections don't aggregate meaningfully
  const showToolProjectedLegend = useMemo(() => !isWeekly && hasProjectedData(toolDataFinal), [isWeekly, toolDataFinal]);

  // Aggregate model breakdown by model (combining tools)
  interface AggregatedModel {
    model: string;
    totalTokens: number;
    percentage: number;
    tools: ToolSplitData[];
  }

  const aggregatedModels = useMemo((): AggregatedModel[] => {
    if (!modelBreakdown.length) return [];

    // Group by model
    const modelMap = new Map<string, { totalTokens: number; tools: Map<string, number> }>();

    for (const item of modelBreakdown) {
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
      percentage: Math.round((item.totalTokens / maxTokens) * 100),
    }));
  }, [modelBreakdown]);

  // Model chart max value
  const maxModelValue = useMemo(() => {
    if (!modelChartData.data.length) return 1;
    return Math.max(...modelChartData.data.map(d => Number(d.total) || 0), 1);
  }, [modelChartData]);

  // Process tool trends into user chart data for Tool Adoption section
  const toolUserChartData = useMemo(() => {
    if (!toolTrends.length) return [];

    // Group by date, get users per tool
    const dateMap = new Map<string, { claudeCode: number; cursor: number }>();

    for (const item of toolTrends) {
      if (!dateMap.has(item.date)) {
        dateMap.set(item.date, { claudeCode: 0, cursor: 0 });
      }
      const dayData = dateMap.get(item.date)!;
      if (item.tool === 'claude_code') {
        dayData.claudeCode = Number(item.users);
      } else if (item.tool === 'cursor') {
        dayData.cursor = Number(item.users);
      }
    }

    return Array.from(dateMap.entries())
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [toolTrends]);

  // Apply weekly aggregation to user chart data if needed
  const toolUserDataFinal = useMemo(() => {
    if (toolUserChartData.length > AGGREGATION_THRESHOLD) {
      return aggregateToWeekly(toolUserChartData);
    }
    return toolUserChartData;
  }, [toolUserChartData]);

  // Max value for user chart
  const maxUserValue = useMemo(() => {
    if (!toolUserDataFinal.length) return 1;
    return Math.max(...toolUserDataFinal.map(d => d.claudeCode + d.cursor), 1);
  }, [toolUserDataFinal]);

  // Determine label frequency
  const maxLabels = 10;
  const chartDataLength = viewMode === 'models' ? modelChartData.data.length : toolDataFinal.length;
  const labelEvery = Math.max(1, Math.ceil(chartDataLength / maxLabels));

  // Get top model for stats
  const topModel = modelBreakdown.length > 0 ? modelBreakdown[0].model : 'N/A';

  return (
    <div className="min-h-screen bg-[#050507] text-white grid-bg">
      <LoadingBar isLoading={isRefreshing} />

      <AppHeader />

      <TipBar />

      {/* Page Title with Time Range Selector */}
      <div className="border-b border-white/5">
        <PageContainer className="py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-display text-2xl text-white">Usage</h1>
              <p className="font-mono text-xs text-muted mt-1">
                Model and tool usage breakdown over time
              </p>
            </div>
            <TimeRangeSelector value={range} onChange={setRange} isPending={isPending} />
          </div>
        </PageContainer>
      </div>

      {/* Main Content */}
      <main className={`relative z-10 py-4 sm:py-8 transition-opacity duration-300 ${
        isRefreshing ? 'opacity-60' : 'opacity-100'
      }`}>
        <PageContainer>
        {loading && !stats ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} />
        ) : stats && (
          <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-3">
              <StatCard
                label="Total Tokens"
                days={days}
                value={formatTokens(stats.totalTokens)}
                icon={Activity}
                accentColor="#f59e0b"
                trend={stats.previousPeriod ? calculateDelta(stats.totalTokens, stats.previousPeriod.totalTokens) : undefined}
                delay={0}
              />

              <StatCard
                label="Estimated Cost"
                days={days}
                value={formatCurrency(stats.totalCost)}
                icon={TrendingUp}
                accentColor="#10b981"
                trend={stats.previousPeriod ? calculateDelta(stats.totalCost, stats.previousPeriod.totalCost) : undefined}
                delay={0.1}
              />

              <StatCard
                label="Top Model"
                days={days}
                value={formatModelName(topModel)}
                icon={Cpu}
                accentColor="#8b5cf6"
                delay={0.2}
              >
                <p className="font-mono text-xs text-white/50">
                  {modelBreakdown.length > 0 ? formatTokens(modelBreakdown[0].tokens) : '0'} tokens
                </p>
              </StatCard>
            </div>

            {/* View Toggle and Export */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setViewMode('models')}
                  className={`px-3 py-1.5 rounded font-mono text-xs transition-all duration-200 cursor-pointer ${
                    viewMode === 'models'
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      : 'bg-white/5 text-white/40 border border-white/10 hover:bg-white/10 hover:text-white/60'
                  }`}
                >
                  Models
                </button>
                <button
                  onClick={() => setViewMode('tools')}
                  className={`px-3 py-1.5 rounded font-mono text-xs transition-all duration-200 cursor-pointer ${
                    viewMode === 'tools'
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      : 'bg-white/5 text-white/40 border border-white/10 hover:bg-white/10 hover:text-white/60'
                  }`}
                >
                  Tools
                </button>
              </div>
              <ExportButton type="usage" view={viewMode} />
            </div>

            {/* Chart */}
            <Card animate delay={0.3} padding="lg">
              <div className="mb-4 flex items-center justify-between">
                <SectionLabel days={days}>
                  {viewMode === 'models' ? 'Model Usage' : (isWeekly ? 'Weekly Usage' : 'Daily Usage')}
                </SectionLabel>
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => setShowTrend(!showTrend)}
                    className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-mono transition-colors cursor-pointer ${
                      showTrend
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                        : 'bg-white/5 text-white/40 border border-white/10 hover:bg-white/10'
                    }`}
                  >
                    <TrendingUp className="w-3 h-3" />
                    <span>Trend</span>
                  </button>
                  {viewMode === 'tools' ? (
                    <div className="flex items-center gap-4">
                      <InlineLegend
                        items={[
                          { key: 'claude_code', label: TOOL_CONFIGS.claude_code.name, value: formatTokens(toolDataFinal.reduce((s, d) => s + Number(d.claudeCode), 0)), textColor: TOOL_CONFIGS.claude_code.text },
                          { key: 'cursor', label: TOOL_CONFIGS.cursor.name, value: formatTokens(toolDataFinal.reduce((s, d) => s + Number(d.cursor), 0)), textColor: TOOL_CONFIGS.cursor.text },
                        ]}
                      />
                      {showToolProjectedLegend && (
                        <div className="flex items-center gap-1.5 text-xs text-white/40">
                          <div className="w-3 h-3 bg-white/20 bg-stripes rounded-sm" />
                          <span>Projected</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      {modelChartData.models.slice(0, 4).map(model => (
                        <div key={model} className="flex items-center gap-1.5">
                          <div
                            className="w-2 h-2 rounded-sm"
                            style={{ backgroundColor: getModelColor(model) }}
                          />
                          <span className="font-mono text-xs text-white/60">{formatModelName(model)}</span>
                        </div>
                      ))}
                      {modelChartData.models.length > 4 && (
                        <div className="relative group">
                          <span className="font-mono text-xs text-white/40 cursor-default">
                            +{modelChartData.models.length - 4} more
                          </span>
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-[#1a1a1c] border border-white/10 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 whitespace-nowrap">
                            {modelChartData.models.slice(4).map(model => (
                              <div key={model} className="flex items-center gap-1.5 py-0.5">
                                <div
                                  className="w-2 h-2 rounded-sm"
                                  style={{ backgroundColor: getModelColor(model) }}
                                />
                                <span className="font-mono text-xs text-white/60">{formatModelName(model)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="relative" style={{ height: '200px' }}>
                {viewMode === 'tools' ? (
                  // Tool view - stacked bar chart with projections
                  <>
                    {showTrend && <TrendLine values={toolTotalValues} maxValue={maxToolValue} />}
                    <div className="flex items-end gap-0.5 h-full">
                      {toolDataFinal.map((item, i) => {
                        // Calculate actual vs projected portions for each tool
                        // Skip projections for weekly data since aggregation doesn't preserve them meaningfully
                        const claudeTotal = Number(item.claudeCode);
                        const cursorTotal = Number(item.cursor);
                        const claudeActual = !isWeekly && item.projectedClaudeCode !== undefined ? item.projectedClaudeCode : claudeTotal;
                        const cursorActual = !isWeekly && item.projectedCursor !== undefined ? item.projectedCursor : cursorTotal;
                        const claudeProjectedPortion = claudeTotal - claudeActual;
                        const cursorProjectedPortion = cursorTotal - cursorActual;

                        // Heights as percentages of max
                        const claudeActualHeight = (claudeActual / maxToolValue) * 100;
                        const claudeProjectedHeight = (claudeProjectedPortion / maxToolValue) * 100;
                        const cursorActualHeight = (cursorActual / maxToolValue) * 100;
                        const cursorProjectedHeight = (cursorProjectedPortion / maxToolValue) * 100;

                        return (
                          <div key={item.date} className="group relative flex-1 flex flex-col justify-end min-w-[3px]" style={{ height: '100%' }}>
                            <div className="flex w-full flex-col gap-0.5 justify-end" style={{ height: '100%' }}>
                              {/* Claude Code - on top (projected portion above actual) */}
                              {claudeProjectedHeight > 0 && (
                                <motion.div
                                  initial={{ height: 0 }}
                                  animate={{ height: `${claudeProjectedHeight}%` }}
                                  transition={{ duration: 0.6, delay: Math.min(i * 0.02, 1) }}
                                  className="w-full rounded-t relative overflow-hidden bg-white/20"
                                  style={{ minHeight: '2px' }}
                                >
                                  <div className="absolute inset-0 bg-stripes" />
                                </motion.div>
                              )}
                              {claudeActualHeight > 0 && (
                                <motion.div
                                  initial={{ height: 0 }}
                                  animate={{ height: `${claudeActualHeight}%` }}
                                  transition={{ duration: 0.6, delay: Math.min(i * 0.02 + 0.01, 1) }}
                                  className={`w-full ${claudeProjectedHeight === 0 ? 'rounded-t' : ''} ${TOOL_CONFIGS.claude_code.bgChart}`}
                                  style={{ minHeight: '2px' }}
                                />
                              )}
                              {/* Cursor - on bottom (projected portion above actual) */}
                              {cursorProjectedHeight > 0 && (
                                <motion.div
                                  initial={{ height: 0 }}
                                  animate={{ height: `${cursorProjectedHeight}%` }}
                                  transition={{ duration: 0.6, delay: Math.min(i * 0.02 + 0.02, 1) }}
                                  className="w-full relative overflow-hidden bg-white/15"
                                  style={{ minHeight: '2px' }}
                                >
                                  <div className="absolute inset-0 bg-stripes" />
                                </motion.div>
                              )}
                              {cursorActualHeight > 0 && (
                                <motion.div
                                  initial={{ height: 0 }}
                                  animate={{ height: `${cursorActualHeight}%` }}
                                  transition={{ duration: 0.6, delay: Math.min(i * 0.02 + 0.03, 1) }}
                                  className={`w-full rounded-b ${TOOL_CONFIGS.cursor.bgChart}`}
                                  style={{ minHeight: '2px' }}
                                />
                              )}
                            </div>

                            {i % labelEvery === 0 && (
                              <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 font-mono text-[10px] text-muted whitespace-nowrap">
                                {formatDate(item.date)}
                              </span>
                            )}

                            <TooltipContent>
                              <div className="text-white/60 mb-2">{formatDate(item.date)}</div>

                              {/* Actual values section */}
                              <div className="mb-1">
                                <div className="text-white/40 text-xs uppercase tracking-wider mb-1">Actual</div>
                                <div className={TOOL_CONFIGS.claude_code.text}>
                                  {TOOL_CONFIGS.claude_code.name}: {formatTokens(claudeActual)}
                                </div>
                                <div className={TOOL_CONFIGS.cursor.text}>
                                  {TOOL_CONFIGS.cursor.name}: {formatTokens(cursorActual)}
                                </div>
                              </div>

                              {/* Projected values section - only show if there are projections */}
                              {(claudeProjectedPortion > 0 || cursorProjectedPortion > 0) && (
                                <div className="mb-1 mt-2 pt-2 border-t border-white/10">
                                  <div className="text-white/40 text-xs uppercase tracking-wider mb-1">Projected</div>
                                  {claudeProjectedPortion > 0 && (
                                    <div className="text-white/50">
                                      {TOOL_CONFIGS.claude_code.name}: +{formatTokens(claudeProjectedPortion)}
                                    </div>
                                  )}
                                  {cursorProjectedPortion > 0 && (
                                    <div className="text-white/50">
                                      {TOOL_CONFIGS.cursor.name}: +{formatTokens(cursorProjectedPortion)}
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Estimated from average indicator */}
                              {(item.projectedClaudeCode === 0 || item.projectedCursor === 0) && (
                                <div className="text-white/40 text-xs mt-2 pt-2 border-t border-white/10">
                                  Estimated from historical average
                                </div>
                              )}

                              {item.cost !== undefined && Number(item.cost) > 0 && (
                                <div className="text-emerald-400 mt-2 pt-2 border-t border-white/10">Cost: {formatCurrency(Number(item.cost))}</div>
                              )}
                            </TooltipContent>
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  // Model view - stacked bar chart by model
                  <>
                    {showTrend && <TrendLine values={modelChartData.data.map(d => d.total as number)} maxValue={maxModelValue} />}
                    <div className="flex items-end gap-0.5 h-full">
                      {modelChartData.data.map((item, i) => {
                        const dateStr = String(item.date);
                        return (
                          <div key={dateStr} className="group relative flex-1 flex flex-col justify-end min-w-[3px]" style={{ height: '100%' }}>
                            <div className="flex w-full flex-col gap-0.5 justify-end" style={{ height: '100%' }}>
                              {modelChartData.models.map((model, idx) => {
                                const tokens = (item[model] as number) || 0;
                                const height = (tokens / maxModelValue) * 100;
                                if (height <= 0) return null;
                                return (
                                  <motion.div
                                    key={model}
                                    initial={{ height: 0 }}
                                    animate={{ height: `${height}%` }}
                                    transition={{ duration: 0.6, delay: Math.min(i * 0.02 + idx * 0.01, 1) }}
                                    className="w-full"
                                    style={{
                                      minHeight: '2px',
                                      backgroundColor: getModelColor(model),
                                      borderRadius: idx === 0 ? '4px 4px 0 0' : idx === modelChartData.models.length - 1 ? '0 0 4px 4px' : '0',
                                    }}
                                  />
                                );
                              })}
                            </div>

                            {i % labelEvery === 0 && (
                              <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 font-mono text-[10px] text-muted whitespace-nowrap">
                                {formatDate(dateStr)}
                              </span>
                            )}

                            <TooltipContent>
                              <div className="text-white/60 mb-1">{formatDate(dateStr)}</div>
                              {modelChartData.models.map(model => {
                                const tokens = (item[model] as number) || 0;
                                if (tokens <= 0) return null;
                                return (
                                  <div key={model} style={{ color: getModelColor(model) }}>
                                    {formatModelName(model)}: {formatTokens(tokens)}
                                  </div>
                                );
                              })}
                            </TooltipContent>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>

              {/* X-axis line */}
              <div className="h-px bg-white/10 mt-1" />
            </Card>

            {/* Model Breakdown Table */}
            <AnimatedCard padding="none" className="overflow-hidden">
              <div className="px-6 py-4 border-b border-white/5">
                <SectionLabel days={days}>
                  {viewMode === 'models' ? 'Model Breakdown' : 'Tool Breakdown'}
                </SectionLabel>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/[0.02]">
                      <th className="px-6 py-3 text-left font-mono text-[11px] uppercase tracking-wider text-white/60">
                        {viewMode === 'models' ? 'Model' : 'Tool'}
                      </th>
                      <th className="px-6 py-3 text-right font-mono text-[11px] uppercase tracking-wider text-white/60">
                        Tokens
                      </th>
                      <th className="px-6 py-3 text-right font-mono text-[11px] uppercase tracking-wider text-white/60">
                        Cost
                      </th>
                      <th className="px-6 py-3 text-right font-mono text-[11px] uppercase tracking-wider text-white/60 w-16">
                        %
                      </th>
                      <th className="px-6 py-3 text-left font-mono text-[11px] uppercase tracking-wider text-white/60 w-1/4">
                        {viewMode === 'models' ? 'Tools' : 'Distribution'}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewMode === 'models' ? (
                      aggregatedModels.map((item) => {
                        // Calculate percentage of total for bar width
                        const totalAllModels = aggregatedModels.reduce((sum, m) => sum + m.totalTokens, 0);
                        const pctOfTotal = totalAllModels > 0 ? (item.totalTokens / totalAllModels) * 100 : 0;
                        // Estimate cost based on tool breakdown (rough approximation)
                        const estimatedCost = modelBreakdown
                          .filter(m => m.model === item.model)
                          .reduce((sum, m) => {
                            // Get cost from model trends if available
                            const trendCost = modelTrends
                              .filter(t => t.model === item.model)
                              .reduce((s, t) => s + Number(t.cost), 0);
                            return trendCost > 0 ? trendCost : sum;
                          }, 0);
                        return (
                          <tr
                            key={item.model}
                            className="border-b border-white/5 hover:bg-white/[0.02] transition-colors"
                          >
                            <td className="px-6 py-3">
                              <div className="flex items-center gap-2">
                                <div
                                  className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                                  style={{ backgroundColor: getModelColor(item.model) }}
                                />
                                <span className="font-mono text-sm text-white">{formatModelName(item.model)}</span>
                              </div>
                            </td>
                            <td className="px-6 py-3 text-right">
                              <span className="font-mono text-sm text-white/70">{formatTokens(item.totalTokens)}</span>
                            </td>
                            <td className="px-6 py-3 text-right">
                              <span className="font-mono text-sm text-white/70">{formatCurrency(estimatedCost)}</span>
                            </td>
                            <td className="px-6 py-3 text-right">
                              <span className="font-mono text-sm text-white/50">{Math.round(pctOfTotal)}%</span>
                            </td>
                            <td className="px-6 py-3">
                              <ToolSplitBar
                                data={item.tools}
                                total={item.totalTokens}
                                valueType="tokens"
                              />
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      // Tool breakdown - calculate costs from tool trends
                      (() => {
                        const claudeCodeCost = toolTrends
                          .filter(t => t.tool === 'claude_code')
                          .reduce((sum, t) => sum + Number(t.cost), 0);
                        const cursorCost = toolTrends
                          .filter(t => t.tool === 'cursor')
                          .reduce((sum, t) => sum + Number(t.cost), 0);
                        const claudePct = stats.totalTokens > 0 ? Math.round((stats.claudeCodeTokens / stats.totalTokens) * 100) : 0;
                        const cursorPct = stats.totalTokens > 0 ? Math.round((stats.cursorTokens / stats.totalTokens) * 100) : 0;
                        return (
                          <>
                            <tr className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                              <td className="px-6 py-3">
                                <span className={`font-mono text-sm ${TOOL_CONFIGS.claude_code.text}`}>Claude Code</span>
                              </td>
                              <td className="px-6 py-3 text-right">
                                <span className="font-mono text-sm text-white/70">{formatTokens(stats.claudeCodeTokens)}</span>
                              </td>
                              <td className="px-6 py-3 text-right">
                                <span className="font-mono text-sm text-white/70">{formatCurrency(claudeCodeCost)}</span>
                              </td>
                              <td className="px-6 py-3 text-right">
                                <span className="font-mono text-sm text-white/50">{claudePct}%</span>
                              </td>
                              <td className="px-6 py-3">
                                <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                                  <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${claudePct}%` }}
                                    transition={{ duration: 0.6 }}
                                    className={`h-full rounded-full ${TOOL_CONFIGS.claude_code.bg}`}
                                  />
                                </div>
                              </td>
                            </tr>
                            <tr className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                              <td className="px-6 py-3">
                                <span className={`font-mono text-sm ${TOOL_CONFIGS.cursor.text}`}>Cursor</span>
                              </td>
                              <td className="px-6 py-3 text-right">
                                <span className="font-mono text-sm text-white/70">{formatTokens(stats.cursorTokens)}</span>
                              </td>
                              <td className="px-6 py-3 text-right">
                                <span className="font-mono text-sm text-white/70">{formatCurrency(cursorCost)}</span>
                              </td>
                              <td className="px-6 py-3 text-right">
                                <span className="font-mono text-sm text-white/50">{cursorPct}%</span>
                              </td>
                              <td className="px-6 py-3">
                                <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                                  <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${cursorPct}%` }}
                                    transition={{ duration: 0.6, delay: 0.05 }}
                                    className={`h-full rounded-full ${TOOL_CONFIGS.cursor.bg}`}
                                  />
                                </div>
                              </td>
                            </tr>
                          </>
                        );
                      })()
                    )}
                  </tbody>
                </table>
              </div>
            </AnimatedCard>

            {/* Tool Adoption Section - Only show in tools view */}
            {viewMode === 'tools' && stats && toolUserDataFinal.length > 0 && (
              <AnimatedCard delay={0.5} padding="none" className="overflow-hidden">
                <div className="px-6 py-4 border-b border-white/5">
                  <SectionLabel days={days}>Active Users by Tool</SectionLabel>
                </div>

                {/* Active Users Over Time Chart */}
                <div className="px-6 py-4">
                  <div className="flex items-center justify-end gap-4 mb-4">
                    <div className="flex items-center gap-1.5">
                      <div className={`w-2 h-2 rounded-sm ${TOOL_CONFIGS.claude_code.bg}`} />
                      <span className={`font-mono text-xs ${TOOL_CONFIGS.claude_code.text}`}>
                        Claude Code: {stats.claudeCodeUsers} users
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className={`w-2 h-2 rounded-sm ${TOOL_CONFIGS.cursor.bg}`} />
                      <span className={`font-mono text-xs ${TOOL_CONFIGS.cursor.text}`}>
                        Cursor: {stats.cursorUsers} users
                      </span>
                    </div>
                  </div>

                  <div className="relative" style={{ height: '150px' }}>
                    <div className="flex items-end gap-0.5 h-full">
                      {toolUserDataFinal.map((item, i) => {
                        const claudeHeight = maxUserValue > 0 ? (item.claudeCode / maxUserValue) * 100 : 0;
                        const cursorHeight = maxUserValue > 0 ? (item.cursor / maxUserValue) * 100 : 0;
                        const userLabelEvery = Math.max(1, Math.ceil(toolUserDataFinal.length / maxLabels));

                        return (
                          <div key={item.date} className="group relative flex-1 flex flex-col justify-end min-w-[3px]" style={{ height: '100%' }}>
                            <div className="flex w-full flex-col gap-0.5 justify-end" style={{ height: '100%' }}>
                              {claudeHeight > 0 && (
                                <motion.div
                                  initial={{ height: 0 }}
                                  animate={{ height: `${claudeHeight}%` }}
                                  transition={{ duration: 0.6, delay: Math.min(i * 0.02, 1) }}
                                  className={`w-full rounded-t ${TOOL_CONFIGS.claude_code.bgChart}`}
                                  style={{ minHeight: '2px' }}
                                />
                              )}
                              {cursorHeight > 0 && (
                                <motion.div
                                  initial={{ height: 0 }}
                                  animate={{ height: `${cursorHeight}%` }}
                                  transition={{ duration: 0.6, delay: Math.min(i * 0.02 + 0.02, 1) }}
                                  className={`w-full rounded-b ${TOOL_CONFIGS.cursor.bgChart}`}
                                  style={{ minHeight: '2px' }}
                                />
                              )}
                            </div>

                            {i % userLabelEvery === 0 && (
                              <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 font-mono text-[10px] text-muted whitespace-nowrap">
                                {formatDate(item.date)}
                              </span>
                            )}

                            <TooltipContent>
                              <div className="text-white/60 mb-1">{formatDate(item.date)}</div>
                              <div className={TOOL_CONFIGS.claude_code.text}>Claude Code: {item.claudeCode} users</div>
                              <div className={TOOL_CONFIGS.cursor.text}>Cursor: {item.cursor} users</div>
                            </TooltipContent>
                          </div>
                        );
                      })}
                    </div>
                    <div className="h-px bg-white/10 mt-1" />
                  </div>
                </div>

                {/* Tool Adoption Summary Table */}
                <div className="border-t border-white/5">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-white/10 bg-white/[0.02]">
                        <th className="px-6 py-3 text-left font-mono text-[11px] uppercase tracking-wider text-white/60">
                          Tool
                        </th>
                        <th className="px-6 py-3 text-right font-mono text-[11px] uppercase tracking-wider text-white/60">
                          <div className="flex items-center justify-end gap-1">
                            <Users className="w-3 h-3" />
                            <span>Active Users</span>
                          </div>
                        </th>
                        <th className="px-6 py-3 text-right font-mono text-[11px] uppercase tracking-wider text-white/60">
                          Avg Tokens/User
                        </th>
                        <th className="px-6 py-3 text-left font-mono text-[11px] uppercase tracking-wider text-white/60 w-1/4">
                          User Distribution
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.claudeCodeUsers > 0 && (
                        <tr className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                          <td className="px-6 py-3">
                            <span className={`font-mono text-sm ${TOOL_CONFIGS.claude_code.text}`}>Claude Code</span>
                          </td>
                          <td className="px-6 py-3 text-right">
                            <span className="font-mono text-sm text-white">{stats.claudeCodeUsers}</span>
                          </td>
                          <td className="px-6 py-3 text-right">
                            <span className="font-mono text-sm text-white/70">
                              {formatTokens(Math.round(stats.claudeCodeTokens / stats.claudeCodeUsers))}
                            </span>
                          </td>
                          <td className="px-6 py-3">
                            <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${stats.activeUsers > 0 ? (stats.claudeCodeUsers / stats.activeUsers) * 100 : 0}%` }}
                                transition={{ duration: 0.6 }}
                                className={`h-full rounded-full ${TOOL_CONFIGS.claude_code.bg}`}
                              />
                            </div>
                          </td>
                        </tr>
                      )}
                      {stats.cursorUsers > 0 && (
                        <tr className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                          <td className="px-6 py-3">
                            <span className={`font-mono text-sm ${TOOL_CONFIGS.cursor.text}`}>Cursor</span>
                          </td>
                          <td className="px-6 py-3 text-right">
                            <span className="font-mono text-sm text-white">{stats.cursorUsers}</span>
                          </td>
                          <td className="px-6 py-3 text-right">
                            <span className="font-mono text-sm text-white/70">
                              {formatTokens(Math.round(stats.cursorTokens / stats.cursorUsers))}
                            </span>
                          </td>
                          <td className="px-6 py-3">
                            <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${stats.activeUsers > 0 ? (stats.cursorUsers / stats.activeUsers) * 100 : 0}%` }}
                                transition={{ duration: 0.6, delay: 0.05 }}
                                className={`h-full rounded-full ${TOOL_CONFIGS.cursor.bg}`}
                              />
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </AnimatedCard>
            )}
          </div>
        )}
        </PageContainer>
      </main>
    </div>
  );
}

export default function UsagePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#050507] text-white grid-bg flex items-center justify-center">
        <div className="font-mono text-sm text-white/40">Loading...</div>
      </div>
    }>
      <UsagePageContent />
    </Suspense>
  );
}
