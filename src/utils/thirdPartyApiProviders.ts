import {
  GEMINI_PROVIDER_ID,
  LEGACY_THIRD_PARTY_PROVIDER_IDS,
  THIRD_PARTY_TEMPLATE_IDS,
  type AppSettings,
  type ChatSettings,
  type LegacyThirdPartyProviderId,
  type ModelOption,
  type ThirdPartyApiProtocol,
  type ThirdPartyApiSettings,
  type ThirdPartyConnection,
  type ThirdPartyTemplateId,
} from '@/types';
import { deduplicateModelsById, sanitizeModelOptions } from './model/modelSorting';

export const THIRD_PARTY_PROVIDER_LABELS: Record<LegacyThirdPartyProviderId, string> = {
  openai: 'OpenAI',
  deepseek: 'DeepSeek',
  anthropic: 'Anthropic',
  openrouter: 'OpenRouter',
  qwen: 'Qwen',
  kimi: 'Kimi',
  glm: 'GLM',
  custom: 'Custom',
};

export const THIRD_PARTY_TEMPLATE_LABELS: Record<ThirdPartyTemplateId, string> = {
  openai: 'OpenAI',
  deepseek: 'DeepSeek',
  anthropic: 'Anthropic',
  openrouter: 'OpenRouter',
  qwen: 'Qwen',
  kimi: 'Kimi',
  glm: 'GLM',
  siliconflow: 'SiliconFlow',
  groq: 'Groq',
  together: 'Together AI',
  nvidia: 'Nvidia',
  minimax: 'MiniMax',
  grok: 'Grok',
  ollama: 'Ollama',
  lmstudio: 'LM Studio',
  baichuan: 'Baichuan (百川)',
  stepfun: 'StepFun (阶跃星辰)',
  yi: '01.AI (零一万物)',
  doubao: 'Doubao (火山引擎)',
  mistral: 'Mistral AI',
  perplexity: 'Perplexity',
  cerebras: 'Cerebras',
  fireworks: 'Fireworks AI',
  atlascloud: 'Atlas Cloud',
  'custom-openai': 'Custom (OpenAI compatible)',
  'custom-anthropic': 'Custom (Anthropic)',
};

const isThirdPartyProtocol = (value: unknown): value is ThirdPartyApiProtocol =>
  value === 'openai-compatible' || value === 'anthropic' || value === 'openai-responses';

const isThirdPartyTemplateId = (value: unknown): value is ThirdPartyTemplateId =>
  typeof value === 'string' && (THIRD_PARTY_TEMPLATE_IDS as readonly string[]).includes(value);

const cloneModels = (models: ModelOption[]): ModelOption[] => models.map((model) => ({ ...model }));

interface ThirdPartyTemplateDefaults {
  name: string;
  baseUrl: string | null;
  modelId: string;
  models: ModelOption[];
  protocol: ThirdPartyApiProtocol;
  apiKeyUrl?: string;
  docUrl?: string;
  authOptional?: boolean;
}

const TEMPLATE_DEFAULTS: Record<ThirdPartyTemplateId, ThirdPartyTemplateDefaults> = {
  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    modelId: 'gpt-5.6-sol',
    models: [{ id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', isPinned: true }],
    protocol: 'openai-compatible',
    apiKeyUrl: 'https://platform.openai.com/api-keys',
    docUrl: 'https://platform.openai.com/docs',
  },
  deepseek: {
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    modelId: 'deepseek-v4-flash',
    models: [
      { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', isPinned: true },
      { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro' },
    ],
    protocol: 'openai-compatible',
    apiKeyUrl: 'https://platform.deepseek.com/api_keys',
    docUrl: 'https://platform.deepseek.com/docs',
  },
  anthropic: {
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com',
    modelId: 'claude-fable-5',
    models: [
      { id: 'claude-fable-5', name: 'Claude Fable 5', isPinned: true },
      { id: 'claude-opus-5', name: 'Claude Opus 5' },
      { id: 'claude-sonnet-5', name: 'Claude Sonnet 5' },
      { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5' },
    ],
    protocol: 'anthropic',
    apiKeyUrl: 'https://console.anthropic.com/settings/keys',
    docUrl: 'https://docs.anthropic.com',
  },
  openrouter: {
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    modelId: '~openai/gpt-latest',
    models: [{ id: '~openai/gpt-latest', name: 'OpenAI GPT Latest', isPinned: true }],
    protocol: 'openai-compatible',
    apiKeyUrl: 'https://openrouter.ai/keys',
    docUrl: 'https://openrouter.ai/docs',
  },
  qwen: {
    name: 'Qwen',
    baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    modelId: 'qwen3.7-max',
    models: [
      { id: 'qwen3.7-max', name: 'Qwen3.7 Max', isPinned: true },
      { id: 'qwen3.7-plus', name: 'Qwen3.7 Plus' },
    ],
    protocol: 'openai-compatible',
    apiKeyUrl: 'https://bailian.console.aliyun.com/?apiKey=1',
    docUrl: 'https://help.aliyun.com/zh/model-studio',
  },
  kimi: {
    name: 'Kimi',
    baseUrl: 'https://api.moonshot.ai/v1',
    modelId: 'kimi-k3',
    models: [{ id: 'kimi-k3', name: 'Kimi K3', isPinned: true }],
    protocol: 'openai-compatible',
    apiKeyUrl: 'https://platform.moonshot.cn/console/api-keys',
    docUrl: 'https://platform.moonshot.cn/docs',
  },
  glm: {
    name: 'GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    modelId: 'glm-5.2',
    models: [{ id: 'glm-5.2', name: 'GLM-5.2', isPinned: true }],
    protocol: 'openai-compatible',
    apiKeyUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
    docUrl: 'https://open.bigmodel.cn/dev/api',
  },
  siliconflow: {
    name: 'SiliconFlow',
    baseUrl: 'https://api.siliconflow.cn/v1',
    modelId: 'deepseek-ai/DeepSeek-V3',
    models: [
      { id: 'deepseek-ai/DeepSeek-V3', name: 'DeepSeek V3', isPinned: true },
      { id: 'deepseek-ai/DeepSeek-R1', name: 'DeepSeek R1', isPinned: true },
      { id: 'Qwen/Qwen2.5-72B-Instruct', name: 'Qwen 2.5 72B Instruct' },
    ],
    protocol: 'openai-compatible',
    apiKeyUrl: 'https://cloud.siliconflow.cn/account/ak',
    docUrl: 'https://docs.siliconflow.cn',
  },
  groq: {
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    modelId: 'llama-3.3-70b-versatile',
    models: [
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B Versatile', isPinned: true },
      { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant' },
    ],
    protocol: 'openai-compatible',
    apiKeyUrl: 'https://console.groq.com/keys',
    docUrl: 'https://console.groq.com/docs',
  },
  together: {
    name: 'Together AI',
    baseUrl: 'https://api.together.xyz/v1',
    modelId: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    models: [
      { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', name: 'Llama 3.3 70B Instruct Turbo', isPinned: true },
      { id: 'deepseek-ai/DeepSeek-R1', name: 'DeepSeek R1' },
    ],
    protocol: 'openai-compatible',
    apiKeyUrl: 'https://api.together.ai/settings/api-keys',
    docUrl: 'https://docs.together.ai',
  },
  nvidia: {
    name: 'Nvidia',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    modelId: 'meta/llama-3.3-70b-instruct',
    models: [
      { id: 'meta/llama-3.3-70b-instruct', name: 'Llama 3.3 70B Instruct', isPinned: true },
      { id: 'meta/llama-3.1-405b-instruct', name: 'Llama 3.1 405B Instruct' },
    ],
    protocol: 'openai-compatible',
    apiKeyUrl: 'https://build.nvidia.com',
    docUrl: 'https://docs.api.nvidia.com',
  },
  minimax: {
    name: 'MiniMax',
    baseUrl: 'https://api.minimaxi.com/v1',
    modelId: 'MiniMax-M2.5',
    models: [
      { id: 'MiniMax-M2.5', name: 'MiniMax M2.5', isPinned: true },
      { id: 'MiniMax-M2', name: 'MiniMax M2' },
    ],
    protocol: 'openai-compatible',
    apiKeyUrl: 'https://platform.minimaxi.com/user-center/basic-information/interface-key',
    docUrl: 'https://platform.minimaxi.com/document',
  },
  grok: {
    name: 'Grok',
    baseUrl: 'https://api.x.ai/v1',
    modelId: 'grok-4',
    models: [
      { id: 'grok-4', name: 'Grok 4', isPinned: true },
      { id: 'grok-3', name: 'Grok 3' },
    ],
    protocol: 'openai-compatible',
    apiKeyUrl: 'https://console.x.ai',
    docUrl: 'https://docs.x.ai',
  },
  ollama: {
    name: 'Ollama',
    baseUrl: 'http://localhost:11434/v1',
    modelId: 'llama3.2',
    models: [{ id: 'llama3.2', name: 'Llama 3.2', isPinned: true }],
    protocol: 'openai-compatible',
    docUrl: 'https://ollama.com',
    authOptional: true,
  },
  lmstudio: {
    name: 'LM Studio',
    baseUrl: 'http://localhost:1234/v1',
    modelId: 'local-model',
    models: [{ id: 'local-model', name: 'Local Model', isPinned: true }],
    protocol: 'openai-compatible',
    docUrl: 'https://lmstudio.ai',
    authOptional: true,
  },
  baichuan: {
    name: 'Baichuan',
    baseUrl: 'https://api.baichuan-ai.com/v1',
    modelId: 'Baichuan4',
    models: [
      { id: 'Baichuan4', name: 'Baichuan 4', isPinned: true },
      { id: 'Baichuan3-Turbo', name: 'Baichuan 3 Turbo' },
    ],
    protocol: 'openai-compatible',
    apiKeyUrl: 'https://platform.baichuan-ai.com/console/apikey',
    docUrl: 'https://platform.baichuan-ai.com/docs/api',
  },
  stepfun: {
    name: 'StepFun',
    baseUrl: 'https://api.stepfun.com/v1',
    modelId: 'step-2-16k',
    models: [
      { id: 'step-2-16k', name: 'Step 2 (16K)', isPinned: true },
      { id: 'step-1-8k', name: 'Step 1 (8K)' },
    ],
    protocol: 'openai-compatible',
    apiKeyUrl: 'https://platform.stepfun.com/interface-key',
    docUrl: 'https://platform.stepfun.com/docs/llm/text',
  },
  yi: {
    name: '01.AI',
    baseUrl: 'https://api.lingyiwanwu.com/v1',
    modelId: 'yi-lightning',
    models: [
      { id: 'yi-lightning', name: 'Yi Lightning', isPinned: true },
      { id: 'yi-large', name: 'Yi Large' },
    ],
    protocol: 'openai-compatible',
    apiKeyUrl: 'https://platform.lingyiwanwu.com/apikeys',
    docUrl: 'https://platform.lingyiwanwu.com/docs',
  },
  doubao: {
    name: 'Doubao',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    modelId: 'doubao-pro-32k',
    models: [
      { id: 'doubao-pro-32k', name: 'Doubao Pro 32K', isPinned: true },
      { id: 'doubao-lite-32k', name: 'Doubao Lite 32K' },
    ],
    protocol: 'openai-compatible',
    apiKeyUrl: 'https://console.volcengine.com/ark',
    docUrl: 'https://www.volcengine.com/docs/82379/1099470',
  },
  mistral: {
    name: 'Mistral AI',
    baseUrl: 'https://api.mistral.ai/v1',
    modelId: 'mistral-large-latest',
    models: [
      { id: 'mistral-large-latest', name: 'Mistral Large', isPinned: true },
      { id: 'codestral-latest', name: 'Codestral' },
      { id: 'mistral-small-latest', name: 'Mistral Small' },
    ],
    protocol: 'openai-compatible',
    apiKeyUrl: 'https://console.mistral.ai/api-keys/',
    docUrl: 'https://docs.mistral.ai/',
  },
  perplexity: {
    name: 'Perplexity',
    baseUrl: 'https://api.perplexity.ai',
    modelId: 'sonar-pro',
    models: [
      { id: 'sonar-pro', name: 'Sonar Pro', isPinned: true },
      { id: 'sonar', name: 'Sonar' },
    ],
    protocol: 'openai-compatible',
    apiKeyUrl: 'https://www.perplexity.ai/settings/api',
    docUrl: 'https://docs.perplexity.ai/',
  },
  cerebras: {
    name: 'Cerebras',
    baseUrl: 'https://api.cerebras.ai/v1',
    modelId: 'llama-3.3-70b',
    models: [
      { id: 'llama-3.3-70b', name: 'Llama 3.3 70B (Fast)', isPinned: true },
      { id: 'llama3.1-8b', name: 'Llama 3.1 8B' },
    ],
    protocol: 'openai-compatible',
    apiKeyUrl: 'https://cloud.cerebras.ai/',
    docUrl: 'https://inference-docs.cerebras.ai/',
  },
  fireworks: {
    name: 'Fireworks AI',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    modelId: 'accounts/fireworks/models/deepseek-r1',
    models: [
      { id: 'accounts/fireworks/models/deepseek-r1', name: 'DeepSeek R1', isPinned: true },
      { id: 'accounts/fireworks/models/deepseek-v3', name: 'DeepSeek V3' },
    ],
    protocol: 'openai-compatible',
    apiKeyUrl: 'https://fireworks.ai/api-keys',
    docUrl: 'https://docs.fireworks.ai/',
  },
  atlascloud: {
    name: 'Atlas Cloud',
    baseUrl: 'https://api.atlascloud.ai/v1',
    modelId: 'deepseek-ai/deepseek-v4-pro',
    models: [{ id: 'deepseek-ai/deepseek-v4-pro', name: 'DeepSeek V4 Pro', isPinned: true }],
    protocol: 'openai-compatible',
    apiKeyUrl: 'https://atlascloud.ai/console/api-keys',
    docUrl: 'https://docs.atlascloud.ai',
  },
  'custom-openai': {
    name: 'Custom',
    baseUrl: null,
    modelId: 'custom-model',
    models: [{ id: 'custom-model', name: 'Custom Model', isPinned: true }],
    protocol: 'openai-compatible',
  },
  'custom-anthropic': {
    name: 'Custom (Anthropic)',
    baseUrl: null,
    modelId: 'custom-model',
    models: [{ id: 'custom-model', name: 'Custom Model', isPinned: true }],
    protocol: 'anthropic',
  },
};

const LEGACY_TEMPLATE_ID: Record<LegacyThirdPartyProviderId, ThirdPartyTemplateId> = {
  openai: 'openai',
  deepseek: 'deepseek',
  anthropic: 'anthropic',
  openrouter: 'openrouter',
  qwen: 'qwen',
  kimi: 'kimi',
  glm: 'glm',
  custom: 'custom-openai',
};

const cloneConnection = (connection: ThirdPartyConnection): ThirdPartyConnection => ({
  ...connection,
  extraHeaders: { ...connection.extraHeaders },
  models: cloneModels(connection.models),
});

export const createDefaultThirdPartyApiSettings = (): ThirdPartyApiSettings => ({
  connections: [],
});

export const getThirdPartyTemplateDefaults = (templateId: ThirdPartyTemplateId): ThirdPartyTemplateDefaults => ({
  ...TEMPLATE_DEFAULTS[templateId],
  models: cloneModels(TEMPLATE_DEFAULTS[templateId].models),
});

export const getThirdPartyTemplateLinks = (
  templateId: ThirdPartyTemplateId,
): { apiKeyUrl?: string; docUrl?: string } => {
  const defaults = TEMPLATE_DEFAULTS[templateId];
  return {
    apiKeyUrl: defaults?.apiKeyUrl,
    docUrl: defaults?.docUrl,
  };
};

export const getConnectionDisplayTemplateId = (
  connection: Pick<ThirdPartyConnection, 'templateId' | 'protocol'>,
): ThirdPartyTemplateId => {
  if (
    connection.templateId === 'openai' &&
    (connection.protocol === 'openai-compatible' || connection.protocol === 'openai-responses')
  ) {
    return 'openai';
  }
  const defaultProtocol = TEMPLATE_DEFAULTS[connection.templateId]?.protocol;
  if (!defaultProtocol || connection.protocol === defaultProtocol) {
    return connection.templateId;
  }
  return connection.protocol === 'anthropic' ? 'custom-anthropic' : 'custom-openai';
};

type ThirdPartyConnectionStatusKind = 'disabled' | 'missing-key' | 'missing-url' | 'ready';

export const getThirdPartyConnectionStatus = (
  connection: Pick<ThirdPartyConnection, 'enabled' | 'apiKey' | 'baseUrl'> & { authOptional?: boolean },
): ThirdPartyConnectionStatusKind => {
  if (!connection.enabled) {
    return 'disabled';
  }
  if (!connection.authOptional && !connection.apiKey?.trim()) {
    return 'missing-key';
  }
  if (!connection.baseUrl?.trim()) {
    return 'missing-url';
  }
  return 'ready';
};

export const isThirdPartyConnectionInUse = (
  connectionId: string,
  sessions: Array<{ settings?: { providerId?: string } }>,
  defaultProviderId?: string,
): boolean =>
  defaultProviderId === connectionId || sessions.some((session) => session.settings?.providerId === connectionId);

export const getProxyProviderHeader = (templateId: ThirdPartyTemplateId | string): string => {
  if (templateId === 'custom-openai' || templateId === 'custom-anthropic' || templateId === 'custom') {
    return 'custom';
  }
  if ((THIRD_PARTY_TEMPLATE_IDS as readonly string[]).includes(templateId)) {
    return templateId;
  }
  if ((LEGACY_THIRD_PARTY_PROVIDER_IDS as readonly string[]).includes(templateId as LegacyThirdPartyProviderId)) {
    return templateId;
  }
  return 'custom';
};

export const createConnectionId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `connection-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
};

const modelsKey = (models: ModelOption[]): string =>
  models.map((model) => `${model.id}\0${model.name}\0${model.isPinned ? '1' : '0'}`).join('\n');

const sanitizeExtraHeaders = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const headers: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(value as Record<string, unknown>)) {
    const key = rawKey.trim();
    if (!/^[A-Za-z0-9-]+$/.test(key) || typeof rawValue !== 'string') {
      continue;
    }
    const headerValue = rawValue.trim();
    if (!headerValue) {
      continue;
    }
    headers[key] = headerValue;
  }
  return headers;
};

export const sanitizeThirdPartyConnection = (
  value: Partial<ThirdPartyConnection> | undefined,
  fallbackTemplateId: ThirdPartyTemplateId = 'custom-openai',
): ThirdPartyConnection | null => {
  const templateId = isThirdPartyTemplateId(value?.templateId) ? value.templateId : fallbackTemplateId;
  const defaults = TEMPLATE_DEFAULTS[templateId];
  const candidateModels = Array.isArray(value?.models) ? value.models : defaults.models;
  const sanitizedModels = sanitizeModelOptions(candidateModels);
  const models = sanitizedModels.length > 0 ? sanitizedModels : cloneModels(defaults.models);
  const defaultModelId = models.find((model) => model.isPinned)?.id ?? models[0]?.id ?? defaults.modelId;
  const modelId = typeof value?.modelId === 'string' ? value.modelId.trim() || defaultModelId : defaultModelId;
  const id = typeof value?.id === 'string' && value.id.trim() ? value.id.trim() : '';
  if (!id) {
    return null;
  }

  const name = typeof value?.name === 'string' && value.name.trim() ? value.name.trim() : defaults.name;

  return {
    id,
    name,
    templateId,
    apiKey: typeof value?.apiKey === 'string' ? value.apiKey : null,
    baseUrl: typeof value?.baseUrl === 'string' ? value.baseUrl : defaults.baseUrl,
    extraHeaders: sanitizeExtraHeaders(value?.extraHeaders),
    modelId,
    models,
    protocol: isThirdPartyProtocol(value?.protocol) ? value.protocol : defaults.protocol,
    enabled: value?.enabled === true,
    authOptional: typeof value?.authOptional === 'boolean' ? value.authOptional : defaults.authOptional,
  };
};

const isLegacyProviderRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const shouldMigrateLegacyProvider = (
  providerId: LegacyThirdPartyProviderId,
  value: Record<string, unknown> | undefined,
): boolean => {
  const defaults = TEMPLATE_DEFAULTS[LEGACY_TEMPLATE_ID[providerId]];
  if (!value) {
    return false;
  }
  if (value.enabled === true) {
    return true;
  }
  if (typeof value.apiKey === 'string' && value.apiKey.trim()) {
    return true;
  }
  if (typeof value.baseUrl === 'string' && value.baseUrl !== defaults.baseUrl) {
    return true;
  }
  if (typeof value.modelId === 'string' && value.modelId.trim() && value.modelId.trim() !== defaults.modelId) {
    return true;
  }
  if (Array.isArray(value.models) && modelsKey(sanitizeModelOptions(value.models)) !== modelsKey(defaults.models)) {
    return true;
  }
  return false;
};

const migrateLegacyProviders = (providers: Record<string, unknown>): ThirdPartyConnection[] => {
  const connections: ThirdPartyConnection[] = [];

  for (const providerId of LEGACY_THIRD_PARTY_PROVIDER_IDS) {
    const raw = isLegacyProviderRecord(providers[providerId]) ? providers[providerId] : undefined;
    if (!shouldMigrateLegacyProvider(providerId, raw)) {
      continue;
    }

    const templateId = LEGACY_TEMPLATE_ID[providerId];
    const connection = sanitizeThirdPartyConnection(
      {
        ...(raw as Partial<ThirdPartyConnection>),
        id: providerId,
        name: typeof raw?.name === 'string' ? raw.name : THIRD_PARTY_PROVIDER_LABELS[providerId],
        templateId,
      },
      templateId,
    );
    if (connection) {
      connections.push(connection);
    }
  }

  return connections;
};

export const sanitizeThirdPartyApiSettings = (value: unknown): ThirdPartyApiSettings => {
  const record = isLegacyProviderRecord(value) ? value : {};
  if (Array.isArray(record.connections)) {
    const seen = new Set<string>();
    const connections: ThirdPartyConnection[] = [];
    for (const item of record.connections) {
      const connection = sanitizeThirdPartyConnection(
        item && typeof item === 'object' ? (item as Partial<ThirdPartyConnection>) : undefined,
      );
      if (!connection || seen.has(connection.id)) {
        continue;
      }
      seen.add(connection.id);
      connections.push(connection);
    }
    return { connections };
  }

  if (isLegacyProviderRecord(record.providers)) {
    return { connections: migrateLegacyProviders(record.providers) };
  }

  return createDefaultThirdPartyApiSettings();
};

const getThirdPartyConnections = (settings: Pick<AppSettings, 'thirdPartyApi'>): ThirdPartyConnection[] =>
  settings.thirdPartyApi?.connections ?? [];

export const findThirdPartyConnection = (
  settings: Pick<AppSettings, 'thirdPartyApi'>,
  connectionId: string | undefined,
): ThirdPartyConnection | undefined => {
  if (!connectionId) {
    return undefined;
  }
  return getThirdPartyConnections(settings).find((connection) => connection.id === connectionId);
};

/**
 * Returns enabled third-party connections as { id, config } pairs.
 */
export const getEnabledThirdPartyProviders = (
  settings: Pick<AppSettings, 'thirdPartyApi'>,
): { id: string; config: ThirdPartyConnection }[] =>
  getThirdPartyConnections(settings)
    .filter((connection) => connection.enabled)
    .map((connection) => ({ id: connection.id, config: connection }));

export const resolveProviderForModelId = (
  settings: Pick<AppSettings, 'thirdPartyApi'>,
  modelId: string,
): { id: string; config: ThirdPartyConnection } | undefined =>
  getEnabledThirdPartyProviders(settings).find(({ config }) => config.models.some((model) => model.id === modelId));

export const buildProviderAwareModelList = (
  appSettings: Pick<AppSettings, 'thirdPartyApi'>,
  baseModels: ModelOption[],
  session?: Pick<ChatSettings, 'modelId' | 'providerId'>,
): ModelOption[] => {
  const thirdPartyModels = getEnabledThirdPartyProviders(appSettings).flatMap(({ id, config }) =>
    deduplicateModelsById(config.models)
      .filter((model) => {
        if (model.visibleInSelector === false) {
          return session?.providerId === id && session?.modelId === model.id;
        }
        return true;
      })
      .map((model) => ({
        ...model,
        apiMode: 'third-party' as const,
        providerId: id,
        templateId: getConnectionDisplayTemplateId(config),
        connectionName: config.name,
        ...(config.authOptional || config.apiKey?.trim() ? {} : { missingApiKey: true as const }),
      })),
  );

  const models = [...deduplicateModelsById(baseModels), ...thirdPartyModels];
  const sessionProviderId = session?.providerId;
  if (!sessionProviderId || sessionProviderId === GEMINI_PROVIDER_ID) {
    return models;
  }

  const alreadyPresent = models.some((model) => model.providerId === sessionProviderId && model.id === session.modelId);
  if (alreadyPresent) {
    return models;
  }

  const connection = findThirdPartyConnection(appSettings, sessionProviderId);
  return [
    ...models,
    {
      id: session.modelId,
      name: session.modelId,
      apiMode: 'third-party',
      providerId: sessionProviderId,
      templateId: connection?.templateId,
      connectionName: connection?.name ?? sessionProviderId,
      unavailable: true,
    },
  ];
};

const nextConnectionName = (connections: ThirdPartyConnection[], baseName: string): string => {
  const names = new Set(connections.map((connection) => connection.name));
  if (!names.has(baseName)) {
    return baseName;
  }

  let suffix = 2;
  while (names.has(`${baseName} ${suffix}`)) {
    suffix += 1;
  }
  return `${baseName} ${suffix}`;
};

export const createConnectionFromTemplate = (
  templateId: ThirdPartyTemplateId,
  existing: ThirdPartyConnection[],
  id: string,
): ThirdPartyConnection => {
  const defaults = getThirdPartyTemplateDefaults(templateId);
  return {
    id,
    name: nextConnectionName(existing, defaults.name),
    templateId,
    protocol: defaults.protocol,
    apiKey: null,
    baseUrl: defaults.baseUrl,
    extraHeaders: {},
    modelId: defaults.modelId,
    models: defaults.models,
    enabled: true,
    authOptional: defaults.authOptional,
  };
};

export const updateThirdPartyConnection = (
  thirdPartyApi: ThirdPartyApiSettings,
  connectionId: string,
  updates: Partial<ThirdPartyConnection>,
): ThirdPartyApiSettings => ({
  connections: thirdPartyApi.connections.map((connection) => {
    if (connection.id !== connectionId) {
      return connection;
    }
    return (
      sanitizeThirdPartyConnection({ ...connection, ...updates, id: connection.id }, connection.templateId) ??
      connection
    );
  }),
});

export const addThirdPartyConnection = (
  thirdPartyApi: ThirdPartyApiSettings,
  connection: ThirdPartyConnection,
): ThirdPartyApiSettings => ({
  connections: [...thirdPartyApi.connections, cloneConnection(connection)],
});

export const removeThirdPartyConnection = (
  thirdPartyApi: ThirdPartyApiSettings,
  connectionId: string,
): ThirdPartyApiSettings => ({
  connections: thirdPartyApi.connections.filter((connection) => connection.id !== connectionId),
});

export const isDeepSeekOfficialEndpoint = (templateId?: string | null, baseUrl?: string | null): boolean => {
  if (templateId === 'deepseek') return true;
  if (!baseUrl) return false;
  return baseUrl.toLowerCase().includes('api.deepseek.com');
};

export const isDashScopeOfficialEndpoint = (templateId?: string | null, baseUrl?: string | null): boolean => {
  if (templateId === 'dashscope') return true;
  if (!baseUrl) return false;
  return baseUrl.toLowerCase().includes('dashscope.aliyuncs.com');
};

export const isLocalEngineEndpoint = (templateId?: string | null, baseUrl?: string | null): boolean => {
  if (templateId === 'ollama' || templateId === 'lmstudio') return true;
  if (!baseUrl) return false;
  const lower = baseUrl.toLowerCase();
  return (
    lower.includes('localhost:11434') ||
    lower.includes('127.0.0.1:11434') ||
    lower.includes('localhost:1234') ||
    lower.includes('127.0.0.1:1234')
  );
};

export const reorderThirdPartyConnections = (
  thirdPartyApi: ThirdPartyApiSettings,
  orderedIds: string[],
): ThirdPartyApiSettings => {
  const connectionMap = new Map(thirdPartyApi.connections.map((c) => [c.id, c]));
  const reordered: ThirdPartyConnection[] = [];

  orderedIds.forEach((id) => {
    const conn = connectionMap.get(id);
    if (conn) {
      reordered.push(conn);
      connectionMap.delete(id);
    }
  });

  // Append any connections that weren't in orderedIds
  connectionMap.forEach((conn) => {
    reordered.push(conn);
  });

  return {
    ...thirdPartyApi,
    connections: reordered,
  };
};

export function generateColorFromChar(text: string): string {
  if (!text) return '#475569';
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = text.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  return `hsl(${hue}, 65%, 38%)`;
}

export function getFirstCharacter(text: string): string {
  if (!text) return '?';
  const trimmed = text.trim();
  if (!trimmed) return '?';
  return trimmed.slice(0, 1).toUpperCase();
}
