import { describe, it, expect, beforeEach } from 'vitest';
import {
  getOpenRouterWorkspaces,
  getOpenRouterWorkspaceKey,
  getOpenRouterWorkspaceNames,
  NO_OPENROUTER_WORKSPACES_ERROR,
} from './openrouter-workspaces';

describe('getOpenRouterWorkspaces', () => {
  beforeEach(() => {
    delete process.env.OPENROUTER_MANAGEMENT_KEYS;
    delete process.env.OPENROUTER_MANAGEMENT_KEY;
  });

  it('returns [] when neither env var is set (ISC-2 / error-free empty)', () => {
    const result = getOpenRouterWorkspaces();
    expect(result).toEqual([]);
  });

  it('exports NO_OPENROUTER_WORKSPACES_ERROR with both env var names', () => {
    expect(NO_OPENROUTER_WORKSPACES_ERROR).toContain('OPENROUTER_MANAGEMENT_KEY');
    expect(NO_OPENROUTER_WORKSPACES_ERROR).toContain('OPENROUTER_MANAGEMENT_KEYS');
  });

  it('parses JSON map and returns workspaces in insertion order (ISC-1)', () => {
    process.env.OPENROUTER_MANAGEMENT_KEYS = JSON.stringify({
      'Coding Agents': 'sk-or-key1',
      Tools: 'sk-or-key2',
    });

    const result = getOpenRouterWorkspaces();

    expect(result).toEqual([
      { name: 'Coding Agents', key: 'sk-or-key1' },
      { name: 'Tools', key: 'sk-or-key2' },
    ]);
  });

  it('preserves declaration order for more than two workspaces', () => {
    process.env.OPENROUTER_MANAGEMENT_KEYS = JSON.stringify({
      Alpha: 'k1',
      Beta: 'k2',
      Gamma: 'k3',
    });

    const result = getOpenRouterWorkspaces();

    expect(result.map((w) => w.name)).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  it('falls back to singular OPENROUTER_MANAGEMENT_KEY → [{name:"default",key}] (ISC-2)', () => {
    process.env.OPENROUTER_MANAGEMENT_KEY = 'sk-or-single';

    const result = getOpenRouterWorkspaces();

    expect(result).toEqual([{ name: 'default', key: 'sk-or-single' }]);
  });

  it('plural wins when both vars are set', () => {
    process.env.OPENROUTER_MANAGEMENT_KEYS = JSON.stringify({ A: 'k1', B: 'k2' });
    process.env.OPENROUTER_MANAGEMENT_KEY = 'sk-or-should-not-use';

    const result = getOpenRouterWorkspaces();

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('A');
  });

  it('throws on malformed JSON', () => {
    process.env.OPENROUTER_MANAGEMENT_KEYS = 'not-json';

    expect(() => getOpenRouterWorkspaces()).toThrow('OPENROUTER_MANAGEMENT_KEYS is not valid JSON');
  });

  it('throws when JSON is an array (not an object)', () => {
    process.env.OPENROUTER_MANAGEMENT_KEYS = '["sk-or-key"]';

    expect(() => getOpenRouterWorkspaces()).toThrow('must be a JSON object');
  });

  it('throws when JSON is a primitive', () => {
    process.env.OPENROUTER_MANAGEMENT_KEYS = '"just-a-string"';

    expect(() => getOpenRouterWorkspaces()).toThrow('must be a JSON object');
  });

  it('throws on empty workspace name', () => {
    process.env.OPENROUTER_MANAGEMENT_KEYS = JSON.stringify({ '': 'sk-or-key' });

    expect(() => getOpenRouterWorkspaces()).toThrow('workspace names must be non-empty');
  });

  it('throws on empty string value', () => {
    process.env.OPENROUTER_MANAGEMENT_KEYS = JSON.stringify({ Workspace: '' });

    expect(() => getOpenRouterWorkspaces()).toThrow('must be a non-empty string');
  });

  it('throws on non-string value', () => {
    process.env.OPENROUTER_MANAGEMENT_KEYS = JSON.stringify({ Workspace: 123 });

    expect(() => getOpenRouterWorkspaces()).toThrow('must be a non-empty string');
  });
});

describe('getOpenRouterWorkspaceKey', () => {
  beforeEach(() => {
    delete process.env.OPENROUTER_MANAGEMENT_KEYS;
    delete process.env.OPENROUTER_MANAGEMENT_KEY;
  });

  it('returns the key for a configured workspace', () => {
    process.env.OPENROUTER_MANAGEMENT_KEYS = JSON.stringify({
      'Coding Agents': 'sk-or-key1',
      Tools: 'sk-or-key2',
    });

    expect(getOpenRouterWorkspaceKey('Coding Agents')).toBe('sk-or-key1');
    expect(getOpenRouterWorkspaceKey('Tools')).toBe('sk-or-key2');
  });

  it('throws listing configured names when workspace is not found (ISC-9/10)', () => {
    process.env.OPENROUTER_MANAGEMENT_KEYS = JSON.stringify({
      'Coding Agents': 'sk-or-key1',
      Tools: 'sk-or-key2',
    });

    expect(() => getOpenRouterWorkspaceKey('Nope')).toThrow(
      'OpenRouter workspace "Nope" is not configured (configured: Coding Agents, Tools)'
    );
  });

  it('throws with "none" when no workspaces are configured', () => {
    expect(() => getOpenRouterWorkspaceKey('anything')).toThrow(
      'OpenRouter workspace "anything" is not configured (configured: none)'
    );
  });

  it('returns key via fallback singular env var', () => {
    process.env.OPENROUTER_MANAGEMENT_KEY = 'sk-or-single';

    expect(getOpenRouterWorkspaceKey('default')).toBe('sk-or-single');
  });
});

describe('getOpenRouterWorkspaceNames', () => {
  beforeEach(() => {
    delete process.env.OPENROUTER_MANAGEMENT_KEYS;
    delete process.env.OPENROUTER_MANAGEMENT_KEY;
  });

  it('returns names in declaration order', () => {
    process.env.OPENROUTER_MANAGEMENT_KEYS = JSON.stringify({ A: 'k1', B: 'k2', C: 'k3' });

    expect(getOpenRouterWorkspaceNames()).toEqual(['A', 'B', 'C']);
  });

  it('returns ["default"] for singular fallback', () => {
    process.env.OPENROUTER_MANAGEMENT_KEY = 'sk-or-key';

    expect(getOpenRouterWorkspaceNames()).toEqual(['default']);
  });

  it('returns [] when nothing configured', () => {
    expect(getOpenRouterWorkspaceNames()).toEqual([]);
  });
});
