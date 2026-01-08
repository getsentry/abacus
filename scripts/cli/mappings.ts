import { syncApiKeyMappingsSmart, syncAnthropicApiKeyMappings } from '../../src/lib/sync/anthropic-mappings';
import { getIdentityMappings, setIdentityMapping, getUnmappedToolRecords, getKnownEmails } from '../../src/lib/queries';
import { prompt } from './utils';

export async function cmdMappings() {
  console.log('🔑 Identity Mappings\n');
  const mappings = await getIdentityMappings();
  if (mappings.length === 0) {
    console.log('No mappings found. Run `mappings:sync` to sync from Anthropic.');
    return;
  }
  for (const m of mappings) {
    console.log(`  [${m.source}] ${m.external_id} → ${m.email}`);
  }
}

export async function cmdMappingsSync(full: boolean = false) {
  console.log(`🔄 Syncing API key mappings from Anthropic${full ? ' (full)' : ' (smart)'}...\n`);
  const result = full
    ? await syncAnthropicApiKeyMappings()
    : await syncApiKeyMappingsSmart();
  console.log(`Created: ${result.mappingsCreated}`);
  console.log(`Skipped: ${result.mappingsSkipped}`);
  if (result.errors.length > 0) {
    console.log(`Errors: ${result.errors.slice(0, 5).join(', ')}`);
  }
}

export async function cmdMappingsFix() {
  console.log('🔧 Fix Unmapped Tool Records\n');

  // Currently only claude_code uses tool_record_id for identity mapping
  const source = 'claude_code';
  const unmapped = await getUnmappedToolRecords(source);
  if (unmapped.length === 0) {
    console.log('No unmapped tool records found!');
    return;
  }

  const knownEmails = await getKnownEmails();
  console.log(`Found ${unmapped.length} unmapped ${source} records.\n`);
  console.log('Known emails:', knownEmails.join(', '), '\n');

  for (const item of unmapped) {
    console.log(`\nTool Record ID: ${item.tool_record_id}`);
    console.log(`Used in: ${item.usage_count} records`);

    const email = await prompt('Enter email (or skip/quit): ');

    if (email.toLowerCase() === 'quit' || email.toLowerCase() === 'q') {
      break;
    }

    if (email.toLowerCase() === 'skip' || email.toLowerCase() === 's' || !email) {
      console.log('Skipped.');
      continue;
    }

    await setIdentityMapping(source, item.tool_record_id, email);
    console.log(`✓ Mapped [${source}] ${item.tool_record_id} → ${email}`);
  }

  console.log('\nDone!');
}
