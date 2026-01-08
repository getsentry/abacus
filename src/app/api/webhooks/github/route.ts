import { NextResponse } from 'next/server';
import { wrapRouteHandlerWithSentry } from '@sentry/nextjs';
import { processWebhookPush, GitHubPushEvent } from '@/lib/sync';
import * as crypto from 'crypto';

/**
 * GitHub Webhook Handler
 *
 * Receives push events from GitHub organization webhook.
 * Verifies signature, parses payload, and processes commits.
 *
 * Setup:
 * 1. Create a GitHub App or organization webhook
 * 2. Set webhook URL to this endpoint
 * 3. Set GITHUB_WEBHOOK_SECRET in environment
 * 4. Subscribe to "push" events
 */

function verifySignature(payload: string, signature: string, secret: string): boolean {
  const expectedSignature = `sha256=${crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex')}`;

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
}

async function handler(request: Request) {
  // Get headers
  const signature = request.headers.get('x-hub-signature-256');
  const event = request.headers.get('x-github-event');
  const deliveryId = request.headers.get('x-github-delivery');

  // Verify webhook secret is configured
  const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('GITHUB_WEBHOOK_SECRET not configured');
    return NextResponse.json(
      { error: 'Webhook not configured' },
      { status: 500 }
    );
  }

  // Get raw payload for signature verification
  const payload = await request.text();

  // Verify signature
  if (!signature || !verifySignature(payload, signature, webhookSecret)) {
    return NextResponse.json(
      { error: 'Invalid signature' },
      { status: 401 }
    );
  }

  // Parse payload
  let data: GitHubPushEvent;
  try {
    data = JSON.parse(payload);
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON' },
      { status: 400 }
    );
  }

  // Handle ping event (sent when webhook is first configured)
  if (event === 'ping') {
    return NextResponse.json({
      success: true,
      message: 'Webhook configured successfully',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      zen: (data as any).zen,
    });
  }

  // Only process push events
  if (event !== 'push') {
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: `Event type '${event}' not handled`,
    });
  }

  // Process push event
  const result = await processWebhookPush(data);

  // Log errors server-side but don't expose details in response
  if (result.errors.length > 0) {
    console.error(`Webhook processing errors for ${data.repository?.full_name}:`, result.errors);
  }

  return NextResponse.json({
    success: result.success,
    deliveryId,
    repo: data.repository?.full_name,
    commitsProcessed: result.commitsProcessed,
    aiAttributedCommits: result.aiAttributedCommits,
    errorCount: result.errors.length,
  });
}

export const POST = wrapRouteHandlerWithSentry(handler, {
  method: 'POST',
  parameterizedRoute: '/api/webhooks/github',
});
