import { NextResponse } from 'next/server';
import { getOverallStats, getUnattributedStats } from '@/lib/queries';
import { getSession } from '@/lib/auth';

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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
