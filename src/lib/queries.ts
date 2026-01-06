import { sql } from '@vercel/postgres';
import { initializeSchema } from './db';

export interface UsageStats {
  totalTokens: number;
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  activeUsers: number;
  claudeCodeTokens: number;
  cursorTokens: number;
}

export interface UserSummary {
  email: string;
  totalTokens: number;
  totalCost: number;
  claudeCodeTokens: number;
  cursorTokens: number;
  favoriteModel: string;
  lastActive: string;
}

export interface ModelBreakdown {
  model: string;
  tokens: number;
  percentage: number;
  tool: string;
}

export interface DailyUsage {
  date: string;
  claudeCode: number;
  cursor: number;
}

export async function getOverallStats(startDate?: string, endDate?: string): Promise<UsageStats> {
  await initializeSchema();

  let result;
  if (startDate && endDate) {
    result = await sql`
      SELECT
        COALESCE(SUM(input_tokens + cache_write_tokens + output_tokens), 0)::int as "totalTokens",
        COALESCE(SUM(cost), 0)::float as "totalCost",
        COALESCE(SUM(input_tokens), 0)::int as "totalInputTokens",
        COALESCE(SUM(output_tokens), 0)::int as "totalOutputTokens",
        COALESCE(SUM(cache_read_tokens), 0)::int as "totalCacheReadTokens",
        COUNT(DISTINCT email)::int as "activeUsers",
        COALESCE(SUM(CASE WHEN tool = 'claude_code' THEN input_tokens + cache_write_tokens + output_tokens ELSE 0 END), 0)::int as "claudeCodeTokens",
        COALESCE(SUM(CASE WHEN tool = 'cursor' THEN input_tokens + cache_write_tokens + output_tokens ELSE 0 END), 0)::int as "cursorTokens"
      FROM usage_records
      WHERE date >= ${startDate} AND date <= ${endDate}
    `;
  } else if (startDate) {
    result = await sql`
      SELECT
        COALESCE(SUM(input_tokens + cache_write_tokens + output_tokens), 0)::int as "totalTokens",
        COALESCE(SUM(cost), 0)::float as "totalCost",
        COALESCE(SUM(input_tokens), 0)::int as "totalInputTokens",
        COALESCE(SUM(output_tokens), 0)::int as "totalOutputTokens",
        COALESCE(SUM(cache_read_tokens), 0)::int as "totalCacheReadTokens",
        COUNT(DISTINCT email)::int as "activeUsers",
        COALESCE(SUM(CASE WHEN tool = 'claude_code' THEN input_tokens + cache_write_tokens + output_tokens ELSE 0 END), 0)::int as "claudeCodeTokens",
        COALESCE(SUM(CASE WHEN tool = 'cursor' THEN input_tokens + cache_write_tokens + output_tokens ELSE 0 END), 0)::int as "cursorTokens"
      FROM usage_records
      WHERE date >= ${startDate}
    `;
  } else if (endDate) {
    result = await sql`
      SELECT
        COALESCE(SUM(input_tokens + cache_write_tokens + output_tokens), 0)::int as "totalTokens",
        COALESCE(SUM(cost), 0)::float as "totalCost",
        COALESCE(SUM(input_tokens), 0)::int as "totalInputTokens",
        COALESCE(SUM(output_tokens), 0)::int as "totalOutputTokens",
        COALESCE(SUM(cache_read_tokens), 0)::int as "totalCacheReadTokens",
        COUNT(DISTINCT email)::int as "activeUsers",
        COALESCE(SUM(CASE WHEN tool = 'claude_code' THEN input_tokens + cache_write_tokens + output_tokens ELSE 0 END), 0)::int as "claudeCodeTokens",
        COALESCE(SUM(CASE WHEN tool = 'cursor' THEN input_tokens + cache_write_tokens + output_tokens ELSE 0 END), 0)::int as "cursorTokens"
      FROM usage_records
      WHERE date <= ${endDate}
    `;
  } else {
    result = await sql`
      SELECT
        COALESCE(SUM(input_tokens + cache_write_tokens + output_tokens), 0)::int as "totalTokens",
        COALESCE(SUM(cost), 0)::float as "totalCost",
        COALESCE(SUM(input_tokens), 0)::int as "totalInputTokens",
        COALESCE(SUM(output_tokens), 0)::int as "totalOutputTokens",
        COALESCE(SUM(cache_read_tokens), 0)::int as "totalCacheReadTokens",
        COUNT(DISTINCT email)::int as "activeUsers",
        COALESCE(SUM(CASE WHEN tool = 'claude_code' THEN input_tokens + cache_write_tokens + output_tokens ELSE 0 END), 0)::int as "claudeCodeTokens",
        COALESCE(SUM(CASE WHEN tool = 'cursor' THEN input_tokens + cache_write_tokens + output_tokens ELSE 0 END), 0)::int as "cursorTokens"
      FROM usage_records
    `;
  }

  return result.rows[0] as UsageStats;
}

export async function getUserSummaries(limit = 50, offset = 0, search?: string): Promise<UserSummary[]> {
  await initializeSchema();

  const searchPattern = search ? `%${search}%` : null;

  const usersResult = searchPattern
    ? await sql`
        SELECT
          email,
          SUM(input_tokens + cache_write_tokens + output_tokens)::int as "totalTokens",
          SUM(cost)::float as "totalCost",
          SUM(CASE WHEN tool = 'claude_code' THEN input_tokens + cache_write_tokens + output_tokens ELSE 0 END)::int as "claudeCodeTokens",
          SUM(CASE WHEN tool = 'cursor' THEN input_tokens + cache_write_tokens + output_tokens ELSE 0 END)::int as "cursorTokens",
          MAX(date)::text as "lastActive"
        FROM usage_records
        WHERE email LIKE ${searchPattern}
        GROUP BY email
        ORDER BY "totalTokens" DESC
        LIMIT ${limit} OFFSET ${offset}
      `
    : await sql`
        SELECT
          email,
          SUM(input_tokens + cache_write_tokens + output_tokens)::int as "totalTokens",
          SUM(cost)::float as "totalCost",
          SUM(CASE WHEN tool = 'claude_code' THEN input_tokens + cache_write_tokens + output_tokens ELSE 0 END)::int as "claudeCodeTokens",
          SUM(CASE WHEN tool = 'cursor' THEN input_tokens + cache_write_tokens + output_tokens ELSE 0 END)::int as "cursorTokens",
          MAX(date)::text as "lastActive"
        FROM usage_records
        GROUP BY email
        ORDER BY "totalTokens" DESC
        LIMIT ${limit} OFFSET ${offset}
      `;

  const users = usersResult.rows;

  // Get favorite model for each user
  const results: UserSummary[] = [];
  for (const user of users) {
    const modelResult = await sql`
      SELECT model, SUM(input_tokens + cache_write_tokens + output_tokens)::int as tokens
      FROM usage_records
      WHERE email = ${user.email}
      GROUP BY model
      ORDER BY tokens DESC
      LIMIT 1
    `;

    results.push({
      ...user,
      favoriteModel: modelResult.rows[0]?.model || 'unknown'
    } as UserSummary);
  }

  return results;
}

export async function getUserDetails(email: string) {
  await initializeSchema();

  const summaryResult = await sql`
    SELECT
      email,
      SUM(input_tokens + cache_write_tokens + output_tokens)::int as "totalTokens",
      SUM(cost)::float as "totalCost",
      SUM(CASE WHEN tool = 'claude_code' THEN input_tokens + cache_write_tokens + output_tokens ELSE 0 END)::int as "claudeCodeTokens",
      SUM(CASE WHEN tool = 'cursor' THEN input_tokens + cache_write_tokens + output_tokens ELSE 0 END)::int as "cursorTokens",
      MAX(date)::text as "lastActive",
      MIN(date)::text as "firstActive"
    FROM usage_records
    WHERE email = ${email}
    GROUP BY email
  `;

  const modelResult = await sql`
    SELECT
      model,
      SUM(input_tokens + cache_write_tokens + output_tokens)::int as tokens,
      tool
    FROM usage_records
    WHERE email = ${email}
    GROUP BY model, tool
    ORDER BY tokens DESC
  `;

  const dailyResult = await sql`
    SELECT
      date::text,
      SUM(CASE WHEN tool = 'claude_code' THEN input_tokens + cache_write_tokens + output_tokens ELSE 0 END)::int as "claudeCode",
      SUM(CASE WHEN tool = 'cursor' THEN input_tokens + cache_write_tokens + output_tokens ELSE 0 END)::int as cursor
    FROM usage_records
    WHERE email = ${email}
    GROUP BY date
    ORDER BY date DESC
    LIMIT 30
  `;

  return {
    summary: summaryResult.rows[0],
    modelBreakdown: modelResult.rows,
    dailyUsage: dailyResult.rows
  };
}

export async function getModelBreakdown(): Promise<ModelBreakdown[]> {
  await initializeSchema();

  const result = await sql`
    SELECT
      model,
      SUM(input_tokens + cache_write_tokens + output_tokens)::int as tokens,
      tool
    FROM usage_records
    GROUP BY model, tool
    ORDER BY tokens DESC
    LIMIT 20
  `;

  const models = result.rows as { model: string; tokens: number; tool: string }[];
  const total = models.reduce((sum, m) => sum + m.tokens, 0);

  return models.map(m => ({
    ...m,
    percentage: total > 0 ? Math.round((m.tokens / total) * 100) : 0
  }));
}

export async function getDailyUsage(days = 14): Promise<DailyUsage[]> {
  await initializeSchema();

  const result = await sql`
    SELECT
      date::text,
      SUM(CASE WHEN tool = 'claude_code' THEN input_tokens + cache_write_tokens + output_tokens ELSE 0 END)::int as "claudeCode",
      SUM(CASE WHEN tool = 'cursor' THEN input_tokens + cache_write_tokens + output_tokens ELSE 0 END)::int as cursor
    FROM usage_records
    WHERE date >= CURRENT_DATE - ${days}::int
    GROUP BY date
    ORDER BY date ASC
  `;

  return result.rows as DailyUsage[];
}

export async function getUnmappedApiKeys(): Promise<{ api_key: string; usage_count: number }[]> {
  await initializeSchema();

  const result = await sql`
    SELECT
      raw_api_key as api_key,
      COUNT(*)::int as usage_count
    FROM usage_records
    WHERE tool = 'claude_code'
      AND email = 'unknown'
      AND raw_api_key IS NOT NULL
    GROUP BY raw_api_key
    ORDER BY usage_count DESC
  `;

  return result.rows as { api_key: string; usage_count: number }[];
}

export async function getApiKeyMappings(): Promise<{ api_key: string; email: string }[]> {
  await initializeSchema();
  const result = await sql`SELECT api_key, email FROM api_key_mappings`;
  return result.rows as { api_key: string; email: string }[];
}

export async function setApiKeyMapping(apiKey: string, email: string): Promise<void> {
  await initializeSchema();

  await sql`
    INSERT INTO api_key_mappings (api_key, email)
    VALUES (${apiKey}, ${email})
    ON CONFLICT (api_key) DO UPDATE SET email = ${email}
  `;

  await sql`
    UPDATE usage_records SET email = ${email} WHERE raw_api_key = ${apiKey}
  `;
}

export async function deleteApiKeyMapping(apiKey: string): Promise<void> {
  await initializeSchema();
  await sql`DELETE FROM api_key_mappings WHERE api_key = ${apiKey}`;
}

export async function getKnownEmails(): Promise<string[]> {
  await initializeSchema();

  const result = await sql`
    SELECT DISTINCT email FROM (
      SELECT email FROM usage_records WHERE tool = 'cursor' AND email != 'unknown'
      UNION
      SELECT email FROM api_key_mappings
      UNION
      SELECT email FROM usage_records WHERE email LIKE '%@%' AND email != 'unknown'
    ) AS combined
    ORDER BY email ASC
  `;

  return result.rows.map(r => r.email);
}

export function suggestEmailFromApiKey(apiKey: string): string | null {
  const match = apiKey.match(/^claude_code_key_([a-z]+(?:\.[a-z]+)?)_[a-z]+$/i);
  if (match) {
    const name = match[1];
    return `${name}@sentry.io`;
  }
  return null;
}

export interface UserPivotData {
  email: string;
  totalTokens: number;
  totalCost: number;
  claudeCodeTokens: number;
  cursorTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  requestCount: number;
  firstActive: string;
  lastActive: string;
  daysActive: number;
  avgTokensPerDay: number;
}

export async function getAllUsersPivot(
  sortBy: string = 'totalTokens',
  sortDir: 'asc' | 'desc' = 'desc',
  search?: string
): Promise<UserPivotData[]> {
  await initializeSchema();

  const validSortColumns = [
    'email', 'totalTokens', 'totalCost', 'claudeCodeTokens', 'cursorTokens',
    'inputTokens', 'outputTokens', 'requestCount', 'firstActive', 'lastActive',
    'daysActive', 'avgTokensPerDay'
  ];
  const safeSortBy = validSortColumns.includes(sortBy) ? sortBy : 'totalTokens';
  const searchPattern = search ? `%${search}%` : null;

  // Need to use raw SQL for dynamic ORDER BY - Vercel Postgres doesn't support dynamic column names in template
  // Using a workaround with CASE statements for sorting
  const result = searchPattern
    ? await sql`
        SELECT
          email,
          SUM(input_tokens + cache_write_tokens + output_tokens)::int as "totalTokens",
          SUM(cost)::float as "totalCost",
          SUM(CASE WHEN tool = 'claude_code' THEN input_tokens + cache_write_tokens + output_tokens ELSE 0 END)::int as "claudeCodeTokens",
          SUM(CASE WHEN tool = 'cursor' THEN input_tokens + cache_write_tokens + output_tokens ELSE 0 END)::int as "cursorTokens",
          SUM(input_tokens)::int as "inputTokens",
          SUM(output_tokens)::int as "outputTokens",
          SUM(cache_read_tokens)::int as "cacheReadTokens",
          COUNT(*)::int as "requestCount",
          MIN(date)::text as "firstActive",
          MAX(date)::text as "lastActive",
          COUNT(DISTINCT date)::int as "daysActive"
        FROM usage_records
        WHERE email != 'unknown' AND email LIKE ${searchPattern}
        GROUP BY email
        ORDER BY "totalTokens" DESC
      `
    : await sql`
        SELECT
          email,
          SUM(input_tokens + cache_write_tokens + output_tokens)::int as "totalTokens",
          SUM(cost)::float as "totalCost",
          SUM(CASE WHEN tool = 'claude_code' THEN input_tokens + cache_write_tokens + output_tokens ELSE 0 END)::int as "claudeCodeTokens",
          SUM(CASE WHEN tool = 'cursor' THEN input_tokens + cache_write_tokens + output_tokens ELSE 0 END)::int as "cursorTokens",
          SUM(input_tokens)::int as "inputTokens",
          SUM(output_tokens)::int as "outputTokens",
          SUM(cache_read_tokens)::int as "cacheReadTokens",
          COUNT(*)::int as "requestCount",
          MIN(date)::text as "firstActive",
          MAX(date)::text as "lastActive",
          COUNT(DISTINCT date)::int as "daysActive"
        FROM usage_records
        WHERE email != 'unknown'
        GROUP BY email
        ORDER BY "totalTokens" DESC
      `;

  let users = result.rows.map(u => ({
    ...u,
    avgTokensPerDay: u.daysActive > 0 ? Math.round(u.totalTokens / u.daysActive) : 0
  })) as UserPivotData[];

  // Apply sorting in JS since we can't do dynamic ORDER BY
  if (safeSortBy !== 'totalTokens' || sortDir !== 'desc') {
    users = users.sort((a, b) => {
      const aVal = a[safeSortBy as keyof UserPivotData];
      const bVal = b[safeSortBy as keyof UserPivotData];
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
  }

  return users;
}

// Insert usage record
export async function insertUsageRecord(record: {
  date: string;
  email: string;
  tool: 'claude_code' | 'cursor';
  model: string;
  inputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  outputTokens: number;
  cost: number;
  rawApiKey?: string;
}): Promise<void> {
  await initializeSchema();

  await sql`
    INSERT INTO usage_records (date, email, tool, model, input_tokens, cache_write_tokens, cache_read_tokens, output_tokens, cost, raw_api_key)
    VALUES (${record.date}, ${record.email}, ${record.tool}, ${record.model}, ${record.inputTokens}, ${record.cacheWriteTokens}, ${record.cacheReadTokens}, ${record.outputTokens}, ${record.cost}, ${record.rawApiKey || null})
    ON CONFLICT (date, email, tool, model, COALESCE(raw_api_key, ''))
    DO UPDATE SET
      input_tokens = EXCLUDED.input_tokens,
      cache_write_tokens = EXCLUDED.cache_write_tokens,
      cache_read_tokens = EXCLUDED.cache_read_tokens,
      output_tokens = EXCLUDED.output_tokens,
      cost = EXCLUDED.cost
  `;
}

// Get existing mapping for an API key
export async function getApiKeyMapping(apiKey: string): Promise<string | null> {
  await initializeSchema();
  const result = await sql`SELECT email FROM api_key_mappings WHERE api_key = ${apiKey}`;
  return result.rows[0]?.email || null;
}
