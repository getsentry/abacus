import { NextResponse } from 'next/server';
import { getAllUsersPivot } from '@/lib/queries';
import { DEFAULT_DAYS } from '@/lib/constants';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sortBy = searchParams.get('sortBy') || 'totalTokens';
  const sortDir = (searchParams.get('sortDir') || 'desc') as 'asc' | 'desc';
  const search = searchParams.get('search') || undefined;
  const days = parseInt(searchParams.get('days') || String(DEFAULT_DAYS), 10) || DEFAULT_DAYS;

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
