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

      expect(getAnthropicKeys()).toEqual([{ key: 'sk-single-key', name: 'default' }]);
    });

    it('parses single key from ANTHROPIC_ADMIN_KEYS', () => {
      process.env.ANTHROPIC_ADMIN_KEYS = 'sk-key-1';

      expect(getAnthropicKeys()).toEqual([{ key: 'sk-key-1', name: 'default' }]);
    });

    it('parses comma-separated keys from ANTHROPIC_ADMIN_KEYS', () => {
      process.env.ANTHROPIC_ADMIN_KEYS = 'sk-key-1,sk-key-2,sk-key-3';

      expect(getAnthropicKeys()).toEqual([
        { key: 'sk-key-1', name: 'KEY_1' },
        { key: 'sk-key-2', name: 'KEY_2' },
        { key: 'sk-key-3', name: 'KEY_3' },
      ]);
    });

    it('trims whitespace from keys', () => {
      process.env.ANTHROPIC_ADMIN_KEYS = ' sk-key-1 , sk-key-2 ';

      expect(getAnthropicKeys()).toEqual([
        { key: 'sk-key-1', name: 'KEY_1' },
        { key: 'sk-key-2', name: 'KEY_2' },
      ]);
    });

    it('ignores empty entries', () => {
      process.env.ANTHROPIC_ADMIN_KEYS = 'sk-key-1,,sk-key-2,';

      expect(getAnthropicKeys()).toEqual([
        { key: 'sk-key-1', name: 'KEY_1' },
        { key: 'sk-key-2', name: 'KEY_2' },
      ]);
    });

    it('prefers ANTHROPIC_ADMIN_KEYS over ANTHROPIC_ADMIN_KEY', () => {
      process.env.ANTHROPIC_ADMIN_KEY = 'sk-single-key';
      process.env.ANTHROPIC_ADMIN_KEYS = 'sk-multi-key';

      expect(getAnthropicKeys()).toEqual([{ key: 'sk-multi-key', name: 'default' }]);
    });

    it('returns empty array when ANTHROPIC_ADMIN_KEYS is empty string', () => {
      process.env.ANTHROPIC_ADMIN_KEYS = '';

      expect(getAnthropicKeys()).toEqual([]);
    });

    it('returns empty array when ANTHROPIC_ADMIN_KEYS is only whitespace/commas', () => {
      process.env.ANTHROPIC_ADMIN_KEYS = ' , , ';

      expect(getAnthropicKeys()).toEqual([]);
    });
  });

  describe('getCursorKeys', () => {
    it('returns empty array when no keys configured', () => {
      expect(getCursorKeys()).toEqual([]);
    });

    it('returns single key with default name when CURSOR_ADMIN_KEY set', () => {
      process.env.CURSOR_ADMIN_KEY = 'cursor-single-key';

      expect(getCursorKeys()).toEqual([{ key: 'cursor-single-key', name: 'default' }]);
    });

    it('parses comma-separated keys from CURSOR_ADMIN_KEYS', () => {
      process.env.CURSOR_ADMIN_KEYS = 'cursor-key-1,cursor-key-2';

      expect(getCursorKeys()).toEqual([
        { key: 'cursor-key-1', name: 'KEY_1' },
        { key: 'cursor-key-2', name: 'KEY_2' },
      ]);
    });

    it('prefers CURSOR_ADMIN_KEYS over CURSOR_ADMIN_KEY', () => {
      process.env.CURSOR_ADMIN_KEY = 'cursor-single-key';
      process.env.CURSOR_ADMIN_KEYS = 'cursor-multi-key';

      expect(getCursorKeys()).toEqual([{ key: 'cursor-multi-key', name: 'default' }]);
    });
  });
});
