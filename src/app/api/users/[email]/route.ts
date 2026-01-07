import { NextResponse } from 'next/server';
import { getUserDetails, getUserDetailsExtended, resolveUserEmail } from '@/lib/queries';
import { getSession } from '@/lib/auth';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ email: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { email: usernameOrEmail } = await params;
  const { searchParams } = new URL(request.url);
  const days = searchParams.get('days');

  try {
    const decoded = decodeURIComponent(usernameOrEmail);

    // Resolve username to full email if needed
    const email = await resolveUserEmail(decoded);
    if (!email) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Use extended query if days parameter is provided
    const details = days
      ? await getUserDetailsExtended(email, parseInt(days, 10))
      : await getUserDetails(email);

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
