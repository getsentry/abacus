import { OpenRouter } from '@openrouter/sdk';
import { OpenRouterError } from '@openrouter/sdk/models/errors';
import { getOpenRouterWorkspaceKey } from './openrouter-workspaces';

function getClient(workspace: string) {
  const apiKey = getOpenRouterWorkspaceKey(workspace);

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
  limit?: number | null;
  limitReset?: 'daily' | 'weekly' | 'monthly' | null;
  includeByokInLimit?: boolean;
  creatorUserId?: string | null;
  expiresAt?: Date | null;
}

export interface ListOpenRouterKeysOptions {
  offset?: number | null;
  includeDisabled?: boolean;
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

export async function createOpenRouterKey(
  workspace: string,
  params: CreateOpenRouterKeyParams
): Promise<CreateOpenRouterKeyResult> {
  const client = getClient(workspace);

  return client.apiKeys.create({
    requestBody: {
      name: params.name,
      limit: params.limit,
      limitReset: params.limitReset,
      includeByokInLimit: params.includeByokInLimit,
      creatorUserId: params.creatorUserId,
      expiresAt: params.expiresAt,
    },
  });
}

export async function listOpenRouterKeys(
  workspace: string,
  options?: ListOpenRouterKeysOptions
): Promise<ListOpenRouterKeysResult> {
  const client = getClient(workspace);

  return client.apiKeys.list(options);
}

export async function updateOpenRouterKey(
  workspace: string,
  hash: string,
  params: UpdateOpenRouterKeyParams
): Promise<UpdateOpenRouterKeyResult> {
  const client = getClient(workspace);

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

export async function deleteOpenRouterKey(
  workspace: string,
  hash: string
): Promise<DeleteOpenRouterKeyResult> {
  const client = getClient(workspace);

  return client.apiKeys.delete({ hash });
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

export async function getOpenRouterActivity(
  workspace: string,
  params: { apiKeyHash?: string }
): Promise<OpenRouterActivityItem[]> {
  const client = getClient(workspace);
  const response = await client.analytics.getUserActivity({ apiKeyHash: params.apiKeyHash });
  return response.data as OpenRouterActivityItem[];
}
