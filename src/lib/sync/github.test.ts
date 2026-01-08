import { describe, it, expect } from 'vitest';
import { detectAiAttribution } from './github';

describe('detectAiAttribution', () => {
  describe('Claude Code detection', () => {
    it('detects Co-Authored-By with anthropic email', () => {
      const result = detectAiAttribution(
        'Fix bug\n\nCo-Authored-By: Claude <noreply@anthropic.com>'
      );
      expect(result).toEqual({ tool: 'claude_code', model: undefined });
    });

    it('extracts model name from Co-Authored-By', () => {
      const result = detectAiAttribution(
        'Add feature\n\nCo-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>'
      );
      expect(result).toEqual({ tool: 'claude_code', model: 'opus-4.5' });
    });

    it('extracts model with Sonnet', () => {
      const result = detectAiAttribution(
        'Refactor code\n\nCo-Authored-By: Claude Sonnet 4 <claude@anthropic.com>'
      );
      expect(result).toEqual({ tool: 'claude_code', model: 'sonnet-4' });
    });

    it('detects Generated with [Claude Code] markdown link', () => {
      const result = detectAiAttribution(
        '🤖 Generated with [Claude Code](https://claude.com/claude-code)'
      );
      expect(result).toEqual({ tool: 'claude_code', model: undefined });
    });

    it('detects "Generated with Claude" text', () => {
      const result = detectAiAttribution('Generated with Claude');
      expect(result).toEqual({ tool: 'claude_code', model: undefined });
    });

    it('detects "Written using Claude"', () => {
      const result = detectAiAttribution('Written using Claude for this task');
      expect(result).toEqual({ tool: 'claude_code', model: undefined });
    });

    it('detects "Assisted by Claude"', () => {
      const result = detectAiAttribution('Code assisted by Claude');
      expect(result).toEqual({ tool: 'claude_code', model: undefined });
    });

    it('is case insensitive', () => {
      const result = detectAiAttribution(
        'CO-AUTHORED-BY: CLAUDE <NOREPLY@ANTHROPIC.COM>'
      );
      expect(result).toEqual({ tool: 'claude_code', model: undefined });
    });
  });

  describe('GitHub Copilot detection', () => {
    it('detects Co-Authored-By: GitHub Copilot', () => {
      const result = detectAiAttribution(
        'Fix issue\n\nCo-Authored-By: GitHub Copilot <copilot@github.com>'
      );
      expect(result).toEqual({ tool: 'github_copilot' });
    });

    it('detects Co-Authored-By: Copilot (without GitHub prefix)', () => {
      const result = detectAiAttribution(
        'Update code\n\nCo-Authored-By: Copilot <copilot@github.com>'
      );
      expect(result).toEqual({ tool: 'github_copilot' });
    });

    it('detects "Generated with Copilot"', () => {
      const result = detectAiAttribution('Generated with Copilot');
      expect(result).toEqual({ tool: 'github_copilot' });
    });

    it('detects "Accepted Copilot suggestion"', () => {
      const result = detectAiAttribution('Accepted Copilot suggestion for this function');
      expect(result).toEqual({ tool: 'github_copilot' });
    });

    it('detects copilot-swe-agent bot from author', () => {
      const result = detectAiAttribution(
        'Automated fix',
        'copilot-swe-agent[bot]',
        'copilot-swe-agent[bot]@users.noreply.github.com'
      );
      expect(result).toEqual({ tool: 'github_copilot' });
    });
  });

  describe('Codex detection', () => {
    it('detects Co-Authored-By: Codex', () => {
      const result = detectAiAttribution(
        'Add function\n\nCo-Authored-By: Codex <codex@openai.com>'
      );
      expect(result).toEqual({ tool: 'codex' });
    });

    it('detects "Generated with Codex"', () => {
      const result = detectAiAttribution('Generated with Codex');
      expect(result).toEqual({ tool: 'codex' });
    });

    it('detects "Codex assisted"', () => {
      const result = detectAiAttribution('Codex assisted with this implementation');
      expect(result).toEqual({ tool: 'codex' });
    });
  });

  describe('Cursor detection', () => {
    it('detects Co-Authored-By: Cursor', () => {
      const result = detectAiAttribution(
        'Implement feature\n\nCo-Authored-By: Cursor <ai@cursor.sh>'
      );
      expect(result).toEqual({ tool: 'cursor' });
    });

    it('detects "Generated with Cursor"', () => {
      const result = detectAiAttribution('Generated with Cursor');
      expect(result).toEqual({ tool: 'cursor' });
    });

    it('detects "Cursor AI assisted"', () => {
      const result = detectAiAttribution('Cursor AI assisted');
      expect(result).toEqual({ tool: 'cursor' });
    });
  });

  describe('Windsurf/Codeium detection', () => {
    it('detects Co-Authored-By: Windsurf', () => {
      const result = detectAiAttribution(
        'Fix bug\n\nCo-Authored-By: Windsurf <ai@codeium.com>'
      );
      expect(result).toEqual({ tool: 'windsurf' });
    });

    it('detects Co-Authored-By: Codeium', () => {
      const result = detectAiAttribution(
        'Update code\n\nCo-Authored-By: Codeium <ai@codeium.com>'
      );
      expect(result).toEqual({ tool: 'windsurf' });
    });

    it('detects "Generated with Windsurf"', () => {
      const result = detectAiAttribution('Generated with Windsurf');
      expect(result).toEqual({ tool: 'windsurf' });
    });

    it('detects "Codeium assisted"', () => {
      const result = detectAiAttribution('Codeium assisted');
      expect(result).toEqual({ tool: 'windsurf' });
    });
  });

  describe('no attribution', () => {
    it('returns null for regular commits', () => {
      const result = detectAiAttribution('Fix typo in README');
      expect(result).toBeNull();
    });

    it('returns null for empty message', () => {
      const result = detectAiAttribution('');
      expect(result).toBeNull();
    });

    it('does not false positive on similar words', () => {
      // Should not match because "Claude" alone without attribution context
      const result = detectAiAttribution('Updated Claude documentation links');
      expect(result).toBeNull();
    });

    it('does not match partial tool names', () => {
      const result = detectAiAttribution('Fixed copilots behavior');
      expect(result).toBeNull();
    });

    it('does not match random email addresses', () => {
      const result = detectAiAttribution('Fix\n\nCo-Authored-By: John <john@example.com>');
      expect(result).toBeNull();
    });
  });

  describe('priority order', () => {
    it('returns first match when multiple patterns present', () => {
      // Claude pattern comes before Copilot in the array
      const result = detectAiAttribution(
        'Fix bug\n\nCo-Authored-By: Claude <noreply@anthropic.com>\nGenerated with Copilot'
      );
      expect(result?.tool).toBe('claude_code');
    });
  });

  describe('ReDoS safety', () => {
    it('handles long strings without catastrophic backtracking', () => {
      // This should complete quickly, not hang
      const longMessage = 'Co-Authored-By: ' + 'a'.repeat(10000) + '@example.com';
      const start = Date.now();
      const result = detectAiAttribution(longMessage);
      const duration = Date.now() - start;

      expect(result).toBeNull();
      expect(duration).toBeLessThan(100); // Should be nearly instant
    });

    it('handles repeated whitespace patterns', () => {
      // The final "Co-Authored-By:   Claude <noreply@anthropic.com>" is valid
      const trickyMessage = 'Co-Authored-By:   '.repeat(100) + 'Claude <noreply@anthropic.com>';
      const start = Date.now();
      const result = detectAiAttribution(trickyMessage);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100);
      expect(result?.tool).toBe('claude_code'); // Still matches the valid suffix
    });
  });
});
