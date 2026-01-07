import { sql } from '@vercel/postgres';
import { DEFAULT_DAYS } from './constants';


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
  cost: number;
}

export async function getOverallStats(startDate?: string, endDate?: string): Promise<UsageStats> {

  let result;
  if (startDate && endDate) {
    result = await sql`
      SELECT
        COALESCE(SUM(input_tokens + cache_write_tokens + output_tokens), 0)::bigint as "totalTokens",
        COALESCE(SUM(cost), 0)::float as "totalCost",
        COALESCE(SUM(input_tokens), 0)::bigint as "totalInputTokens",
        COALESCE(SUM(output_tokens), 0)::bigint as "totalOutputTokens",
        COALESCE(SUM(cache_read_tokens), 0)::bigint as "totalCacheReadTokens",
        COUNT(DISTINCT email)::int as "activeUsers",
        COALESCE(SUM(CASE WHEN tool = 'claude_code' THEN input_tokens + cache_write_tokens + output_tokens ELSE 0 END), 0)::bigint as "claudeCodeTokens",
        COALESCE(SUM(CASE WHEN tool = 'cursor' THEN input_tokens + cache_write_tokens + output_tokens ELSE 0 END), 0)::bigint as "cursorTokens"
      FROM usage_records
      WHERE date >= ${startDate} AND date <= ${endDate}
    `;
  } else if (startDate) {
    result = await sql`
      SELECT
        COALESCE(SUM(input_tokens + cache_write_tokens + output_tokens), 0)::bigint as "totalTokens",
        COALESCE(SUM(cost), 0)::float as "totalCost",
        COALESCE(SUM(input_tokens), 0)::bigint as "totalInputTokens",
        COALESCE(SUM(output_tokens), 0)::bigint as "totalOutputTokens",
        COALESCE(SUM(cache_read_tokens), 0)::bigint as "totalCacheReadTokens",
        COUNT(DISTINCT email)::int as "activeUsers",
        COALESCE(SUM(CASE WHEN tool = 'claude_code' THEN input_tokens + cache_write_tokens + output_tokens ELSE 0 END), 0)::bigint as "claudeCodeTokens",
        COALESCE(SUM(CASE WHEN tool = 'cursor' THEN input_tokens + cache_write_tokens + output_tokens ELSE 0 END), 0)::bigint as "cursorTokens"
      FROM usage_records
      WHERE date >= ${startDate}
    `;
  } else if (endDate) {
    result = await sql`
      SELECT
        COALESCE(SUM(input_tokens + cache_write_tokens + output_tokens), 0)::bigint as "totalTokens",
        COALESCE(SUM(cost), 0)::float as "totalCost",
        COALESCE(SUM(input_tokens), 0)::bigint as "totalInputTokens",
        COALESCE(SUM(output_tokens), 0)::bigint as "totalOutputTokens",
        COALESCE(SUM(cache_read_tokens), 0)::bigint as "totalCacheReadTokens",
        COUNT(DISTINCT email)::int as "activeUsers",
        COALESCE(SUM(CASE WHEN tool = 'claude_code' THEN input_tokens + cache_write_tokens + output_tokens ELSE 0 END), 0)::bigint as "claudeCodeTokens",
        COALESCE(SUM(CASE WHEN tool = 'cursor' THEN input_tokens + cache_write_tokens + output_tokens ELSE 0 END), 0)::bigint as "cursorTokens"
      FROM usage_records
      WHERE date <= ${endDate}
    `;
  } else {
    result = await sql`
      SELECT
        COALESCE(SUM(input_tokens + cache_write_tokens + output_tokens), 0)::bigint as "totalTokens",
        COALESCE(SUM(cost), 0)::float as "totalCost",
        COALESCE(SUM(input_tokens), 0)::bigint as "totalInputTokens",
        COALESCE(SUM(output_tokens), 0)::bigint as "totalOutputTokens",
        COALESCE(SUM(cache_read_tokens), 0)::bigint as "totalCacheReadTokens",
        COUNT(DISTINCT email)::int as "activeUsers",
        COALESCE(SUM(CASE WHEN tool = 'claude_code' THEN input_tokens + cache_write_tokens + output_tokens ELSE 0 END), 0)::bigint as "claudeCodeTokens",
        COALESCE(SUM(CASE WHEN tool = 'cursor' THEN input_tokens + cache_write_tokens + output_tokens ELSE 0 END), 0)::bigint as "cursorTokens"
      FROM usage_records
    `;
  }

  return result.rows[0] as UsageStats;
}

export interface UnattributedStats {
  totalTokens: number;
  totalCost: number;
}

export async function getUnattributedStats(): Promise<UnattributedStats> {
  const result = await sql`
    SELECT
      COALESCE(SUM(input_tokens + cache_write_tokens + output_tokens), 0)::bigint as "totalTokens",
      COALESCE(SUM(cost), 0)::float as "totalCost"
    FROM usage_records
    WHERE email = 'unknown'
  `;
  return result.rows[0] as UnattributedStats;
}

export async function getUserSummaries(
  limit = 50,
  offset = 0,
  search?: string,
  startDate?: string,
  endDate?: string
): Promise<UserSummary[]> {

  const searchPattern = search ? `%${search}%` : null;

  const usersResult = searchPattern
    ? await sql`
        SELECT
          email,
          SUM(input_tokens + cache_write_tokens + output_tokens)::bigint as "totalTokens",
          SUM(cost)::float as "totalCost",
          SUM(CASE WHEN tool = 'claude_code' THEN input_tokens + cache_write_tokens + output_tokens ELSE 0 END)::bigint as "claudeCodeTokens",
          SUM(CASE WHEN tool = 'cursor' THEN input_tokens + cache_write_tokens + output_tokens ELSE 0 END)::bigint as "cursorTokens",
          MAX(date)::text as "lastActive"
        FROM usage_records
        WHERE email LIKE ${searchPattern} AND email != 'unknown'
          AND date >= ${startDate} AND date <= ${endDate}
        GROUP BY email
        ORDER BY "totalTokens" DESC
        LIMIT ${limit} OFFSET ${offset}
      `
    : await sql`
        SELECT
          email,
          SUM(input_tokens + cache_write_tokens + output_tokens)::bigint as "totalTokens",
          SUM(cost)::float as "totalCost",
          SUM(CASE WHEN tool = 'claude_code' THEN input_tokens + cache_write_tokens + output_tokens ELSE 0 END)::bigint as "claudeCodeTokens",
          SUM(CASE WHEN tool = 'cursor' THEN input_tokens + cache_write_tokens + output_tokens ELSE 0 END)::bigint as "cursorTokens",
          MAX(date)::text as "lastActive"
        FROM usage_records
        WHERE email != 'unknown'
          AND date >= ${startDate} AND date <= ${endDate}
        GROUP BY email
        ORDER BY "totalTokens" DESC
        LIMIT ${limit} OFFSET ${offset}
      `;

  const users = usersResult.rows;

  // Get favorite model for each user (within same time range)
  const results: UserSummary[] = [];
  for (const user of users) {
    const modelResult = await sql`
      SELECT model, SUM(input_tokens + cache_write_tokens + output_tokens)::bigint as tokens
      FROM usage_records
      WHERE email = ${user.email}
        AND date >= ${startDate} AND date <= ${endDate}
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

  const summaryResult = await sql`
    SELECT
      email,
      SUM(input_tokens + cache_write_tokens + output_tokens)::bigint as "totalTokens",
      SUM(cost)::float as "totalCost",
      SUM(CASE WHEN tool = 'claude_code' THEN input_tokens + cache_write_tokens + output_tokens ELSE 0 END)::bigint as "claudeCodeTokens",
      SUM(CASE WHEN tool = 'cursor' THEN input_tokens + cache_write_tokens + output_tokens ELSE 0 END)::bigint as "cursorTokens",
      MAX(date)::text as "lastActive",
      MIN(date)::text as "firstActive"
    FROM usage_records
    WHERE email = ${email}
    GROUP BY email
  `;

  const modelResult = await sql`
    SELECT
      model,
      SUM(input_tokens + cache_write_tokens + output_tokens)::bigint as tokens,
      tool
    FROM usage_records
    WHERE email = ${email}
    GROUP BY model, tool
    ORDER BY tokens DESC
  `;

  const dailyResult = await sql`
    SELECT
      date::text,
      SUM(CASE WHEN tool = 'claude_code' THEN input_tokens + cache_write_tokens + output_tokens ELSE 0 END)::bigint as "claudeCode",
      SUM(CASE WHEN tool = 'cursor' THEN input_tokens + cache_write_tokens + output_tokens ELSE 0 END)::bigint as cursor
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

export interface UserDetailsExtended {
  summary: {
    email: string;
    totalTokens: number;
    totalCost: number;
    claudeCodeTokens: number;
    cursorTokens: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    lastActive: string;
    firstActive: string;
    daysActive: number;
  } | undefined;
  modelBreakdown: {
    model: string;
    tokens: number;
    inputTokens: number;
    outputTokens: number;
    cost: number;
    tool: string;
  }[];
  dailyUsage: {
    date: string;
    claudeCode: number;
    cursor: number;
    inputTokens: number;
    outputTokens: number;
    cost: number;
  }[];
}

export async function getUserDetailsExtended(
  email: string,
  startDate: string,
  endDate: string
): Promise<UserDetailsExtended> {
  const summaryResult = await sql`
    SELECT
      email,
      SUM(input_tokens + cache_write_tokens + output_tokens)::bigint as "totalTokens",
      SUM(cost)::float as "totalCost",
      SUM(CASE WHEN tool = 'claude_code' THEN input_tokens + cache_write_tokens + output_tokens ELSE 0 END)::bigint as "claudeCodeTokens",
      SUM(CASE WHEN tool = 'cursor' THEN input_tokens + cache_write_tokens + output_tokens ELSE 0 END)::bigint as "cursorTokens",
      SUM(input_tokens)::bigint as "inputTokens",
      SUM(output_tokens)::bigint as "outputTokens",
      SUM(cache_read_tokens)::bigint as "cacheReadTokens",
      MAX(date)::text as "lastActive",
      MIN(date)::text as "firstActive",
      COUNT(DISTINCT date)::int as "daysActive"
    FROM usage_records
    WHERE email = ${email}
      AND date >= ${startDate} AND date <= ${endDate}
    GROUP BY email
  `;

  const modelResult = await sql`
    SELECT
      model,
      SUM(input_tokens + cache_write_tokens + output_tokens)::bigint as tokens,
      SUM(input_tokens)::bigint as "inputTokens",
      SUM(output_tokens)::bigint as "outputTokens",
      SUM(cost)::float as cost,
      tool
    FROM usage_records
    WHERE email = ${email}
      AND date >= ${startDate} AND date <= ${endDate}
    GROUP BY model, tool
    ORDER BY tokens DESC
  `;

  const dailyResult = await sql`
    WITH date_series AS (
      SELECT generate_series(
        ${startDate}::date,
        ${endDate}::date,
        '1 day'::interval
      )::date as date
    )
    SELECT
      ds.date::text,
      COALESCE(SUM(CASE WHEN r.tool = 'claude_code' THEN r.input_tokens + r.cache_write_tokens + r.output_tokens ELSE 0 END), 0)::bigint as "claudeCode",
      COALESCE(SUM(CASE WHEN r.tool = 'cursor' THEN r.input_tokens + r.cache_write_tokens + r.output_tokens ELSE 0 END), 0)::bigint as cursor,
      COALESCE(SUM(r.input_tokens), 0)::bigint as "inputTokens",
      COALESCE(SUM(r.output_tokens), 0)::bigint as "outputTokens",
      COALESCE(SUM(r.cost), 0)::float as cost
    FROM date_series ds
    LEFT JOIN usage_records r ON r.date = ds.date AND r.email = ${email}
    GROUP BY ds.date
    ORDER BY ds.date ASC
  `;

  return {
    summary: summaryResult.rows[0] as UserDetailsExtended['summary'],
    modelBreakdown: modelResult.rows as UserDetailsExtended['modelBreakdown'],
    dailyUsage: dailyResult.rows as UserDetailsExtended['dailyUsage']
  };
}

export async function getModelBreakdown(startDate?: string, endDate?: string): Promise<ModelBreakdown[]> {

  const result = startDate && endDate
    ? await sql`
        SELECT
          model,
          SUM(input_tokens + cache_write_tokens + output_tokens)::bigint as tokens,
          tool
        FROM usage_records
        WHERE date >= ${startDate} AND date <= ${endDate}
        GROUP BY model, tool
        ORDER BY tokens DESC
        LIMIT 20
      `
    : await sql`
        SELECT
          model,
          SUM(input_tokens + cache_write_tokens + output_tokens)::bigint as tokens,
          tool
        FROM usage_records
        GROUP BY model, tool
        ORDER BY tokens DESC
        LIMIT 20
      `;

  const models = result.rows as { model: string; tokens: number; tool: string }[];
  const total = models.reduce((sum, m) => sum + Number(m.tokens), 0);

  return models.map(m => ({
    ...m,
    tokens: Number(m.tokens),
    percentage: total > 0 ? Math.round((Number(m.tokens) / total) * 100) : 0
  }));
}

export async function getDailyUsage(startDate: string, endDate: string): Promise<DailyUsage[]> {

  const result = await sql`
    WITH date_series AS (
      SELECT generate_series(
        ${startDate}::date,
        ${endDate}::date,
        '1 day'::interval
      )::date as date
    )
    SELECT
      ds.date::text,
      COALESCE(SUM(CASE WHEN r.tool = 'claude_code' THEN r.input_tokens + r.cache_write_tokens + r.output_tokens ELSE 0 END), 0)::bigint as "claudeCode",
      COALESCE(SUM(CASE WHEN r.tool = 'cursor' THEN r.input_tokens + r.cache_write_tokens + r.output_tokens ELSE 0 END), 0)::bigint as cursor,
      COALESCE(SUM(r.cost), 0)::float as cost
    FROM date_series ds
    LEFT JOIN usage_records r ON r.date = ds.date
    GROUP BY ds.date
    ORDER BY ds.date ASC
  `;

  return result.rows as DailyUsage[];
}

export async function getUnmappedApiKeys(): Promise<{ api_key: string; usage_count: number }[]> {

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
  const result = await sql`SELECT api_key, email FROM api_key_mappings`;
  return result.rows as { api_key: string; email: string }[];
}

export async function setApiKeyMapping(apiKey: string, email: string): Promise<void> {

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
  await sql`DELETE FROM api_key_mappings WHERE api_key = ${apiKey}`;
}

/**
 * Resolve a username or email to a full email address.
 * If input contains @, returns as-is. Otherwise looks up username@%.
 */
export async function resolveUserEmail(usernameOrEmail: string): Promise<string | null> {
  // If it already looks like an email, return as-is
  if (usernameOrEmail.includes('@')) {
    return usernameOrEmail;
  }

  // Look up by username prefix
  const result = await sql`
    SELECT DISTINCT email FROM usage_records
    WHERE email LIKE ${usernameOrEmail + '@%'}
    LIMIT 1
  `;

  return result.rows[0]?.email || null;
}

export async function getKnownEmails(): Promise<string[]> {

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


export interface UserPivotData {
  email: string;
  totalTokens: number;
  totalCost: number;
  claudeCodeTokens: number;
  cursorTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  firstActive: string;
  lastActive: string;
  daysActive: number;
  avgTokensPerDay: number;
}

export async function getAllUsersPivot(
  sortBy: string = 'totalTokens',
  sortDir: 'asc' | 'desc' = 'desc',
  search?: string,
  startDate?: string,
  endDate?: string
): Promise<UserPivotData[]> {

  const validSortColumns = [
    'email', 'totalTokens', 'totalCost', 'claudeCodeTokens', 'cursorTokens',
    'inputTokens', 'outputTokens', 'firstActive', 'lastActive',
    'daysActive', 'avgTokensPerDay'
  ];
  const safeSortBy = validSortColumns.includes(sortBy) ? sortBy : 'totalTokens';
  const searchPattern = search ? `%${search}%` : null;

  // Get stats for specified date range, but lastActive from all time
  const result = searchPattern
    ? await sql`
        SELECT
          r.email,
          SUM(r.input_tokens + r.cache_write_tokens + r.output_tokens)::bigint as "totalTokens",
          SUM(r.cost)::float as "totalCost",
          SUM(CASE WHEN r.tool = 'claude_code' THEN r.input_tokens + r.cache_write_tokens + r.output_tokens ELSE 0 END)::bigint as "claudeCodeTokens",
          SUM(CASE WHEN r.tool = 'cursor' THEN r.input_tokens + r.cache_write_tokens + r.output_tokens ELSE 0 END)::bigint as "cursorTokens",
          SUM(r.input_tokens)::bigint as "inputTokens",
          SUM(r.output_tokens)::bigint as "outputTokens",
          SUM(r.cache_read_tokens)::bigint as "cacheReadTokens",
          MIN(r.date)::text as "firstActive",
          la."lastActive",
          COUNT(DISTINCT r.date)::int as "daysActive"
        FROM usage_records r
        JOIN (
          SELECT email, MAX(date)::text as "lastActive"
          FROM usage_records
          WHERE email != 'unknown'
          GROUP BY email
        ) la ON r.email = la.email
        WHERE r.email != 'unknown'
          AND r.email LIKE ${searchPattern}
          AND r.date >= ${startDate} AND r.date <= ${endDate}
        GROUP BY r.email, la."lastActive"
        ORDER BY "totalTokens" DESC
      `
    : await sql`
        SELECT
          r.email,
          SUM(r.input_tokens + r.cache_write_tokens + r.output_tokens)::bigint as "totalTokens",
          SUM(r.cost)::float as "totalCost",
          SUM(CASE WHEN r.tool = 'claude_code' THEN r.input_tokens + r.cache_write_tokens + r.output_tokens ELSE 0 END)::bigint as "claudeCodeTokens",
          SUM(CASE WHEN r.tool = 'cursor' THEN r.input_tokens + r.cache_write_tokens + r.output_tokens ELSE 0 END)::bigint as "cursorTokens",
          SUM(r.input_tokens)::bigint as "inputTokens",
          SUM(r.output_tokens)::bigint as "outputTokens",
          SUM(r.cache_read_tokens)::bigint as "cacheReadTokens",
          MIN(r.date)::text as "firstActive",
          la."lastActive",
          COUNT(DISTINCT r.date)::int as "daysActive"
        FROM usage_records r
        JOIN (
          SELECT email, MAX(date)::text as "lastActive"
          FROM usage_records
          WHERE email != 'unknown'
          GROUP BY email
        ) la ON r.email = la.email
        WHERE r.email != 'unknown'
          AND r.date >= ${startDate} AND r.date <= ${endDate}
        GROUP BY r.email, la."lastActive"
        ORDER BY "totalTokens" DESC
      `;

  let users = result.rows.map(u => ({
    ...u,
    avgTokensPerDay: u.daysActive > 0 ? Math.round(Number(u.totalTokens) / u.daysActive) : 0
  })) as UserPivotData[];

  // Apply sorting in JS since we can't do dynamic ORDER BY
  // Note: bigint columns come back as strings from postgres, so we need to handle
  // numeric string comparison properly
  const stringColumns = new Set(['email', 'firstActive', 'lastActive']);
  if (safeSortBy !== 'totalTokens' || sortDir !== 'desc') {
    users = users.sort((a, b) => {
      const aVal = a[safeSortBy as keyof UserPivotData];
      const bVal = b[safeSortBy as keyof UserPivotData];
      if (stringColumns.has(safeSortBy)) {
        return sortDir === 'asc'
          ? String(aVal).localeCompare(String(bVal))
          : String(bVal).localeCompare(String(aVal));
      }
      // Numeric comparison (handles bigint strings from postgres)
      return sortDir === 'asc'
        ? Number(aVal) - Number(bVal)
        : Number(bVal) - Number(aVal);
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
  const result = await sql`SELECT email FROM api_key_mappings WHERE api_key = ${apiKey}`;
  return result.rows[0]?.email || null;
}
