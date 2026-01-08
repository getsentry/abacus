// Tool configuration - extensible for future tools

export interface ToolConfig {
  name: string;
  bg: string;
  text: string;
  gradient: string;
}

export const TOOL_CONFIGS: Record<string, ToolConfig> = {
  claude_code: {
    name: 'Claude Code',
    bg: 'bg-amber-500',
    text: 'text-amber-400',
    gradient: 'from-amber-500/80 to-amber-400/60',
  },
  cursor: {
    name: 'Cursor',
    bg: 'bg-cyan-500',
    text: 'text-cyan-400',
    gradient: 'from-cyan-500/80 to-cyan-400/60',
  },
  windsurf: {
    name: 'Windsurf',
    bg: 'bg-emerald-500',
    text: 'text-emerald-400',
    gradient: 'from-emerald-500/80 to-emerald-400/60',
  },
  copilot: {
    name: 'Copilot',
    bg: 'bg-violet-500',
    text: 'text-violet-400',
    gradient: 'from-violet-500/80 to-violet-400/60',
  },
  openai: {
    name: 'OpenAI',
    bg: 'bg-green-500',
    text: 'text-green-400',
    gradient: 'from-green-500/80 to-green-400/60',
  },
};

const DEFAULT_CONFIG: ToolConfig = {
  name: 'Unknown',
  bg: 'bg-rose-500',
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
