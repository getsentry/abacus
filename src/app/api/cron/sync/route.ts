import { NextResponse } from 'next/server';
import { runFullSync } from '@/lib/sync';

export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Sync last 2 days to catch any stragglers
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const result = await runFullSync(startDate, endDate);

    return NextResponse.json({
      success: true,
      syncedRange: { startDate, endDate },
      result
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// Allow POST for Vercel Cron (it sends GET but let's support both)
export async function POST(request: Request) {
  return GET(request);
}
