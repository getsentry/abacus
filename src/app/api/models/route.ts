import { NextResponse } from 'next/server';
import { getModelBreakdown } from '@/lib/queries';

export async function GET() {
  try {
    const models = await getModelBreakdown();
    return NextResponse.json(models);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
