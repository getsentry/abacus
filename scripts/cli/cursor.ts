import * as fs from 'fs';
import { getCursorSyncState, getPreviousCompleteHourEnd } from '../../src/lib/sync/cursor';
import { insertUsageRecord } from '../../src/lib/queries';
import { normalizeModelName } from '../../src/lib/utils';

export async function cmdCursorStatus() {
  console.log('🔄 Cursor Sync Status\n');

  const { lastSyncedHourEnd } = await getCursorSyncState();
  const currentHourEnd = getPreviousCompleteHourEnd();

  if (lastSyncedHourEnd) {
    const lastSyncDate = new Date(lastSyncedHourEnd);
    console.log(`Last synced hour end: ${lastSyncDate.toISOString()}`);
    console.log(`Current complete hour: ${currentHourEnd.toISOString()}`);

    const hoursBehind = Math.floor((currentHourEnd.getTime() - lastSyncedHourEnd) / (60 * 60 * 1000));
    if (hoursBehind > 0) {
      console.log(`\n⚠️  ${hoursBehind} hour(s) behind`);
    } else {
      console.log('\n✓ Up to date');
    }
  } else {
    console.log('Never synced');
    console.log(`Current complete hour: ${currentHourEnd.toISOString()}`);
    console.log('\nRun backfill to initialize: npm run cli backfill cursor --from YYYY-MM-DD --to YYYY-MM-DD');
  }
}

interface CsvRow {
  Date: string;
  User: string;
  Kind: string;
  Model: string;
  'Max Mode': string;
  'Input (w/ Cache Write)': string;
  'Input (w/o Cache Write)': string;
  'Cache Read': string;
  'Output Tokens': string;
  'Total Tokens': string;
  Cost: string;
}

export async function cmdImportCursorCsv(filePath: string) {
  console.log(`📥 Importing Cursor CSV: ${filePath}\n`);

  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    return;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const headers = lines[0].split(',').map(h => h.replace(/"/g, ''));

  console.log(`Headers: ${headers.join(', ')}`);
  console.log(`Total rows: ${lines.length - 1}\n`);

  // Parse CSV into rows
  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Parse CSV with quoted fields
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current);

    if (values.length !== headers.length) continue;

    const row: Record<string, string> = {};
    headers.forEach((h, idx) => row[h] = values[idx]);
    rows.push(row as unknown as CsvRow);
  }

  console.log(`Parsed ${rows.length} rows\n`);

  // Insert per-event (no aggregation) - uses timestamp for deduplication
  let imported = 0;
  let skipped = 0;
  let errors = 0;
  let lastDate = '';

  for (const row of rows) {
    const timestamp = new Date(row.Date);
    const timestampMs = timestamp.getTime();
    const date = timestamp.toISOString().split('T')[0];
    const email = row.User;
    const rawModel = row.Model;
    const model = normalizeModelName(rawModel);

    const inputTokens = parseInt(row['Input (w/o Cache Write)']) || 0;
    const cacheWriteTokens = parseInt(row['Input (w/ Cache Write)']) || 0;
    const cacheReadTokens = parseInt(row['Cache Read']) || 0;
    const outputTokens = parseInt(row['Output Tokens']) || 0;
    const cost = parseFloat(row.Cost) || 0;

    // Skip rows with no tokens
    const totalTokens = inputTokens + outputTokens + cacheWriteTokens + cacheReadTokens;
    if (totalTokens === 0) {
      skipped++;
      continue;
    }

    if (date !== lastDate) {
      if (lastDate) {
        process.stdout.write('\n');
      }
      process.stdout.write(`  ${date}: `);
      lastDate = date;
    }

    try {
      await insertUsageRecord({
        date,
        email,
        tool: 'cursor',
        model,
        rawModel,
        inputTokens,
        cacheWriteTokens,
        cacheReadTokens,
        outputTokens,
        cost,
        timestampMs,
      });
      imported++;
      process.stdout.write('.');
    } catch (err) {
      if (err instanceof Error && err.message.includes('duplicate')) {
        skipped++;
        process.stdout.write('s');
      } else {
        errors++;
        process.stdout.write('E');
        console.error(`\nError inserting row:`, err);
      }
    }
  }

  console.log(`\n\n✓ Import complete!`);
  console.log(`  Imported: ${imported}`);
  console.log(`  Skipped (duplicates or empty): ${skipped}`);
  console.log(`  Errors: ${errors}`);
}
