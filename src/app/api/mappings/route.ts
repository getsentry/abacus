import { NextResponse } from 'next/server';
import { getApiKeyMappings, setApiKeyMapping, deleteApiKeyMapping, getUnmappedApiKeys, getKnownEmails, suggestEmailFromApiKey } from '@/lib/queries';

export async function GET() {
  try {
    const [mappings, unmapped, knownEmails] = await Promise.all([
      getApiKeyMappings(),
      getUnmappedApiKeys(),
      getKnownEmails()
    ]);

    // Add suggestions to unmapped keys
    const unmappedWithSuggestions = unmapped.map(item => ({
      ...item,
      suggested_email: suggestEmailFromApiKey(item.api_key)
    }));

    return NextResponse.json({
      mappings,
      unmapped: unmappedWithSuggestions,
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
