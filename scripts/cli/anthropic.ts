import { getAnthropicSyncState } from '../../src/lib/sync/anthropic';

export async function cmdAnthropicStatus() {
  console.log('🔄 Anthropic Sync Status\n');

  const { lastSyncedDate } = await getAnthropicSyncState();

  // Yesterday is the most recent complete day we should have
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  if (lastSyncedDate) {
    console.log(`Last synced date: ${lastSyncedDate}`);
    console.log(`Current complete day: ${yesterdayStr}`);

    if (lastSyncedDate >= yesterdayStr) {
      console.log('\n✓ Up to date');
    } else {
      const lastDate = new Date(lastSyncedDate);
      const daysBehind = Math.floor((yesterday.getTime() - lastDate.getTime()) / (24 * 60 * 60 * 1000));
      console.log(`\n⚠️  ${daysBehind} day(s) behind`);
    }
  } else {
    console.log('Never synced');
    console.log(`Current complete day: ${yesterdayStr}`);
    console.log('\nRun backfill to initialize: npm run cli backfill anthropic --from YYYY-MM-DD --to YYYY-MM-DD');
  }
}
