import { OpenRouter } from '@openrouter/sdk';
import { OpenRouterError } from '@openrouter/sdk/models/errors';

function getClient() {
  const apiKey = process.env.OPENROUTER_MANAGEMENT_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_MANAGEMENT_KEY is not set');
  }

  return new OpenRouter({
    apiKey,
    timeoutMs: 5000,
    retryConfig: {
      strategy: 'backoff',
      backoff: {
        initialInterval: 250,
        maxInterval: 1000,
        exponent: 2,
        maxElapsedTime: 4000,
      },
      retryConnectionErrors: false,
    },
  });
}

export { OpenRouterError };

export interface CreateOpenRouterKeyParams {
  name: string;
  /** OpenRouter workspace UUID to create the key in. Omit for the account default workspace. */
  workspaceId?: string;
  limit?: number | null;
  limitReset?: 'daily' | 'weekly' | 'monthly' | null;
  includeByokInLimit?: boolean;
  creatorUserId?: string | null;
  expiresAt?: Date | null;
}

export interface ListOpenRouterKeysOptions {
  offset?: number | null;
  includeDisabled?: boolean;
  /** Filter by workspace UUID. Omit to list keys in the account default workspace. */
  workspaceId?: string;
}

export interface UpdateOpenRouterKeyParams {
  name?: string;
  disabled?: boolean;
  limit?: number | null;
  limitReset?: 'daily' | 'weekly' | 'monthly' | null;
  includeByokInLimit?: boolean;
}

export type CreateOpenRouterKeyResult = Awaited<ReturnType<InstanceType<typeof OpenRouter>['apiKeys']['create']>>;
export type ListOpenRouterKeysResult = Awaited<ReturnType<InstanceType<typeof OpenRouter>['apiKeys']['list']>>;
export type UpdateOpenRouterKeyResult = Awaited<ReturnType<InstanceType<typeof OpenRouter>['apiKeys']['update']>>;
export type DeleteOpenRouterKeyResult = Awaited<ReturnType<InstanceType<typeof OpenRouter>['apiKeys']['delete']>>;

export async function createOpenRouterKey(params: CreateOpenRouterKeyParams): Promise<CreateOpenRouterKeyResult> {
  const client = getClient();

  return client.apiKeys.create({
    requestBody: {
      name: params.name,
      workspaceId: params.workspaceId,
      limit: params.limit,
      limitReset: params.limitReset,
      includeByokInLimit: params.includeByokInLimit,
      creatorUserId: params.creatorUserId,
      expiresAt: params.expiresAt,
    },
  });
}

export async function listOpenRouterKeys(options?: ListOpenRouterKeysOptions): Promise<ListOpenRouterKeysResult> {
  const client = getClient();

  return client.apiKeys.list(options);
}

/**
 * Update a key by hash. The management key is account-global, so this works
 * for keys in any workspace (verified live — no workspace context needed).
 */
export async function updateOpenRouterKey(
  hash: string,
  params: UpdateOpenRouterKeyParams
): Promise<UpdateOpenRouterKeyResult> {
  const client = getClient();

  return client.apiKeys.update({
    hash,
    requestBody: {
      name: params.name,
      disabled: params.disabled,
      limit: params.limit,
      limitReset: params.limitReset,
      includeByokInLimit: params.includeByokInLimit,
    },
  });
}

export async function deleteOpenRouterKey(hash: string): Promise<DeleteOpenRouterKeyResult> {
  const client = getClient();

  return client.apiKeys.delete({ hash });
}

export type OpenRouterWorkspaceInfo = {
  id: string;
  name: string;
};

/**
 * List all workspaces on the OpenRouter account.
 * Management keys are account-global and see every workspace.
 */
export async function listOpenRouterWorkspaces(): Promise<OpenRouterWorkspaceInfo[]> {
  const client = getClient();
  const response = await client.workspaces.list();
  return response.result.data.map((ws) => ({ id: ws.id, name: ws.name }));
}

export type OpenRouterActivityItem = {
  date: string;           // YYYY-MM-DD HH:MM:SS (UTC) — parse the date part only
  model: string;          // slug e.g. "openai/gpt-4.1"
  modelPermaslug: string;
  providerName: string;
  endpointId: string;
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  requests: number;
  usage: number;          // USD dollars (OpenRouter credits)
  byokUsageInference: number; // USD (external/BYOK credits — excluded from cost)
};

/**
 * Fetch daily activity for a key by hash. Works for keys in any workspace —
 * the activity endpoint is account-global (verified live).
 */
export async function getOpenRouterActivity(params: { apiKeyHash?: string }): Promise<OpenRouterActivityItem[]> {
  const client = getClient();
  const response = await client.analytics.getUserActivity({ apiKeyHash: params.apiKeyHash });
  return response.data as OpenRouterActivityItem[];
}
