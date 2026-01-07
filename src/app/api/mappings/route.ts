import { NextResponse } from 'next/server';
import { getApiKeyMappings, setApiKeyMapping, deleteApiKeyMapping, getUnmappedApiKeys, getKnownEmails } from '@/lib/queries';
import { getSession } from '@/lib/auth';

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const [mappings, unmapped, knownEmails] = await Promise.all([
      getApiKeyMappings(),
      getUnmappedApiKeys(),
      getKnownEmails()
    ]);

    return NextResponse.json({
      mappings,
      unmapped,
      knownEmails
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { apiKey, email } = await request.json();

    if (!apiKey || !email) {
      return NextResponse.json(
        { error: 'apiKey and email are required' },
        { status: 400 }
      );
    }

    await setApiKeyMapping(apiKey, email);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { apiKey } = await request.json();

    if (!apiKey) {
      return NextResponse.json({ error: 'apiKey is required' }, { status: 400 });
    }

    await deleteApiKeyMapping(apiKey);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
