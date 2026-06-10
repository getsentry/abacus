import { getOpenRouterSyncState, getOpenRouterBackfillState } from '../../src/lib/sync/openrouter';

export async function cmdOpenRouterStatus() {
  console.log('🔄 OpenRouter Sync Status\n');

  const { lastSyncedDate, lastSyncAt } = await getOpenRouterSyncState();
  const { oldestDate, isComplete } = await getOpenRouterBackfillState();

  const today = new Date().toISOString().split('T')[0];

  console.log('Sync state:');
  if (lastSyncedDate) {
    console.log(`  Last synced date: ${lastSyncedDate}`);
    console.log(`  Last sync at:     ${lastSyncAt || 'unknown'}`);
    if (lastSyncedDate >= today) {
      console.log('\n✓ Up to date');
    } else {
      const last = new Date(lastSyncedDate);
      const curr = new Date(today);
      const daysBehind = Math.round((curr.getTime() - last.getTime()) / (24 * 60 * 60 * 1000));
      console.log(`\n⚠️  ${daysBehind} day(s) behind`);
    }
  } else {
    console.log('  Never synced');
    console.log('\nRun: pnpm cli sync openrouter --days 30');
  }

  console.log('\nBackfill state:');
  if (isComplete) {
    console.log('  ✓ Complete');
    if (oldestDate) {
      console.log(`  Oldest data date: ${oldestDate}`);
    }
  } else {
    console.log(`  Not complete${oldestDate ? ` (oldest data: ${oldestDate})` : ' (no data yet)'}`);
    console.log('\nRun: pnpm cli backfill openrouter');
  }
}
