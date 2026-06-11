import { getOpenRouterSyncState, getOpenRouterBackfillState } from '../../src/lib/sync/openrouter';
import { createOpenRouterKey, deleteOpenRouterKey } from '../../src/lib/openrouter';
import { getOpenRouterWorkspaces } from '../../src/lib/openrouter-workspaces';
import { db, openrouterKeys } from '../../src/lib/db';

export async function cmdOpenRouterCreateKey(email: string | undefined, name: string | undefined) {
  const normalizedEmail = email?.trim().toLowerCase();
  const normalizedName = name?.trim();

  if (!normalizedEmail || !normalizedEmail.includes('@') || !normalizedName) {
    console.error('Usage: pnpm cli openrouter:create-key <email> <name>');
    console.error('Example: pnpm cli openrouter:create-key jane@sentry.io "Claude Code"');
    process.exitCode = 1;
    return;
  }

  const workspaces = getOpenRouterWorkspaces();
  const workspace = workspaces[0]?.name ?? 'default';

  console.log(`🔑 Creating OpenRouter key "${normalizedName}" for ${normalizedEmail}...`);

  // Same flow as POST /api/openrouter/keys: create on OpenRouter first,
  // then store the hash → email mapping; clean up the key if the insert fails.
  const created = await createOpenRouterKey(workspace, {
    name: `${normalizedEmail} - ${normalizedName}`,
  });

  try {
    await db.insert(openrouterKeys).values({
      hash: created.data.hash,
      email: normalizedEmail,
      name: normalizedName,
      workspace,
    });
  } catch (error) {
    try {
      await deleteOpenRouterKey(workspace, created.data.hash);
    } catch (cleanupError) {
      console.error('Failed to cleanup OpenRouter key after DB insert failure', {
        hash: created.data.hash,
        cleanupError,
      });
    }
    throw error;
  }

  console.log('\n✓ Key created and mapped\n');
  console.log(`  Email: ${normalizedEmail}`);
  console.log(`  Name:  ${normalizedName}`);
  console.log(`  Hash:  ${created.data.hash}`);
  console.log(`\n  Key (shown ONCE, share it securely):\n\n  ${created.key}\n`);
}

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
