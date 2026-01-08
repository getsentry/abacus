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
  claudeCodeUsers: number;
  cursorUsers: number;
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

  // User counts per tool need separate subqueries since COUNT DISTINCT with CASE doesn't work
  const userCountsResult = await sql`
    SELECT
      (SELECT COUNT(DISTINCT email) FROM usage_records WHERE tool = 'claude_code' AND date >= ${effectiveStartDate} AND date <= ${effectiveEndDate})::int as "claudeCodeUsers",
      (SELECT COUNT(DISTINCT email) FROM usage_records WHERE tool = 'cursor' AND date >= ${effectiveStartDate} AND date <= ${effectiveEndDate})::int as "cursorUsers"
  `;

  return {
    ...result.rows[0],
    claudeCodeUsers: Number(userCountsResult.rows[0].claudeCodeUsers),
    cursorUsers: Number(userCountsResult.rows[0].cursorUsers),
  } as UsageStats;
}

export interface UsageStatsWithComparison extends UsageStats {
  previousPeriod: {
    totalTokens: number;
    totalCost: number;
    activeUsers: number;
    claudeCodeTokens: number;
    cursorTokens: number;
    claudeCodeUsers: number;
    cursorUsers: number;
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

  // User counts need separate subqueries since COUNT DISTINCT with CASE doesn't work as expected
  // COUNT(DISTINCT email) automatically excludes NULLs
  const userCountsResult = await sql`
    SELECT
      (SELECT COUNT(DISTINCT email) FROM usage_records WHERE date >= ${startDate} AND date <= ${endDate})::int as "activeUsers",
      (SELECT COUNT(DISTINCT email) FROM usage_records WHERE date >= ${prevStartDate} AND date <= ${prevEndDate})::int as "prevActiveUsers",
      (SELECT COUNT(DISTINCT email) FROM usage_records WHERE tool = 'claude_code' AND date >= ${startDate} AND date <= ${endDate})::int as "claudeCodeUsers",
      (SELECT COUNT(DISTINCT email) FROM usage_records WHERE tool = 'cursor' AND date >= ${startDate} AND date <= ${endDate})::int as "cursorUsers",
      (SELECT COUNT(DISTINCT email) FROM usage_records WHERE tool = 'claude_code' AND date >= ${prevStartDate} AND date <= ${prevEndDate})::int as "prevClaudeCodeUsers",
      (SELECT COUNT(DISTINCT email) FROM usage_records WHERE tool = 'cursor' AND date >= ${prevStartDate} AND date <= ${prevEndDate})::int as "prevCursorUsers"
  `;

  const row = result.rows[0];
  const userRow = userCountsResult.rows[0];

  return {
    totalTokens: Number(row.totalTokens),
    totalCost: Number(row.totalCost),
    totalInputTokens: Number(row.totalInputTokens),
    totalOutputTokens: Number(row.totalOutputTokens),
    totalCacheReadTokens: Number(row.totalCacheReadTokens),
    activeUsers: Number(userRow.activeUsers),
    claudeCodeTokens: Number(row.claudeCodeTokens),
    cursorTokens: Number(row.cursorTokens),
    claudeCodeUsers: Number(userRow.claudeCodeUsers),
    cursorUsers: Number(userRow.cursorUsers),
    previousPeriod: {
      totalTokens: Number(row.prevTotalTokens),
      totalCost: Number(row.prevTotalCost),
      activeUsers: Number(userRow.prevActiveUsers),
      claudeCodeTokens: Number(row.prevClaudeCodeTokens),
      cursorTokens: Number(row.prevCursorTokens),
      claudeCodeUsers: Number(userRow.prevClaudeCodeUsers),
      cursorUsers: Number(userRow.prevCursorUsers),
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
  // Use extreme dates as defaults to avoid branching - query planner handles this efficiently
  const effectiveStartDate = startDate || '1970-01-01';
  const effectiveEndDate = endDate || '9999-12-31';
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
            AND date >= ${effectiveStartDate} AND date <= ${effectiveEndDate}
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
              AND date >= ${effectiveStartDate} AND date <= ${effectiveEndDate}
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
            AND date >= ${effectiveStartDate} AND date <= ${effectiveEndDate}
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
              AND date >= ${effectiveStartDate} AND date <= ${effectiveEndDate}
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

export async function getIdentityMappings(source?: string): Promise<{ source: string; external_id: string; email: string }[]> {
  const result = source
    ? await sql`SELECT source, external_id, email FROM identity_mappings WHERE source = ${source}`
    : await sql`SELECT source, external_id, email FROM identity_mappings`;
  return result.rows as { source: string; external_id: string; email: string }[];
}

export async function setIdentityMapping(source: string, externalId: string, email: string): Promise<void> {
  await sql`
    INSERT INTO identity_mappings (source, external_id, email)
    VALUES (${source}, ${externalId}, ${email})
    ON CONFLICT (source, external_id) DO UPDATE SET email = ${email}
  `;

  // Update existing records based on source type
  if (source === 'claude_code' || source === 'cursor') {
    // For API tools: update usage records
    await sql`
      UPDATE usage_records SET email = ${email}
      WHERE tool = ${source} AND tool_record_id = ${externalId}
    `;
  } else {
    // For VCS providers (github, gitlab, etc.): update commit author emails
    await sql`
      UPDATE commits c
      SET author_email = ${email}
      FROM repositories r
      WHERE c.repo_id = r.id
        AND r.source = ${source}
        AND c.author_id = ${externalId}
    `;
  }
}

export async function deleteIdentityMapping(source: string, externalId: string): Promise<void> {
  await sql`DELETE FROM identity_mappings WHERE source = ${source} AND external_id = ${externalId}`;
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
      SELECT email FROM identity_mappings
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
  // Use extreme dates as defaults to avoid branching - query planner handles this efficiently
  const effectiveStartDate = startDate || '1970-01-01';
  const effectiveEndDate = endDate || '9999-12-31';

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
          AND r.date >= ${effectiveStartDate} AND r.date <= ${effectiveEndDate}
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
          AND r.date >= ${effectiveStartDate} AND r.date <= ${effectiveEndDate}
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

// Get existing mapping for an identity
export async function getIdentityMapping(source: string, externalId: string): Promise<string | null> {
  const result = await sql`SELECT email FROM identity_mappings WHERE source = ${source} AND external_id = ${externalId}`;
  return result.rows[0]?.email || null;
}

export interface LifetimeStats {
  totalTokens: number;
  totalCost: number;
  totalUsers: number;
  firstRecordDate: string | null;
  totalCommits: number;
  aiAttributedCommits: number;
}

export async function getLifetimeStats(): Promise<LifetimeStats> {
  const [usageResult, commitsResult] = await Promise.all([
    sql`
      SELECT
        COALESCE(SUM(input_tokens + cache_write_tokens + output_tokens), 0)::bigint as "totalTokens",
        COALESCE(SUM(cost), 0)::float as "totalCost",
        COUNT(DISTINCT email)::int as "totalUsers",
        MIN(date)::text as "firstRecordDate"
      FROM usage_records
    `,
    sql`
      SELECT
        COUNT(*)::int as "totalCommits",
        COUNT(*) FILTER (WHERE ai_tool IS NOT NULL)::int as "aiAttributedCommits"
      FROM commits
    `,
  ]);

  return {
    ...usageResult.rows[0],
    totalCommits: commitsResult.rows[0]?.totalCommits || 0,
    aiAttributedCommits: commitsResult.rows[0]?.aiAttributedCommits || 0,
  } as LifetimeStats;
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

// ============================================================================
// Commit Stats (VCS-agnostic)
// ============================================================================

export interface CommitStats {
  totalCommits: number;
  aiAssistedCommits: number;
  aiAssistanceRate: number;
  totalAdditions: number;
  totalDeletions: number;
  aiAdditions: number;
  aiDeletions: number;
  toolBreakdown: {
    tool: string;
    commits: number;
    additions: number;
    deletions: number;
  }[];
  repositoryCount: number;
}

export async function getCommitStats(startDate?: string, endDate?: string): Promise<CommitStats> {
  // Use extreme dates as defaults - query planner handles this efficiently
  const effectiveStartDate = startDate || '1970-01-01';
  const effectiveEndDate = endDate || '9999-12-31';

  const [overallResult, toolBreakdownResult, repoCountResult] = await Promise.all([
    sql`
      SELECT
        COUNT(*)::int as "totalCommits",
        COUNT(*) FILTER (WHERE ai_tool IS NOT NULL)::int as "aiAssistedCommits",
        COALESCE(SUM(additions), 0)::int as "totalAdditions",
        COALESCE(SUM(deletions), 0)::int as "totalDeletions",
        COALESCE(SUM(additions) FILTER (WHERE ai_tool IS NOT NULL), 0)::int as "aiAdditions",
        COALESCE(SUM(deletions) FILTER (WHERE ai_tool IS NOT NULL), 0)::int as "aiDeletions"
      FROM commits
      WHERE committed_at >= ${effectiveStartDate}::timestamp
        AND committed_at < (${effectiveEndDate}::date + interval '1 day')
    `,
    sql`
      SELECT
        ai_tool as tool,
        COUNT(*)::int as commits,
        COALESCE(SUM(additions), 0)::int as additions,
        COALESCE(SUM(deletions), 0)::int as deletions
      FROM commits
      WHERE ai_tool IS NOT NULL
        AND committed_at >= ${effectiveStartDate}::timestamp
        AND committed_at < (${effectiveEndDate}::date + interval '1 day')
      GROUP BY ai_tool
      ORDER BY commits DESC
    `,
    sql`
      SELECT COUNT(DISTINCT repo_id)::int as count
      FROM commits
      WHERE committed_at >= ${effectiveStartDate}::timestamp
        AND committed_at < (${effectiveEndDate}::date + interval '1 day')
    `
  ]);

  const overall = overallResult.rows[0];
  const totalCommits = Number(overall.totalCommits);
  const aiAssistedCommits = Number(overall.aiAssistedCommits);

  return {
    totalCommits,
    aiAssistedCommits,
    aiAssistanceRate: totalCommits > 0 ? Math.round((aiAssistedCommits / totalCommits) * 100) : 0,
    totalAdditions: Number(overall.totalAdditions),
    totalDeletions: Number(overall.totalDeletions),
    aiAdditions: Number(overall.aiAdditions),
    aiDeletions: Number(overall.aiDeletions),
    toolBreakdown: toolBreakdownResult.rows.map(row => ({
      tool: row.tool,
      commits: Number(row.commits),
      additions: Number(row.additions),
      deletions: Number(row.deletions),
    })),
    repositoryCount: Number(repoCountResult.rows[0].count),
  };
}

export interface CommitStatsWithComparison extends CommitStats {
  previousPeriod?: {
    totalCommits: number;
    aiAssistedCommits: number;
    aiAssistanceRate: number;
    repositoryCount: number;
  };
}

export async function getCommitStatsWithComparison(
  startDate: string,
  endDate: string
): Promise<CommitStatsWithComparison> {
  const { prevStartDate, prevEndDate } = getPreviousPeriodDates(startDate, endDate);

  const [currentStats, prevResult] = await Promise.all([
    getCommitStats(startDate, endDate),
    sql`
      SELECT
        COUNT(*)::int as "totalCommits",
        COUNT(*) FILTER (WHERE ai_tool IS NOT NULL)::int as "aiAssistedCommits",
        COUNT(DISTINCT repo_id)::int as "repositoryCount"
      FROM commits
      WHERE committed_at >= ${prevStartDate}::timestamp
        AND committed_at < (${prevEndDate}::date + interval '1 day')
    `
  ]);

  const prev = prevResult.rows[0];
  const prevTotalCommits = Number(prev.totalCommits);
  const prevAiAssistedCommits = Number(prev.aiAssistedCommits);

  return {
    ...currentStats,
    previousPeriod: {
      totalCommits: prevTotalCommits,
      aiAssistedCommits: prevAiAssistedCommits,
      aiAssistanceRate: prevTotalCommits > 0 ? Math.round((prevAiAssistedCommits / prevTotalCommits) * 100) : 0,
      repositoryCount: Number(prev.repositoryCount),
    },
  };
}

// ============================================================================
// Repository Stats (per-repo commit breakdown)
// ============================================================================

export interface RepositoryPivotData {
  id: number;
  source: string;
  fullName: string;
  totalCommits: number;
  aiAssistedCommits: number;
  aiAssistanceRate: number;
  totalAdditions: number;
  totalDeletions: number;
  aiAdditions: number;
  aiDeletions: number;
  uniqueAuthors: number;
  firstCommit: string | null;
  lastCommit: string | null;
  claudeCodeCommits: number;
  cursorCommits: number;
  copilotCommits: number;
}

export interface RepositoryPivotResult {
  repositories: RepositoryPivotData[];
  totalCount: number;
}

export async function getRepositoryPivot(
  sortBy: string = 'totalCommits',
  sortDir: 'asc' | 'desc' = 'desc',
  search?: string,
  startDate?: string,
  endDate?: string,
  limit: number = 500,
  offset: number = 0
): Promise<RepositoryPivotResult> {
  const effectiveStartDate = startDate || '1970-01-01';
  const effectiveEndDate = endDate || '9999-12-31';

  const validSortColumns = [
    'fullName', 'totalCommits', 'aiAssistedCommits', 'aiAssistanceRate',
    'totalAdditions', 'totalDeletions', 'uniqueAuthors', 'lastCommit'
  ];
  const safeSortBy = validSortColumns.includes(sortBy) ? sortBy : 'totalCommits';
  const searchPattern = search ? `%${escapeLikePattern(search)}%` : null;

  const result = searchPattern
    ? await sql`
        SELECT
          r.id,
          r.source,
          r.full_name as "fullName",
          COUNT(c.id)::int as "totalCommits",
          COUNT(c.id) FILTER (WHERE c.ai_tool IS NOT NULL)::int as "aiAssistedCommits",
          COALESCE(SUM(c.additions), 0)::int as "totalAdditions",
          COALESCE(SUM(c.deletions), 0)::int as "totalDeletions",
          COALESCE(SUM(c.additions) FILTER (WHERE c.ai_tool IS NOT NULL), 0)::int as "aiAdditions",
          COALESCE(SUM(c.deletions) FILTER (WHERE c.ai_tool IS NOT NULL), 0)::int as "aiDeletions",
          COUNT(DISTINCT c.author_email)::int as "uniqueAuthors",
          MIN(c.committed_at)::text as "firstCommit",
          MAX(c.committed_at)::text as "lastCommit",
          COUNT(c.id) FILTER (WHERE c.ai_tool = 'claude_code')::int as "claudeCodeCommits",
          COUNT(c.id) FILTER (WHERE c.ai_tool = 'cursor')::int as "cursorCommits",
          COUNT(c.id) FILTER (WHERE c.ai_tool = 'github_copilot')::int as "copilotCommits"
        FROM repositories r
        LEFT JOIN commits c ON c.repo_id = r.id
          AND c.committed_at >= ${effectiveStartDate}::timestamp
          AND c.committed_at < (${effectiveEndDate}::date + interval '1 day')
        WHERE r.full_name ILIKE ${searchPattern}
        GROUP BY r.id, r.source, r.full_name
        HAVING COUNT(c.id) > 0
        ORDER BY "totalCommits" DESC
      `
    : await sql`
        SELECT
          r.id,
          r.source,
          r.full_name as "fullName",
          COUNT(c.id)::int as "totalCommits",
          COUNT(c.id) FILTER (WHERE c.ai_tool IS NOT NULL)::int as "aiAssistedCommits",
          COALESCE(SUM(c.additions), 0)::int as "totalAdditions",
          COALESCE(SUM(c.deletions), 0)::int as "totalDeletions",
          COALESCE(SUM(c.additions) FILTER (WHERE c.ai_tool IS NOT NULL), 0)::int as "aiAdditions",
          COALESCE(SUM(c.deletions) FILTER (WHERE c.ai_tool IS NOT NULL), 0)::int as "aiDeletions",
          COUNT(DISTINCT c.author_email)::int as "uniqueAuthors",
          MIN(c.committed_at)::text as "firstCommit",
          MAX(c.committed_at)::text as "lastCommit",
          COUNT(c.id) FILTER (WHERE c.ai_tool = 'claude_code')::int as "claudeCodeCommits",
          COUNT(c.id) FILTER (WHERE c.ai_tool = 'cursor')::int as "cursorCommits",
          COUNT(c.id) FILTER (WHERE c.ai_tool = 'github_copilot')::int as "copilotCommits"
        FROM repositories r
        LEFT JOIN commits c ON c.repo_id = r.id
          AND c.committed_at >= ${effectiveStartDate}::timestamp
          AND c.committed_at < (${effectiveEndDate}::date + interval '1 day')
        GROUP BY r.id, r.source, r.full_name
        HAVING COUNT(c.id) > 0
        ORDER BY "totalCommits" DESC
      `;

  // Calculate AI assistance rate and sort in JS (for dynamic sorting)
  let repositories = result.rows.map(row => ({
    ...row,
    aiAssistanceRate: row.totalCommits > 0
      ? Math.round((row.aiAssistedCommits / row.totalCommits) * 100)
      : 0,
  })) as RepositoryPivotData[];

  // Apply custom sorting if needed
  const stringColumns = new Set(['fullName', 'source', 'firstCommit', 'lastCommit']);
  if (safeSortBy !== 'totalCommits' || sortDir !== 'desc') {
    repositories = repositories.sort((a, b) => {
      const aVal = a[safeSortBy as keyof RepositoryPivotData];
      const bVal = b[safeSortBy as keyof RepositoryPivotData];
      if (stringColumns.has(safeSortBy)) {
        return sortDir === 'asc'
          ? String(aVal ?? '').localeCompare(String(bVal ?? ''))
          : String(bVal ?? '').localeCompare(String(aVal ?? ''));
      }
      return sortDir === 'asc'
        ? Number(aVal) - Number(bVal)
        : Number(bVal) - Number(aVal);
    });
  }

  const totalCount = repositories.length;
  const paginatedRepos = repositories.slice(offset, offset + limit);

  return { repositories: paginatedRepos, totalCount };
}

/**
 * Get daily commit trends for charts
 */
export interface DailyCommitStats {
  date: string;
  totalCommits: number;
  aiAssistedCommits: number;
  additions: number;
  deletions: number;
}

export async function getDailyCommitStats(
  startDate: string,
  endDate: string
): Promise<DailyCommitStats[]> {
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
      COALESCE(COUNT(c.id), 0)::int as "totalCommits",
      COALESCE(COUNT(c.id) FILTER (WHERE c.ai_tool IS NOT NULL), 0)::int as "aiAssistedCommits",
      COALESCE(SUM(c.additions), 0)::int as additions,
      COALESCE(SUM(c.deletions), 0)::int as deletions
    FROM date_series ds
    LEFT JOIN commits c ON c.committed_at::date = ds.date
    GROUP BY ds.date
    ORDER BY ds.date ASC
  `;

  return result.rows as DailyCommitStats[];
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

/**
 * Repository Detail Queries
 */

export interface RepositoryDetails {
  id: number;
  source: string;
  fullName: string;
  totalCommits: number;
  aiAssistedCommits: number;
  aiAssistanceRate: number;
  totalAdditions: number;
  totalDeletions: number;
  aiAdditions: number;
  aiDeletions: number;
  uniqueAuthors: number;
  firstCommit: string | null;
  lastCommit: string | null;
  claudeCodeCommits: number;
  cursorCommits: number;
  copilotCommits: number;
  windsurfCommits: number;
}

export interface CommitAttributionData {
  aiTool: string;
  aiModel: string | null;
  confidence: string;
  source: string | null;
}

export interface RepositoryCommit {
  id: number;
  commitId: string;
  authorEmail: string;
  committedAt: string;
  message: string | null;
  aiTool: string | null;
  aiModel: string | null;
  additions: number;
  deletions: number;
  attributions?: CommitAttributionData[];
}

export interface RepositoryAuthor {
  authorEmail: string;
  totalCommits: number;
  aiAssistedCommits: number;
  aiAssistanceRate: number;
  lastCommit: string;
}

export interface DailyRepoCommitStats {
  date: string;
  totalCommits: number;
  claudeCodeCommits: number;
  cursorCommits: number;
  copilotCommits: number;
  windsurfCommits: number;
}

export async function getRepositoryByFullName(
  source: string,
  fullName: string
): Promise<{ id: number; source: string; fullName: string } | null> {
  const result = await sql`
    SELECT id, source, full_name as "fullName"
    FROM repositories
    WHERE source = ${source} AND full_name = ${fullName}
  `;
  return result.rows[0] as { id: number; source: string; fullName: string } | null;
}

export async function getRepositoryDetails(
  repoId: number,
  startDate?: string,
  endDate?: string
): Promise<RepositoryDetails | null> {
  const effectiveStartDate = startDate || '1970-01-01';
  const effectiveEndDate = endDate || '9999-12-31';

  const result = await sql`
    SELECT
      r.id,
      r.source,
      r.full_name as "fullName",
      COUNT(c.id)::int as "totalCommits",
      COUNT(c.id) FILTER (WHERE c.ai_tool IS NOT NULL)::int as "aiAssistedCommits",
      COALESCE(SUM(c.additions), 0)::int as "totalAdditions",
      COALESCE(SUM(c.deletions), 0)::int as "totalDeletions",
      COALESCE(SUM(c.additions) FILTER (WHERE c.ai_tool IS NOT NULL), 0)::int as "aiAdditions",
      COALESCE(SUM(c.deletions) FILTER (WHERE c.ai_tool IS NOT NULL), 0)::int as "aiDeletions",
      COUNT(DISTINCT c.author_email)::int as "uniqueAuthors",
      MIN(c.committed_at)::text as "firstCommit",
      MAX(c.committed_at)::text as "lastCommit",
      COUNT(c.id) FILTER (WHERE c.ai_tool = 'claude_code')::int as "claudeCodeCommits",
      COUNT(c.id) FILTER (WHERE c.ai_tool = 'cursor')::int as "cursorCommits",
      COUNT(c.id) FILTER (WHERE c.ai_tool = 'github_copilot')::int as "copilotCommits",
      COUNT(c.id) FILTER (WHERE c.ai_tool = 'windsurf')::int as "windsurfCommits"
    FROM repositories r
    LEFT JOIN commits c ON c.repo_id = r.id
      AND c.committed_at >= ${effectiveStartDate}::timestamp
      AND c.committed_at < (${effectiveEndDate}::date + interval '1 day')
    WHERE r.id = ${repoId}
    GROUP BY r.id, r.source, r.full_name
  `;

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    ...row,
    aiAssistanceRate: row.totalCommits > 0
      ? Math.round((row.aiAssistedCommits / row.totalCommits) * 100)
      : 0,
  } as RepositoryDetails;
}

export interface RepositoryDetailsPreviousPeriod {
  totalCommits: number;
  aiAssistedCommits: number;
  aiAssistanceRate: number;
  uniqueAuthors: number;
  totalAdditions: number;
  totalDeletions: number;
}

export interface RepositoryDetailsWithComparison extends RepositoryDetails {
  previousPeriod?: RepositoryDetailsPreviousPeriod;
}

export async function getRepositoryDetailsWithComparison(
  repoId: number,
  startDate: string,
  endDate: string
): Promise<RepositoryDetailsWithComparison | null> {
  const { prevStartDate, prevEndDate } = getPreviousPeriodDates(startDate, endDate);

  const [currentDetails, prevResult] = await Promise.all([
    getRepositoryDetails(repoId, startDate, endDate),
    sql`
      SELECT
        COUNT(c.id)::int as "totalCommits",
        COUNT(c.id) FILTER (WHERE c.ai_tool IS NOT NULL)::int as "aiAssistedCommits",
        COUNT(DISTINCT c.author_email)::int as "uniqueAuthors",
        COALESCE(SUM(c.additions), 0)::int as "totalAdditions",
        COALESCE(SUM(c.deletions), 0)::int as "totalDeletions"
      FROM commits c
      WHERE c.repo_id = ${repoId}
        AND c.committed_at >= ${prevStartDate}::timestamp
        AND c.committed_at < (${prevEndDate}::date + interval '1 day')
    `
  ]);

  if (!currentDetails) return null;

  const prev = prevResult.rows[0];
  const prevTotalCommits = Number(prev.totalCommits);
  const prevAiAssistedCommits = Number(prev.aiAssistedCommits);

  return {
    ...currentDetails,
    previousPeriod: {
      totalCommits: prevTotalCommits,
      aiAssistedCommits: prevAiAssistedCommits,
      aiAssistanceRate: prevTotalCommits > 0
        ? Math.round((prevAiAssistedCommits / prevTotalCommits) * 100)
        : 0,
      uniqueAuthors: Number(prev.uniqueAuthors),
      totalAdditions: Number(prev.totalAdditions),
      totalDeletions: Number(prev.totalDeletions),
    },
  };
}

export async function getRepositoryCommits(
  repoId: number,
  startDate?: string,
  endDate?: string,
  limit: number = 100,
  offset: number = 0,
  aiFilter?: 'all' | 'ai' | 'human'
): Promise<{ commits: RepositoryCommit[]; totalCount: number }> {
  const effectiveStartDate = startDate || '1970-01-01';
  const effectiveEndDate = endDate || '9999-12-31';

  // Build filter condition
  let aiCondition = '';
  if (aiFilter === 'ai') {
    aiCondition = 'AND c.ai_tool IS NOT NULL';
  } else if (aiFilter === 'human') {
    aiCondition = 'AND c.ai_tool IS NULL';
  }

  const countResult = await sql.query(`
    SELECT COUNT(*)::int as count
    FROM commits c
    WHERE c.repo_id = $1
      AND c.committed_at >= $2::timestamp
      AND c.committed_at < ($3::date + interval '1 day')
      ${aiCondition}
  `, [repoId, effectiveStartDate, effectiveEndDate]);

  const result = await sql.query(`
    SELECT
      c.id,
      c.commit_id as "commitId",
      c.author_email as "authorEmail",
      c.committed_at::text as "committedAt",
      c.message,
      c.ai_tool as "aiTool",
      c.ai_model as "aiModel",
      COALESCE(c.additions, 0)::int as additions,
      COALESCE(c.deletions, 0)::int as deletions
    FROM commits c
    WHERE c.repo_id = $1
      AND c.committed_at >= $2::timestamp
      AND c.committed_at < ($3::date + interval '1 day')
      ${aiCondition}
    ORDER BY c.committed_at DESC
    LIMIT $4 OFFSET $5
  `, [repoId, effectiveStartDate, effectiveEndDate, limit, offset]);

  // Fetch attributions for all commits in one query
  const commitIds = result.rows.map(r => r.id);
  let attributionsByCommitId: Map<number, CommitAttributionData[]> = new Map();

  if (commitIds.length > 0) {
    const attrResult = await sql.query(`
      SELECT
        commit_id as "commitId",
        ai_tool as "aiTool",
        ai_model as "aiModel",
        confidence,
        source
      FROM commit_attributions
      WHERE commit_id = ANY($1)
      ORDER BY created_at ASC
    `, [commitIds]);

    for (const row of attrResult.rows) {
      const existing = attributionsByCommitId.get(row.commitId) || [];
      existing.push({
        aiTool: row.aiTool,
        aiModel: row.aiModel,
        confidence: row.confidence,
        source: row.source,
      });
      attributionsByCommitId.set(row.commitId, existing);
    }
  }

  const commits: RepositoryCommit[] = result.rows.map(row => ({
    ...row,
    attributions: attributionsByCommitId.get(row.id) || [],
  }));

  return {
    commits,
    totalCount: countResult.rows[0].count,
  };
}

export async function getRepositoryAuthors(
  repoId: number,
  startDate?: string,
  endDate?: string,
  limit: number = 20
): Promise<RepositoryAuthor[]> {
  const effectiveStartDate = startDate || '1970-01-01';
  const effectiveEndDate = endDate || '9999-12-31';

  const result = await sql`
    SELECT
      c.author_email as "authorEmail",
      COUNT(*)::int as "totalCommits",
      COUNT(*) FILTER (WHERE c.ai_tool IS NOT NULL)::int as "aiAssistedCommits",
      MAX(c.committed_at)::text as "lastCommit"
    FROM commits c
    WHERE c.repo_id = ${repoId}
      AND c.committed_at >= ${effectiveStartDate}::timestamp
      AND c.committed_at < (${effectiveEndDate}::date + interval '1 day')
    GROUP BY c.author_email
    ORDER BY "totalCommits" DESC
    LIMIT ${limit}
  `;

  return result.rows.map(row => ({
    ...row,
    aiAssistanceRate: row.totalCommits > 0
      ? Math.round((row.aiAssistedCommits / row.totalCommits) * 100)
      : 0,
  })) as RepositoryAuthor[];
}

export async function getRepositoryDailyStats(
  repoId: number,
  startDate: string,
  endDate: string
): Promise<DailyRepoCommitStats[]> {
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
      COALESCE(COUNT(c.id), 0)::int as "totalCommits",
      COALESCE(COUNT(c.id) FILTER (WHERE c.ai_tool = 'claude_code'), 0)::int as "claudeCodeCommits",
      COALESCE(COUNT(c.id) FILTER (WHERE c.ai_tool = 'cursor'), 0)::int as "cursorCommits",
      COALESCE(COUNT(c.id) FILTER (WHERE c.ai_tool = 'github_copilot'), 0)::int as "copilotCommits",
      COALESCE(COUNT(c.id) FILTER (WHERE c.ai_tool = 'windsurf'), 0)::int as "windsurfCommits"
    FROM date_series ds
    LEFT JOIN commits c ON c.committed_at::date = ds.date AND c.repo_id = ${repoId}
    GROUP BY ds.date
    ORDER BY ds.date ASC
  `;

  return result.rows as DailyRepoCommitStats[];
}
