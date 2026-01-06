import { NextResponse } from 'next/server';
import { getOverallStats, getUnattributedStats } from '@/lib/queries';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get('startDate') || undefined;
  const endDate = searchParams.get('endDate') || undefined;

  try {
    const [stats, unattributed] = await Promise.all([
      getOverallStats(startDate, endDate),
      getUnattributedStats()
    ]);
    return NextResponse.json({ ...stats, unattributed });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
