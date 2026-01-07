import { NextResponse } from 'next/server';
import { getAllUsersPivot } from '@/lib/queries';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sortBy = searchParams.get('sortBy') || 'totalTokens';
  const sortDir = (searchParams.get('sortDir') || 'desc') as 'asc' | 'desc';
  const search = searchParams.get('search') || undefined;
  const days = parseInt(searchParams.get('days') || '30', 10);

  try {
    const users = await getAllUsersPivot(sortBy, sortDir, search, days);
    return NextResponse.json(users);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
