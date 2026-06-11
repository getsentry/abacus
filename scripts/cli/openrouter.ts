import { getOpenRouterSyncState, getOpenRouterBackfillState } from '../../src/lib/sync/openrouter';
import { createOpenRouterKey, deleteOpenRouterKey } from '../../src/lib/openrouter';
import { db, openrouterKeys, openrouterWorkspaces } from '../../src/lib/db';

export async function cmdOpenRouterCreateKey(
  email: string | undefined,
  name: string | undefined,
  workspaceFlag: string | undefined
) {
  const normalizedEmail = email?.trim().toLowerCase();
  const normalizedName = name?.trim();

  if (!normalizedEmail || !normalizedEmail.includes('@') || !normalizedName) {
    console.error('Usage: pnpm cli openrouter:create-key <email> <name> [--workspace <workspace>]');
    console.error('Example: pnpm cli openrouter:create-key jane@sentry.io "Claude Code"');
    process.exitCode = 1;
    return;
  }

  // Resolve target workspace from the admin-enabled set (openrouter_workspaces table).
  // None enabled -> account default workspace. One enabled -> auto-select.
  // Multiple -> --workspace required (matched by name).
  const enabled = await db.select().from(openrouterWorkspaces);

  let workspaceId: string | null = null;
  let workspaceName = 'default';
  if (workspaceFlag) {
    const match = enabled.find((w) => w.name === workspaceFlag);
    if (!match) {
      const validNames = enabled.map((w) => w.name).join(', ') || 'none';
      console.error(`Error: Unknown workspace "${workspaceFlag}". Valid workspaces: ${validNames}`);
      process.exitCode = 1;
      return;
    }
    workspaceId = match.id;
    workspaceName = match.name;
  } else if (enabled.length === 1) {
    // Exactly one enabled workspace — use it as the default
    workspaceId = enabled[0].id;
    workspaceName = enabled[0].name;
  } else if (enabled.length > 1) {
    // Two or more enabled workspaces — --workspace is required
    const validNames = enabled.map((w) => w.name).join(', ');
    console.error(`Error: --workspace is required when multiple workspaces are enabled.`);
    console.error(`Valid workspaces: ${validNames}`);
    console.error('Usage: pnpm cli openrouter:create-key <email> <name> --workspace <workspace>');
    process.exitCode = 1;
    return;
  }

  console.log(`🔑 Creating OpenRouter key "${normalizedName}" for ${normalizedEmail} in workspace "${workspaceName}"...`);

  // Same flow as POST /api/openrouter/keys: create on OpenRouter first,
  // then store the hash → email mapping; clean up the key if the insert fails.
  const created = await createOpenRouterKey({
    name: `${normalizedEmail} - ${normalizedName}`,
    ...(workspaceId ? { workspaceId } : {}),
  });

  try {
    await db.insert(openrouterKeys).values({
      hash: created.data.hash,
      email: normalizedEmail,
      name: normalizedName,
      workspaceId,
    });
  } catch (error) {
    try {
      await deleteOpenRouterKey(created.data.hash);
    } catch (cleanupError) {
      console.error('Failed to cleanup OpenRouter key after DB insert failure', {
        hash: created.data.hash,
        cleanupError,
      });
    }
    throw error;
  }

  console.log('\n✓ Key created and mapped\n');
  console.log(`  Email:     ${normalizedEmail}`);
  console.log(`  Name:      ${normalizedName}`);
  console.log(`  Workspace: ${workspaceName}`);
  console.log(`  Hash:      ${created.data.hash}`);
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
