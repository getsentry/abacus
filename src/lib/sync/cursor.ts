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
  inputTokens: number;
  outputTokens: number;
  cost: number;
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
      const key = `${date}|${event.user}|${event.model}`;

      const existing = aggregated.get(key);
      if (existing) {
        existing.inputTokens += event.inputTokens || 0;
        existing.outputTokens += event.outputTokens || 0;
        existing.cost += event.cost || 0;
      } else {
        aggregated.set(key, {
          inputTokens: event.inputTokens || 0,
          outputTokens: event.outputTokens || 0,
          cost: event.cost || 0
        });
      }
    }

    // Insert aggregated records
    for (const [key, data] of aggregated) {
      const [date, email, model] = key.split('|');
      try {
        await insertUsageRecord({
          date,
          email,
          tool: 'cursor',
          model,
          inputTokens: data.inputTokens,
          cacheWriteTokens: 0, // Cursor API doesn't break down cache tokens
          cacheReadTokens: 0,
          outputTokens: data.outputTokens,
          cost: data.cost
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
