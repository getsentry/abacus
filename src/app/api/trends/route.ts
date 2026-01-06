import { NextResponse } from 'next/server';
import { getDailyUsage } from '@/lib/queries';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const days = parseInt(searchParams.get('days') || '14', 10);

  try {
    const trends = await getDailyUsage(days);
    return NextResponse.json(trends);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
