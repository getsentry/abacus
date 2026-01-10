import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

/**
 * Anthropic Admin API Mocks
 * Mocks the usage report and organization endpoints
 */
const anthropicHandlers = [
  // Usage report endpoint
  http.get('https://api.anthropic.com/v1/organizations/usage_report/messages', ({ request }) => {
    const url = new URL(request.url);
    const startDate = url.searchParams.get('starting_at') || '2025-01-01T00:00:00Z';

    return HttpResponse.json({
      data: [
        {
          starting_at: startDate,
          ending_at: '2025-01-01T23:59:59Z',
          results: [
            {
              api_key_id: 'test-key-123',
              workspace_id: 'ws-test',
              model: 'claude-sonnet-4-20250514',
              uncached_input_tokens: 1000,
              cache_creation: {
                ephemeral_1h_input_tokens: 0,
                ephemeral_5m_input_tokens: 100,
              },
              cache_read_input_tokens: 500,
              output_tokens: 200,
              server_tool_use: { web_search_requests: 0 },
            },
          ],
        },
      ],
      has_more: false,
    });
  }),

  // API keys list
  http.get('https://api.anthropic.com/v1/organizations/api_keys', () => {
    return HttpResponse.json({
      data: [
        {
          id: 'test-key-123',
          name: 'Test API Key',
          created_by: { id: 'user-123', name: 'Test User' },
        },
      ],
      has_more: false,
    });
  }),

  // Users list
  http.get('https://api.anthropic.com/v1/organizations/users', () => {
    return HttpResponse.json({
      data: [{ id: 'user-123', name: 'Test User', email: 'test@example.com' }],
      has_more: false,
    });
  }),

  // Individual API key lookup
  http.get('https://api.anthropic.com/v1/organizations/api_keys/:keyId', () => {
    return HttpResponse.json({
      id: 'test-key-123',
      name: 'Test API Key',
      created_by: { id: 'user-123', name: 'Test User' },
    });
  }),

  // Individual user lookup
  http.get('https://api.anthropic.com/v1/organizations/users/:userId', () => {
    return HttpResponse.json({
      id: 'user-123',
      name: 'Test User',
      email: 'test@example.com',
    });
  }),
];

/**
 * Cursor API Mocks
 */
const cursorHandlers = [
  http.post('https://api.cursor.com/teams/filtered-usage-events', () => {
    return HttpResponse.json({
      usageEvents: [
        {
          userEmail: 'test@example.com',
          model: 'claude-3-5-sonnet-20241022',
          timestamp: Date.now().toString(),
          tokenUsage: {
            inputTokens: 500,
            outputTokens: 100,
            totalCents: 5,
          },
        },
      ],
      totalUsageEventsCount: 1,
      pagination: {
        numPages: 1,
        currentPage: 1,
        pageSize: 1000,
        hasNextPage: false,
      },
    });
  }),
];

/**
 * GitHub API Mocks
 */
const githubHandlers = [
  // Repository commits
  http.get('https://api.github.com/repos/:owner/:repo/commits', () => {
    return HttpResponse.json([
      {
        sha: 'abc123def456',
        commit: {
          author: {
            name: 'Test User',
            email: 'test@example.com',
            date: '2025-01-01T12:00:00Z',
          },
          message: 'Test commit message\n\nCo-Authored-By: Claude <noreply@anthropic.com>',
        },
        stats: { additions: 10, deletions: 5 },
      },
    ]);
  }),

  // Repository info
  http.get('https://api.github.com/repos/:owner/:repo', ({ params }) => {
    return HttpResponse.json({
      id: 123456,
      name: params.repo,
      full_name: `${params.owner}/${params.repo}`,
      default_branch: 'main',
    });
  }),

  // Installation access token
  http.post(
    'https://api.github.com/app/installations/:installationId/access_tokens',
    () => {
      return HttpResponse.json({
        token: 'ghs_test_token_123',
        expires_at: new Date(Date.now() + 3600000).toISOString(),
      });
    }
  ),
];

// Combine all handlers and create server
export const handlers = [...anthropicHandlers, ...cursorHandlers, ...githubHandlers];
export const server = setupServer(...handlers);

// =============================================================================
// Error Handlers - Use with server.use() in specific tests
// =============================================================================

/**
 * Error handlers for testing failure scenarios.
 * Usage in tests:
 *   import { errorHandlers } from '@/test-utils/msw-handlers';
 *   server.use(errorHandlers.anthropic500);
 */
export const errorHandlers = {
  // Anthropic API errors
  anthropic500: http.get('https://api.anthropic.com/*', () => {
    return HttpResponse.json(
      { error: { message: 'Internal server error' } },
      { status: 500 }
    );
  }),

  anthropicRateLimit: http.get('https://api.anthropic.com/*', () => {
    return HttpResponse.json(
      { error: { message: 'Rate limit exceeded' } },
      { status: 429 }
    );
  }),

  anthropicUnauthorized: http.get('https://api.anthropic.com/*', () => {
    return HttpResponse.json(
      { error: { message: 'Invalid API key' } },
      { status: 401 }
    );
  }),

  // Cursor API errors
  cursor500: http.post('https://api.cursor.com/*', () => {
    return HttpResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }),

  cursorRateLimit: http.post('https://api.cursor.com/*', () => {
    return HttpResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429 }
    );
  }),

  // GitHub API errors
  github500: http.get('https://api.github.com/*', () => {
    return HttpResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }),

  githubRateLimit: http.get('https://api.github.com/*', () => {
    return HttpResponse.json(
      { message: 'API rate limit exceeded' },
      { status: 403 }
    );
  }),

  githubNotFound: http.get('https://api.github.com/repos/:owner/:repo', () => {
    return HttpResponse.json(
      { message: 'Not Found' },
      { status: 404 }
    );
  }),
};
