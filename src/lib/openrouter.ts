import { OpenRouter } from '@openrouter/sdk';

function getClient() {
  const apiKey = process.env.OPENROUTER_MANAGEMENT_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_MANAGEMENT_KEY is not set');
  }

  return new OpenRouter({ apiKey });
}

export interface CreateOpenRouterKeyParams {
  name: string;
  limit?: number | null;
  limitReset?: 'daily' | 'weekly' | 'monthly' | null;
  includeByokInLimit?: boolean;
  creatorUserId?: string | null;
  expiresAt?: Date | null;
  workspaceId?: string;
}

export interface ListOpenRouterKeysOptions {
  offset?: number | null;
  includeDisabled?: boolean;
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

export async function createOpenRouterKey(
  params: CreateOpenRouterKeyParams
): Promise<CreateOpenRouterKeyResult> {
  const client = getClient();

  return client.apiKeys.create({
    requestBody: {
      name: params.name,
      limit: params.limit,
      limitReset: params.limitReset,
      includeByokInLimit: params.includeByokInLimit,
      creatorUserId: params.creatorUserId,
      expiresAt: params.expiresAt,
      workspaceId: params.workspaceId,
    },
  });
}

export async function listOpenRouterKeys(
  options?: ListOpenRouterKeysOptions
): Promise<ListOpenRouterKeysResult> {
  const client = getClient();

  return client.apiKeys.list(options);
}

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
