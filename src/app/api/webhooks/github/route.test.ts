import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as crypto from 'crypto';
import { POST } from './route';

function createSignature(payload: string, secret: string): string {
  return `sha256=${crypto.createHmac('sha256', secret).update(payload).digest('hex')}`;
}

describe('POST /api/webhooks/github', () => {
  beforeEach(() => {
    vi.stubEnv('GITHUB_WEBHOOK_SECRET', 'test-webhook-secret');
  });

  it('returns 500 when webhook secret not configured', async () => {
    vi.stubEnv('GITHUB_WEBHOOK_SECRET', '');

    const response = await POST(
      new Request('http://localhost/api/webhooks/github', {
        method: 'POST',
        body: '{}',
      })
    );

    expect(response.status).toBe(500);
  });

  it('returns 401 without signature', async () => {
    const response = await POST(
      new Request('http://localhost/api/webhooks/github', {
        method: 'POST',
        body: '{}',
      })
    );

    expect(response.status).toBe(401);
  });

  it('returns 401 with invalid signature', async () => {
    const response = await POST(
      new Request('http://localhost/api/webhooks/github', {
        method: 'POST',
        body: '{}',
        headers: {
          'x-hub-signature-256': 'sha256=invalid',
        },
      })
    );

    expect(response.status).toBe(401);
  });

  it('returns 400 for invalid JSON', async () => {
    const payload = 'not json';
    const signature = createSignature(payload, 'test-webhook-secret');

    const response = await POST(
      new Request('http://localhost/api/webhooks/github', {
        method: 'POST',
        body: payload,
        headers: {
          'x-hub-signature-256': signature,
        },
      })
    );

    expect(response.status).toBe(400);
  });

  it('handles ping event', async () => {
    const payload = JSON.stringify({ zen: 'Test zen message' });
    const signature = createSignature(payload, 'test-webhook-secret');

    const response = await POST(
      new Request('http://localhost/api/webhooks/github', {
        method: 'POST',
        body: payload,
        headers: {
          'x-hub-signature-256': signature,
          'x-github-event': 'ping',
        },
      })
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.message).toContain('configured');
  });

  it('skips non-push events', async () => {
    const payload = JSON.stringify({});
    const signature = createSignature(payload, 'test-webhook-secret');

    const response = await POST(
      new Request('http://localhost/api/webhooks/github', {
        method: 'POST',
        body: payload,
        headers: {
          'x-hub-signature-256': signature,
          'x-github-event': 'issues',
        },
      })
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.skipped).toBe(true);
  });
});
