import { insertUsageRecord } from '../queries';

interface CursorUsageEvent {
  userEmail: string;
  model: string;
  timestamp: string;  // epoch milliseconds as string
  kind?: string;
  maxMode?: boolean;
  requestsCosts?: number;
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    cacheWriteTokens?: number;
    cacheReadTokens?: number;
    totalCents?: number;
  };
}

interface CursorUsageResponse {
  usageEvents: CursorUsageEvent[];
  totalUsageEventsCount: number;
  pagination: {
    numPages: number;
    currentPage: number;
    pageSize: number;
    hasNextPage: boolean;
  };
}

export interface SyncResult {
  success: boolean;
  recordsImported: number;
  recordsSkipped: number;
  errors: string[];
}

function getCursorAuthHeader(): string | null {
  const adminKey = process.env.CURSOR_ADMIN_KEY;

  if (!adminKey) {
    return null;
  }

  // Cursor API uses Basic auth with API key as username, empty password
  const credentials = `${adminKey}:`;
  return `Basic ${Buffer.from(credentials).toString('base64')}`;
}

interface AggregatedRecord {
  email: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
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
      errors: ['CURSOR_ADMIN_KEY not configured']
    };
  }

  const result: SyncResult = {
    success: true,
    recordsImported: 0,
    recordsSkipped: 0,
    errors: []
  };

  try {
    // Convert ISO date strings to epoch milliseconds
    const startMs = new Date(startDate).getTime();
    const endMs = new Date(endDate).getTime();

    // Aggregate by (date, email, model) since Cursor has multiple events per day
    const aggregated = new Map<string, AggregatedRecord>();

    // Paginate through all results
    let page = 1;
    const pageSize = 1000; // Max out page size to reduce API calls
    let hasMore = true;

    while (hasMore) {
      const response = await fetch(
        'https://api.cursor.com/teams/filtered-usage-events',
        {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            startDate: startMs,
            endDate: endMs,
            page,
            pageSize
          })
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Cursor API error: ${response.status} - ${errorText}`);
      }

      const data: CursorUsageResponse = await response.json();
      const events = data.usageEvents || [];

      for (const event of events) {
        const tokenUsage = event.tokenUsage;

        // Skip events with no tokens at all (including cache)
        const totalTokens = (tokenUsage?.inputTokens || 0) +
          (tokenUsage?.outputTokens || 0) +
          (tokenUsage?.cacheWriteTokens || 0) +
          (tokenUsage?.cacheReadTokens || 0);
        if (totalTokens === 0) {
          result.recordsSkipped++;
          continue;
        }

        // Convert timestamp string to date
        const date = new Date(parseInt(event.timestamp)).toISOString().split('T')[0];
        const email = event.userEmail;
        const key = makeKey(date, email, event.model);

        const existing = aggregated.get(key);
        if (existing) {
          existing.inputTokens += tokenUsage?.inputTokens || 0;
          existing.outputTokens += tokenUsage?.outputTokens || 0;
          existing.cacheWriteTokens += tokenUsage?.cacheWriteTokens || 0;
          existing.cacheReadTokens += tokenUsage?.cacheReadTokens || 0;
          existing.cost += (tokenUsage?.totalCents || 0) / 100; // Convert cents to dollars
        } else {
          aggregated.set(key, {
            email,
            model: event.model,
            inputTokens: tokenUsage?.inputTokens || 0,
            outputTokens: tokenUsage?.outputTokens || 0,
            cacheWriteTokens: tokenUsage?.cacheWriteTokens || 0,
            cacheReadTokens: tokenUsage?.cacheReadTokens || 0,
            cost: (tokenUsage?.totalCents || 0) / 100
          });
        }
      }

      // Check if there are more pages
      if (data.pagination?.hasNextPage) {
        page++;
        // Rate limit: 20 requests per minute = 3 seconds between requests
        await new Promise(resolve => setTimeout(resolve, 3000));
      } else {
        hasMore = false;
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
          cacheWriteTokens: aggData.cacheWriteTokens,
          cacheReadTokens: aggData.cacheReadTokens,
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
