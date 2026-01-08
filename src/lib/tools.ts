// Tool configuration - extensible for future tools
// All color classes must be complete Tailwind classes (no string concatenation)
// to ensure they're included in the production build.

export interface ToolConfig {
  /** Display name */
  name: string;
  /** Solid background class (e.g., 'bg-amber-500') */
  bg: string;
  /** Semi-transparent background for charts (e.g., 'bg-amber-500/80') */
  bgChart: string;
  /** Text color class (e.g., 'text-amber-400') */
  text: string;
  /** Gradient classes for special effects */
  gradient: string;
}

// GitHub Copilot config
const COPILOT_CONFIG: ToolConfig = {
  name: 'GitHub Copilot',
  bg: 'bg-sky-500',
  bgChart: 'bg-sky-500/80',
  text: 'text-sky-400',
  gradient: 'from-sky-500/80 to-sky-400/60',
};

// OpenAI Codex config
const CODEX_CONFIG: ToolConfig = {
  name: 'Codex',
  bg: 'bg-teal-500',
  bgChart: 'bg-teal-500/80',
  text: 'text-teal-400',
  gradient: 'from-teal-500/80 to-teal-400/60',
};

export const TOOL_CONFIGS: Record<string, ToolConfig> = {
  claude_code: {
    name: 'Claude Code',
    bg: 'bg-amber-500',
    bgChart: 'bg-amber-500/80',
    text: 'text-amber-400',
    gradient: 'from-amber-500/80 to-amber-400/60',
  },
  cursor: {
    name: 'Cursor',
    bg: 'bg-cyan-500',
    bgChart: 'bg-cyan-500/80',
    text: 'text-cyan-400',
    gradient: 'from-cyan-500/80 to-cyan-400/60',
  },
  windsurf: {
    name: 'Windsurf',
    bg: 'bg-emerald-500',
    bgChart: 'bg-emerald-500/80',
    text: 'text-emerald-400',
    gradient: 'from-emerald-500/80 to-emerald-400/60',
  },
  github_copilot: COPILOT_CONFIG,
  // OpenAI Codex
  codex: CODEX_CONFIG,
};

/** Config for non-AI/human commits */
export const HUMAN_CONFIG = {
  name: 'Human',
  bg: 'bg-white/20',
  bgChart: 'bg-white/10',
  text: 'text-white/50',
} as const;

const DEFAULT_CONFIG: ToolConfig = {
  name: 'Unknown',
  bg: 'bg-rose-500',
  bgChart: 'bg-rose-500/80',
  text: 'text-rose-400',
  gradient: 'from-rose-500/80 to-rose-400/60',
};

export function getToolConfig(tool: string): ToolConfig {
  return TOOL_CONFIGS[tool] || { ...DEFAULT_CONFIG, name: formatToolName(tool) };
}

export function formatToolName(tool: string): string {
  if (TOOL_CONFIGS[tool]) {
    return TOOL_CONFIGS[tool].name;
  }
  return tool.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

export interface ToolBreakdown {
  tool: string;
  tokens: number;
  cost: number;
  percentage: number;
}

// Calculate tool breakdown from model data
export function calculateToolBreakdown(
  modelBreakdown: { tool: string; tokens: number; cost: number }[]
): ToolBreakdown[] {
  const byTool = modelBreakdown.reduce((acc, m) => {
    if (!acc[m.tool]) {
      acc[m.tool] = { tokens: 0, cost: 0 };
    }
    acc[m.tool].tokens += Number(m.tokens);
    acc[m.tool].cost += Number(m.cost);
    return acc;
  }, {} as Record<string, { tokens: number; cost: number }>);

  const total = Object.values(byTool).reduce((sum, t) => sum + t.tokens, 0);

  return Object.entries(byTool)
    .map(([tool, { tokens, cost }]) => ({
      tool,
      tokens,
      cost,
      percentage: total > 0 ? (tokens / total) * 100 : 0,
    }))
    .sort((a, b) => b.tokens - a.tokens);
}
