import { NextResponse } from 'next/server';
import { getUserSummaries } from '@/lib/queries';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '50', 10);
  const offset = parseInt(searchParams.get('offset') || '0', 10);
  const search = searchParams.get('search') || undefined;

  try {
    const users = await getUserSummaries(limit, offset, search);
    return NextResponse.json(users);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
