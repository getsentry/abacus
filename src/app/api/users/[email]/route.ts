import { NextResponse } from 'next/server';
import { getUserDetails, getUserDetailsExtended } from '@/lib/queries';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ email: string }> }
) {
  const { email } = await params;
  const { searchParams } = new URL(request.url);
  const days = searchParams.get('days');

  try {
    const decodedEmail = decodeURIComponent(email);

    // Use extended query if days parameter is provided
    const details = days
      ? await getUserDetailsExtended(decodedEmail, parseInt(days, 10))
      : await getUserDetails(decodedEmail);

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
