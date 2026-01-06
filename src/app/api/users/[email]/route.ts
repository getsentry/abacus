import { NextResponse } from 'next/server';
import { getUserDetails } from '@/lib/queries';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ email: string }> }
) {
  const { email } = await params;

  try {
    const details = await getUserDetails(decodeURIComponent(email));
    if (!details.summary) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    return NextResponse.json(details);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
