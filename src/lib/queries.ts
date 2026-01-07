import { sql } from '@vercel/postgres';
import { DEFAULT_DAYS } from './constants';
import { escapeLikePattern } from './utils';
import {
  type AdoptionStage,
  calculateAdoptionScore,
  getAdoptionStage,
} from './adoption';
import { getPreviousPeriodDates } from './comparison';


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
  // Use extreme dates as defaults to avoid branching - query planner handles this efficiently
  const effectiveStartDate = startDate || '1970-01-01';
  const effectiveEndDate = endDate || '9999-12-31';

  const result = await sql`
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
    WHERE date >= ${effectiveStartDate} AND date <= ${effectiveEndDate}
  `;

  return result.rows[0] as UsageStats;
}

export interface UsageStatsWithComparison extends UsageStats {
  previousPeriod: {
    totalTokens: number;
    totalCost: number;
    activeUsers: number;
    claudeCodeTokens: number;
    cursorTokens: number;
  };
}

export async function getOverallStatsWithComparison(
  startDate: string,
  endDate: string
): Promise<UsageStatsWithComparison> {
  const { prevStartDate, prevEndDate } = getPreviousPeriodDates(startDate, endDate);

  const result = await sql`
    SELECT
      -- Current period
      COALESCE(SUM(CASE WHEN date >= ${startDate} AND date <= ${endDate}
        THEN input_tokens + cache_write_tokens + output_tokens ELSE 0 END), 0)::bigint as "totalTokens",
      COALESCE(SUM(CASE WHEN date >= ${startDate} AND date <= ${endDate}
        THEN cost ELSE 0 END), 0)::float as "totalCost",
      COALESCE(SUM(CASE WHEN date >= ${startDate} AND date <= ${endDate}
        THEN input_tokens ELSE 0 END), 0)::bigint as "totalInputTokens",
      COALESCE(SUM(CASE WHEN date >= ${startDate} AND date <= ${endDate}
        THEN output_tokens ELSE 0 END), 0)::bigint as "totalOutputTokens",
      COALESCE(SUM(CASE WHEN date >= ${startDate} AND date <= ${endDate}
        THEN cache_read_tokens ELSE 0 END), 0)::bigint as "totalCacheReadTokens",
      COALESCE(SUM(CASE WHEN date >= ${startDate} AND date <= ${endDate} AND tool = 'claude_code'
        THEN input_tokens + cache_write_tokens + output_tokens ELSE 0 END), 0)::bigint as "claudeCodeTokens",
      COALESCE(SUM(CASE WHEN date >= ${startDate} AND date <= ${endDate} AND tool = 'cursor'
        THEN input_tokens + cache_write_tokens + output_tokens ELSE 0 END), 0)::bigint as "cursorTokens",
      -- Previous period
      COALESCE(SUM(CASE WHEN date >= ${prevStartDate} AND date <= ${prevEndDate}
        THEN input_tokens + cache_write_tokens + output_tokens ELSE 0 END), 0)::bigint as "prevTotalTokens",
      COALESCE(SUM(CASE WHEN date >= ${prevStartDate} AND date <= ${prevEndDate}
        THEN cost ELSE 0 END), 0)::float as "prevTotalCost",
      COALESCE(SUM(CASE WHEN date >= ${prevStartDate} AND date <= ${prevEndDate} AND tool = 'claude_code'
        THEN input_tokens + cache_write_tokens + output_tokens ELSE 0 END), 0)::bigint as "prevClaudeCodeTokens",
      COALESCE(SUM(CASE WHEN date >= ${prevStartDate} AND date <= ${prevEndDate} AND tool = 'cursor'
        THEN input_tokens + cache_write_tokens + output_tokens ELSE 0 END), 0)::bigint as "prevCursorTokens"
    FROM usage_records
    WHERE date >= ${prevStartDate} AND date <= ${endDate}
  `;

  // Active users need separate subqueries since COUNT DISTINCT with CASE doesn't work as expected
  // COUNT(DISTINCT email) automatically excludes NULLs
  const activeUsersResult = await sql`
    SELECT
      (SELECT COUNT(DISTINCT email) FROM usage_records WHERE date >= ${startDate} AND date <= ${endDate})::int as "activeUsers",
      (SELECT COUNT(DISTINCT email) FROM usage_records WHERE date >= ${prevStartDate} AND date <= ${prevEndDate})::int as "prevActiveUsers"
  `;

  const row = result.rows[0];
  const activeRow = activeUsersResult.rows[0];

  return {
    totalTokens: Number(row.totalTokens),
    totalCost: Number(row.totalCost),
    totalInputTokens: Number(row.totalInputTokens),
    totalOutputTokens: Number(row.totalOutputTokens),
    totalCacheReadTokens: Number(row.totalCacheReadTokens),
    activeUsers: Number(activeRow.activeUsers),
    claudeCodeTokens: Number(row.claudeCodeTokens),
    cursorTokens: Number(row.cursorTokens),
    previousPeriod: {
      totalTokens: Number(row.prevTotalTokens),
      totalCost: Number(row.prevTotalCost),
      activeUsers: Number(activeRow.prevActiveUsers),
      claudeCodeTokens: Number(row.prevClaudeCodeTokens),
      cursorTokens: Number(row.prevCursorTokens),
    },
  };
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
    WHERE email IS NULL
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
  const searchPattern = search ? `%${escapeLikePattern(search)}%` : null;

  // Single query with CTEs to avoid N+1 problem for favoriteModel
  const result = searchPattern
    ? await sql`
        WITH user_stats AS (
          SELECT
            email,
            SUM(input_tokens + cache_write_tokens + output_tokens)::bigint as "totalTokens",
            SUM(cost)::float as "totalCost",
            SUM(CASE WHEN tool = 'claude_code' THEN input_tokens + cache_write_tokens + output_tokens ELSE 0 END)::bigint as "claudeCodeTokens",
            SUM(CASE WHEN tool = 'cursor' THEN input_tokens + cache_write_tokens + output_tokens ELSE 0 END)::bigint as "cursorTokens",
            MAX(date)::text as "lastActive"
          FROM usage_records
          WHERE email LIKE ${searchPattern} AND email IS NOT NULL
            AND date >= ${startDate} AND date <= ${endDate}
          GROUP BY email
        ),
        user_models AS (
          SELECT DISTINCT ON (email)
            email,
            model as "favoriteModel"
          FROM (
            SELECT
              email,
              model,
              SUM(input_tokens + cache_write_tokens + output_tokens) as model_tokens
            FROM usage_records
            WHERE email LIKE ${searchPattern} AND email IS NOT NULL
              AND date >= ${startDate} AND date <= ${endDate}
            GROUP BY email, model
          ) m
          ORDER BY email, model_tokens DESC
        )
        SELECT
          us.*,
          COALESCE(um."favoriteModel", 'unknown') as "favoriteModel"
        FROM user_stats us
        LEFT JOIN user_models um ON us.email = um.email
        ORDER BY us."totalTokens" DESC
        LIMIT ${limit} OFFSET ${offset}
      `
    : await sql`
        WITH user_stats AS (
          SELECT
            email,
            SUM(input_tokens + cache_write_tokens + output_tokens)::bigint as "totalTokens",
            SUM(cost)::float as "totalCost",
            SUM(CASE WHEN tool = 'claude_code' THEN input_tokens + cache_write_tokens + output_tokens ELSE 0 END)::bigint as "claudeCodeTokens",
            SUM(CASE WHEN tool = 'cursor' THEN input_tokens + cache_write_tokens + output_tokens ELSE 0 END)::bigint as "cursorTokens",
            MAX(date)::text as "lastActive"
          FROM usage_records
          WHERE email IS NOT NULL
            AND date >= ${startDate} AND date <= ${endDate}
          GROUP BY email
        ),
        user_models AS (
          SELECT DISTINCT ON (email)
            email,
            model as "favoriteModel"
          FROM (
            SELECT
              email,
              model,
              SUM(input_tokens + cache_write_tokens + output_tokens) as model_tokens
            FROM usage_records
            WHERE email IS NOT NULL
              AND date >= ${startDate} AND date <= ${endDate}
            GROUP BY email, model
          ) m
          ORDER BY email, model_tokens DESC
        )
        SELECT
          us.*,
          COALESCE(um."favoriteModel", 'unknown') as "favoriteModel"
        FROM user_stats us
        LEFT JOIN user_models um ON us.email = um.email
        ORDER BY us."totalTokens" DESC
        LIMIT ${limit} OFFSET ${offset}
      `;

  return result.rows as UserSummary[];
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
  // Note: We include all users (including unknown) in model breakdown
  // since we want to see total model usage across all API activity
  const effectiveStartDate = startDate || '1970-01-01';
  const effectiveEndDate = endDate || '9999-12-31';

  const result = await sql`
    SELECT
      model,
      SUM(input_tokens + cache_write_tokens + output_tokens)::bigint as tokens,
      tool
    FROM usage_records
    WHERE date >= ${effectiveStartDate} AND date <= ${effectiveEndDate}
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

export async function getUnmappedToolRecords(tool: string = 'claude_code'): Promise<{ tool_record_id: string; usage_count: number }[]> {

  const result = await sql`
    SELECT
      tool_record_id,
      COUNT(*)::int as usage_count
    FROM usage_records
    WHERE tool = ${tool}
      AND email IS NULL
      AND tool_record_id IS NOT NULL
    GROUP BY tool_record_id
    ORDER BY usage_count DESC
  `;

  return result.rows as { tool_record_id: string; usage_count: number }[];
}

export async function getToolIdentityMappings(tool?: string): Promise<{ tool: string; external_id: string; email: string }[]> {
  const result = tool
    ? await sql`SELECT tool, external_id, email FROM tool_identity_mappings WHERE tool = ${tool}`
    : await sql`SELECT tool, external_id, email FROM tool_identity_mappings`;
  return result.rows as { tool: string; external_id: string; email: string }[];
}

export async function setToolIdentityMapping(tool: string, externalId: string, email: string): Promise<void> {

  await sql`
    INSERT INTO tool_identity_mappings (tool, external_id, email)
    VALUES (${tool}, ${externalId}, ${email})
    ON CONFLICT (tool, external_id) DO UPDATE SET email = ${email}
  `;

  // Update any existing usage records with this identity
  await sql`
    UPDATE usage_records SET email = ${email}
    WHERE tool = ${tool} AND tool_record_id = ${externalId}
  `;
}

export async function deleteToolIdentityMapping(tool: string, externalId: string): Promise<void> {
  await sql`DELETE FROM tool_identity_mappings WHERE tool = ${tool} AND external_id = ${externalId}`;
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

  // Look up by username prefix (escape to prevent LIKE injection)
  const result = await sql`
    SELECT DISTINCT email FROM usage_records
    WHERE email LIKE ${escapeLikePattern(usernameOrEmail) + '@%'}
    LIMIT 1
  `;

  return result.rows[0]?.email || null;
}

export async function getKnownEmails(): Promise<string[]> {

  const result = await sql`
    SELECT DISTINCT email FROM (
      SELECT email FROM usage_records WHERE tool = 'cursor' AND email IS NOT NULL
      UNION
      SELECT email FROM tool_identity_mappings
      UNION
      SELECT email FROM usage_records WHERE email LIKE '%@%' AND email IS NOT NULL
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
  // Adoption metrics
  toolCount: number;
  hasThinkingModels: boolean;
  adoptionScore: number;
  adoptionStage: AdoptionStage;
  daysSinceLastActive: number;
}

export interface UserPivotResult {
  users: UserPivotData[];
  totalCount: number;
}

export async function getAllUsersPivot(
  sortBy: string = 'totalTokens',
  sortDir: 'asc' | 'desc' = 'desc',
  search?: string,
  startDate?: string,
  endDate?: string,
  limit: number = 500,
  offset: number = 0
): Promise<UserPivotResult> {

  const validSortColumns = [
    'email', 'totalTokens', 'totalCost', 'claudeCodeTokens', 'cursorTokens',
    'inputTokens', 'outputTokens', 'firstActive', 'lastActive',
    'daysActive', 'avgTokensPerDay', 'adoptionScore', 'adoptionStage'
  ];
  const safeSortBy = validSortColumns.includes(sortBy) ? sortBy : 'totalTokens';
  const searchPattern = search ? `%${escapeLikePattern(search)}%` : null;

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
          COUNT(DISTINCT r.date)::int as "daysActive",
          COUNT(DISTINCT r.tool)::int as "toolCount",
          BOOL_OR(r.model LIKE '%(%T%)' OR r.model LIKE '%(%HT%)')::boolean as "hasThinkingModels"
        FROM usage_records r
        JOIN (
          SELECT email, MAX(date)::text as "lastActive"
          FROM usage_records
          WHERE email IS NOT NULL
          GROUP BY email
        ) la ON r.email = la.email
        WHERE r.email IS NOT NULL
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
          COUNT(DISTINCT r.date)::int as "daysActive",
          COUNT(DISTINCT r.tool)::int as "toolCount",
          BOOL_OR(r.model LIKE '%(%T%)' OR r.model LIKE '%(%HT%)')::boolean as "hasThinkingModels"
        FROM usage_records r
        JOIN (
          SELECT email, MAX(date)::text as "lastActive"
          FROM usage_records
          WHERE email IS NOT NULL
          GROUP BY email
        ) la ON r.email = la.email
        WHERE r.email IS NOT NULL
          AND r.date >= ${startDate} AND r.date <= ${endDate}
        GROUP BY r.email, la."lastActive"
        ORDER BY "totalTokens" DESC
      `;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let users = result.rows.map(u => {
    // Calculate days since last active
    const lastActiveDate = new Date(u.lastActive);
    lastActiveDate.setHours(0, 0, 0, 0);
    const daysSinceLastActive = Math.floor((today.getTime() - lastActiveDate.getTime()) / (1000 * 60 * 60 * 24));

    // Build adoption metrics
    const adoptionMetrics = {
      totalTokens: Number(u.totalTokens),
      daysActive: u.daysActive,
      daysSinceLastActive,
    };

    // Calculate adoption score and stage
    const adoptionScore = calculateAdoptionScore(adoptionMetrics);
    const adoptionStage = getAdoptionStage(adoptionMetrics);

    return {
      ...u,
      avgTokensPerDay: u.daysActive > 0 ? Math.round(Number(u.totalTokens) / u.daysActive) : 0,
      daysSinceLastActive,
      adoptionScore,
      adoptionStage,
    };
  }) as UserPivotData[];

  // Apply sorting in JS since we can't do dynamic ORDER BY
  // Note: bigint columns come back as strings from postgres, so we need to handle
  // numeric string comparison properly
  const stringColumns = new Set(['email', 'firstActive', 'lastActive', 'adoptionStage']);
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

  // Apply pagination after sorting
  const totalCount = users.length;
  const paginatedUsers = users.slice(offset, offset + limit);

  return { users: paginatedUsers, totalCount };
}

// Insert usage record
export async function insertUsageRecord(record: {
  date: string;
  email: string | null;
  tool: string;
  model: string;
  inputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  outputTokens: number;
  cost: number;
  toolRecordId?: string;
}): Promise<void> {
  await sql`
    INSERT INTO usage_records (date, email, tool, model, input_tokens, cache_write_tokens, cache_read_tokens, output_tokens, cost, tool_record_id)
    VALUES (${record.date}, ${record.email}, ${record.tool}, ${record.model}, ${record.inputTokens}, ${record.cacheWriteTokens}, ${record.cacheReadTokens}, ${record.outputTokens}, ${record.cost}, ${record.toolRecordId || null})
    ON CONFLICT (date, COALESCE(email, ''), tool, model, COALESCE(tool_record_id, ''))
    DO UPDATE SET
      input_tokens = EXCLUDED.input_tokens,
      cache_write_tokens = EXCLUDED.cache_write_tokens,
      cache_read_tokens = EXCLUDED.cache_read_tokens,
      output_tokens = EXCLUDED.output_tokens,
      cost = EXCLUDED.cost
  `;
}

// Get existing mapping for a tool identity
export async function getToolIdentityMapping(tool: string, externalId: string): Promise<string | null> {
  const result = await sql`SELECT email FROM tool_identity_mappings WHERE tool = ${tool} AND external_id = ${externalId}`;
  return result.rows[0]?.email || null;
}

export interface LifetimeStats {
  totalTokens: number;
  totalCost: number;
  totalUsers: number;
  firstRecordDate: string | null;
}

export async function getLifetimeStats(): Promise<LifetimeStats> {
  const result = await sql`
    SELECT
      COALESCE(SUM(input_tokens + cache_write_tokens + output_tokens), 0)::bigint as "totalTokens",
      COALESCE(SUM(cost), 0)::float as "totalCost",
      COUNT(DISTINCT email)::int as "totalUsers",
      MIN(date)::text as "firstRecordDate"
    FROM usage_records
  `;
  return result.rows[0] as LifetimeStats;
}

export interface UserLifetimeStats {
  totalTokens: number;
  totalCost: number;
  firstRecordDate: string | null;
  favoriteTool: string | null;
  recordDay: { date: string; tokens: number } | null;
}

export async function getUserLifetimeStats(email: string): Promise<UserLifetimeStats> {
  const [statsResult, toolResult, recordDayResult] = await Promise.all([
    sql`
      SELECT
        COALESCE(SUM(input_tokens + cache_write_tokens + output_tokens), 0)::bigint as "totalTokens",
        COALESCE(SUM(cost), 0)::float as "totalCost",
        MIN(date)::text as "firstRecordDate"
      FROM usage_records
      WHERE email = ${email}
    `,
    sql`
      SELECT tool, SUM(input_tokens + cache_write_tokens + output_tokens)::bigint as tokens
      FROM usage_records
      WHERE email = ${email}
      GROUP BY tool
      ORDER BY tokens DESC
      LIMIT 1
    `,
    sql`
      SELECT date::text, SUM(input_tokens + cache_write_tokens + output_tokens)::bigint as tokens
      FROM usage_records
      WHERE email = ${email}
      GROUP BY date
      ORDER BY tokens DESC
      LIMIT 1
    `
  ]);

  return {
    ...statsResult.rows[0],
    favoriteTool: toolResult.rows[0]?.tool || null,
    recordDay: recordDayResult.rows[0] ? {
      date: recordDayResult.rows[0].date,
      tokens: Number(recordDayResult.rows[0].tokens)
    } : null
  } as UserLifetimeStats;
}

export interface AdoptionSummary {
  stages: Record<AdoptionStage, { count: number; percentage: number; users: string[] }>;
  avgScore: number;
  inactive: { count: number; users: string[] };
  totalUsers: number;
  activeUsers: number;
}

export async function getAdoptionSummary(
  startDate?: string,
  endDate?: string
): Promise<AdoptionSummary> {
  // Get all users with adoption data
  const { users } = await getAllUsersPivot('totalTokens', 'desc', undefined, startDate, endDate, 10000, 0);

  // Initialize stage counts
  const stages: Record<AdoptionStage, { count: number; percentage: number; users: string[] }> = {
    exploring: { count: 0, percentage: 0, users: [] },
    building_momentum: { count: 0, percentage: 0, users: [] },
    in_flow: { count: 0, percentage: 0, users: [] },
    power_user: { count: 0, percentage: 0, users: [] },
  };

  const inactive: { count: number; users: string[] } = { count: 0, users: [] };
  let totalScore = 0;

  // Count users by stage
  for (const user of users) {
    stages[user.adoptionStage].count++;
    stages[user.adoptionStage].users.push(user.email);
    totalScore += user.adoptionScore;

    // Check if user is inactive (30+ days)
    if (user.daysSinceLastActive >= 30) {
      inactive.count++;
      inactive.users.push(user.email);
    }
  }

  // Calculate percentages
  // Note: totalUsers = all users with activity in the date range (they ARE active for that period)
  // The "inactive" concept (30+ days since last global activity) is for filtering the user list,
  // not for reducing the aggregate active count
  const totalUsers = users.length;
  for (const stage of Object.keys(stages) as AdoptionStage[]) {
    stages[stage].percentage = totalUsers > 0
      ? Math.round((stages[stage].count / totalUsers) * 100)
      : 0;
  }

  return {
    stages,
    avgScore: totalUsers > 0 ? Math.round(totalScore / totalUsers) : 0,
    inactive,
    totalUsers,
    activeUsers: totalUsers, // All users with activity in the date range are "active" for that period
  };
}

/**
 * Get a user's percentile rank based on avgTokensPerDay compared to all users
 * Returns a number 0-100 where higher = better (e.g., 85 means top 15%)
 */
export async function getUserPercentile(
  email: string,
  startDate: string,
  endDate: string
): Promise<number> {
  // Get all users' avgTokensPerDay for the period
  const result = await sql`
    SELECT
      email,
      CASE
        WHEN COUNT(DISTINCT date) > 0
        THEN SUM(input_tokens + cache_write_tokens + output_tokens)::float / COUNT(DISTINCT date)
        ELSE 0
      END as avg_tokens_per_day
    FROM usage_records
    WHERE email IS NOT NULL
      AND date >= ${startDate} AND date <= ${endDate}
    GROUP BY email
    HAVING COUNT(DISTINCT date) >= 2
    ORDER BY avg_tokens_per_day DESC
  `;

  const users = result.rows;
  const totalUsers = users.length;

  if (totalUsers === 0) {
    return 50; // Default to middle if no data
  }

  // Find the user's position
  const userIndex = users.findIndex(u => u.email === email);

  if (userIndex === -1) {
    return 0; // User not found or doesn't meet min days threshold
  }

  // Calculate percentile (0 = worst, 100 = best)
  // Position 0 (best) = 100th percentile
  // Position last = 0th percentile
  const percentile = Math.round(((totalUsers - 1 - userIndex) / (totalUsers - 1)) * 100);

  return Math.max(0, Math.min(100, percentile));
}
