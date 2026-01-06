import { NextResponse } from 'next/server';
import { runFullSync, getSyncState, syncMappings } from '@/lib/sync';

// Get sync status
export async function GET() {
  try {
    const state = await getSyncState('main');
    return NextResponse.json({
      lastSync: state.lastSyncAt,
      anthropicConfigured: !!process.env.ANTHROPIC_ADMIN_KEY,
      cursorConfigured: !!(process.env.CURSOR_TEAM_SLUG && process.env.CURSOR_ADMIN_KEY)
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// Trigger manual sync (protected by middleware)
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { startDate, endDate, includeMappings, mappingsOnly } = body;

    // If only syncing mappings
    if (mappingsOnly) {
      const mappingsResult = await syncMappings();
      return NextResponse.json({
        success: mappingsResult.success,
        result: { mappings: mappingsResult }
      });
    }

    // Full sync with optional mappings
    const result = await runFullSync(startDate, endDate, { includeMappings });

    return NextResponse.json({
      success: true,
      result
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
