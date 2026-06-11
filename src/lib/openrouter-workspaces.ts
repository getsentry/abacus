/**
 * OpenRouter workspace registry.
 *
 * Parses OPENROUTER_MANAGEMENT_KEYS (JSON object: name → management key) with
 * OPENROUTER_MANAGEMENT_KEY (single-key fallback). Zero imports from other
 * src/lib modules — pure env parsing, modelled on src/lib/sync/provider-keys.ts.
 */

export interface OpenRouterWorkspace {
  /** Human-readable workspace label, e.g. "Coding Agents" */
  name: string;
  /** Management key, sk-or-... */
  key: string;
}

export const NO_OPENROUTER_WORKSPACES_ERROR =
  'No OpenRouter management keys configured (set OPENROUTER_MANAGEMENT_KEY or OPENROUTER_MANAGEMENT_KEYS)';

function parseWorkspaces(raw: string): OpenRouterWorkspace[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`OPENROUTER_MANAGEMENT_KEYS is not valid JSON: ${raw}`);
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('OPENROUTER_MANAGEMENT_KEYS must be a JSON object (name → key map)');
  }

  return Object.entries(parsed as Record<string, unknown>).map(([name, key]) => {
    if (!name) {
      throw new Error('OPENROUTER_MANAGEMENT_KEYS: workspace names must be non-empty strings');
    }
    if (typeof key !== 'string' || !key) {
      throw new Error(
        `OPENROUTER_MANAGEMENT_KEYS: value for workspace "${name}" must be a non-empty string`
      );
    }
    return { name, key };
  });
}

/**
 * Return all configured OpenRouter workspaces in declaration order.
 * Checks OPENROUTER_MANAGEMENT_KEYS (JSON map) first, falls back to
 * OPENROUTER_MANAGEMENT_KEY (single key → workspace name "default").
 * Returns [] when neither env var is set; throws on malformed input.
 */
export function getOpenRouterWorkspaces(): OpenRouterWorkspace[] {
  const multi = process.env.OPENROUTER_MANAGEMENT_KEYS;
  if (multi) return parseWorkspaces(multi);
  const single = process.env.OPENROUTER_MANAGEMENT_KEY;
  if (single) return [{ name: 'default', key: single }];
  return [];
}

/**
 * Return the management key for the named workspace.
 * Throws if the workspace is not configured, listing all configured names.
 */
export function getOpenRouterWorkspaceKey(name: string): string {
  const ws = getOpenRouterWorkspaces();
  const match = ws.find((w) => w.name === name);
  if (!match) {
    const configured = ws.map((w) => w.name).join(', ') || 'none';
    throw new Error(
      `OpenRouter workspace "${name}" is not configured (configured: ${configured})`
    );
  }
  return match.key;
}

/** Convenience: workspace names in env declaration order. */
export function getOpenRouterWorkspaceNames(): string[] {
  return getOpenRouterWorkspaces().map((w) => w.name);
}
