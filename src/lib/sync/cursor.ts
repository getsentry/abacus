import { insertUsageRecord } from '../queries';

interface CursorUsageEvent {
  user: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  createdAt: string;
  maxMode?: boolean;
  kind?: string;
}

interface CursorUsageResponse {
  events: CursorUsageEvent[];
}

export interface SyncResult {
  success: boolean;
  recordsImported: number;
  recordsSkipped: number;
  errors: string[];
}

function getCursorAuthHeader(): string | null {
  const teamSlug = process.env.CURSOR_TEAM_SLUG;
  const adminKey = process.env.CURSOR_ADMIN_KEY;

  if (!teamSlug || !adminKey) {
    return null;
  }

  const credentials = `${teamSlug}:${adminKey}`;
  return `Basic ${Buffer.from(credentials).toString('base64')}`;
}

interface AggregatedRecord {
  email: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

// Create a composite key that's safe to split (uses null character separator)
function makeKey(date: string, email: string, model: string): string {
  return [date, email, model].join('\0');
}

function parseKey(key: string): { date: string; email: string; model: string } {
  const [date, email, model] = key.split('\0');
  return { date, email, model };
}

export async function syncCursorUsage(
  startDate: string,
  endDate: string
): Promise<SyncResult> {
  const authHeader = getCursorAuthHeader();
  if (!authHeader) {
    return {
      success: false,
      recordsImported: 0,
      recordsSkipped: 0,
      errors: ['CURSOR_TEAM_SLUG and CURSOR_ADMIN_KEY not configured']
    };
  }

  const result: SyncResult = {
    success: true,
    recordsImported: 0,
    recordsSkipped: 0,
    errors: []
  };

  try {
    const response = await fetch(
      'https://www.cursor.com/api/dashboard/teams/filtered-usage-events',
      {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          startDate,
          endDate
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Cursor API error: ${response.status} - ${errorText}`);
    }

    const data: CursorUsageResponse = await response.json();

    // Aggregate by (date, email, model) since Cursor has multiple events per day
    const aggregated = new Map<string, AggregatedRecord>();

    for (const event of data.events || []) {
      // Skip events with no tokens
      const totalTokens = (event.inputTokens || 0) + (event.outputTokens || 0);
      if (totalTokens === 0) {
        result.recordsSkipped++;
        continue;
      }

      const date = event.createdAt.split('T')[0];
      const key = makeKey(date, event.user, event.model);

      const existing = aggregated.get(key);
      if (existing) {
        existing.inputTokens += event.inputTokens || 0;
        existing.outputTokens += event.outputTokens || 0;
        existing.cost += event.cost || 0;
      } else {
        aggregated.set(key, {
          email: event.user,
          model: event.model,
          inputTokens: event.inputTokens || 0,
          outputTokens: event.outputTokens || 0,
          cost: event.cost || 0
        });
      }
    }

    // Insert aggregated records
    for (const [key, aggData] of aggregated) {
      const { date } = parseKey(key);
      try {
        await insertUsageRecord({
          date,
          email: aggData.email,
          tool: 'cursor',
          model: aggData.model,
          inputTokens: aggData.inputTokens,
          cacheWriteTokens: 0, // Cursor API doesn't break down cache tokens
          cacheReadTokens: 0,
          outputTokens: aggData.outputTokens,
          cost: aggData.cost
        });
        result.recordsImported++;
      } catch (err) {
        result.errors.push(`Insert error: ${err instanceof Error ? err.message : 'Unknown'}`);
        result.recordsSkipped++;
      }
    }

  } catch (err) {
    result.success = false;
    result.errors.push(err instanceof Error ? err.message : 'Unknown error');
  }

  return result;
}
