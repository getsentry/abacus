import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getAnthropicKeys, getCursorKeys } from './provider-keys';

describe('provider-keys', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env.ANTHROPIC_ADMIN_KEY;
    delete process.env.ANTHROPIC_ADMIN_KEYS;
    delete process.env.CURSOR_ADMIN_KEY;
    delete process.env.CURSOR_ADMIN_KEYS;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getAnthropicKeys', () => {
    it('returns empty array when no keys configured', () => {
      expect(getAnthropicKeys()).toEqual([]);
    });

    it('returns single key with default name when ANTHROPIC_ADMIN_KEY set', () => {
      process.env.ANTHROPIC_ADMIN_KEY = 'sk-single-key';

      expect(getAnthropicKeys()).toEqual([
        { key: 'sk-single-key', name: 'default' },
      ]);
    });

    it('parses ANTHROPIC_ADMIN_KEYS JSON array', () => {
      process.env.ANTHROPIC_ADMIN_KEYS = JSON.stringify([
        { key: 'sk-key-1', name: 'Org One' },
        { key: 'sk-key-2', name: 'Org Two' },
      ]);

      expect(getAnthropicKeys()).toEqual([
        { key: 'sk-key-1', name: 'Org One' },
        { key: 'sk-key-2', name: 'Org Two' },
      ]);
    });

    it('prefers ANTHROPIC_ADMIN_KEYS over ANTHROPIC_ADMIN_KEY', () => {
      process.env.ANTHROPIC_ADMIN_KEY = 'sk-single-key';
      process.env.ANTHROPIC_ADMIN_KEYS = JSON.stringify([
        { key: 'sk-multi-key', name: 'Multi Org' },
      ]);

      expect(getAnthropicKeys()).toEqual([
        { key: 'sk-multi-key', name: 'Multi Org' },
      ]);
    });

    it('falls back to single key when ANTHROPIC_ADMIN_KEYS is invalid JSON', () => {
      process.env.ANTHROPIC_ADMIN_KEY = 'sk-single-key';
      process.env.ANTHROPIC_ADMIN_KEYS = 'not-json';

      expect(getAnthropicKeys()).toEqual([
        { key: 'sk-single-key', name: 'default' },
      ]);
    });

    it('falls back to single key when ANTHROPIC_ADMIN_KEYS is not an array', () => {
      process.env.ANTHROPIC_ADMIN_KEY = 'sk-single-key';
      process.env.ANTHROPIC_ADMIN_KEYS = JSON.stringify({ key: 'test' });

      expect(getAnthropicKeys()).toEqual([
        { key: 'sk-single-key', name: 'default' },
      ]);
    });

    it('falls back to single key when ANTHROPIC_ADMIN_KEYS has invalid entries', () => {
      process.env.ANTHROPIC_ADMIN_KEY = 'sk-single-key';
      process.env.ANTHROPIC_ADMIN_KEYS = JSON.stringify([
        { key: 'sk-valid' }, // missing name
      ]);

      expect(getAnthropicKeys()).toEqual([
        { key: 'sk-single-key', name: 'default' },
      ]);
    });

    it('falls back to single key when ANTHROPIC_ADMIN_KEYS is empty array', () => {
      process.env.ANTHROPIC_ADMIN_KEY = 'sk-single-key';
      process.env.ANTHROPIC_ADMIN_KEYS = '[]';

      expect(getAnthropicKeys()).toEqual([
        { key: 'sk-single-key', name: 'default' },
      ]);
    });
  });

  describe('getCursorKeys', () => {
    it('returns empty array when no keys configured', () => {
      expect(getCursorKeys()).toEqual([]);
    });

    it('returns single key with default name when CURSOR_ADMIN_KEY set', () => {
      process.env.CURSOR_ADMIN_KEY = 'cursor-single-key';

      expect(getCursorKeys()).toEqual([
        { key: 'cursor-single-key', name: 'default' },
      ]);
    });

    it('parses CURSOR_ADMIN_KEYS JSON array', () => {
      process.env.CURSOR_ADMIN_KEYS = JSON.stringify([
        { key: 'cursor-key-1', name: 'Team One' },
        { key: 'cursor-key-2', name: 'Team Two' },
      ]);

      expect(getCursorKeys()).toEqual([
        { key: 'cursor-key-1', name: 'Team One' },
        { key: 'cursor-key-2', name: 'Team Two' },
      ]);
    });

    it('prefers CURSOR_ADMIN_KEYS over CURSOR_ADMIN_KEY', () => {
      process.env.CURSOR_ADMIN_KEY = 'cursor-single-key';
      process.env.CURSOR_ADMIN_KEYS = JSON.stringify([
        { key: 'cursor-multi-key', name: 'Multi Team' },
      ]);

      expect(getCursorKeys()).toEqual([
        { key: 'cursor-multi-key', name: 'Multi Team' },
      ]);
    });

    it('falls back to single key when CURSOR_ADMIN_KEYS is invalid', () => {
      process.env.CURSOR_ADMIN_KEY = 'cursor-single-key';
      process.env.CURSOR_ADMIN_KEYS = 'invalid';

      expect(getCursorKeys()).toEqual([
        { key: 'cursor-single-key', name: 'default' },
      ]);
    });
  });
});
