import { NextResponse } from 'next/server';
import { getOverallStats } from '@/lib/queries';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get('startDate') || undefined;
  const endDate = searchParams.get('endDate') || undefined;

  try {
    const stats = await getOverallStats(startDate, endDate);
    return NextResponse.json(stats);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
