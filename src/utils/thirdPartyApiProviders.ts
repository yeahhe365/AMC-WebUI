import type {
  AppSettings,
  ModelOption,
  ThirdPartyApiProtocol,
  ThirdPartyApiSettings,
  ThirdPartyProviderConfig,
  ThirdPartyProviderId,
} from '@/types';
import { deduplicateModelsById, sanitizeModelOptions } from './model/modelSorting';

export const THIRD_PARTY_PROVIDER_IDS = [
  'openai',
  'deepseek',
  'anthropic',
  'openrouter',
  'qwen',
  'kimi',
  'glm',
  'atlascloud',
  'custom',
] as const;

export const THIRD_PARTY_PROVIDER_LABELS: Record<ThirdPartyProviderId, string> = {
  openai: 'OpenAI',
  deepseek: 'DeepSeek',
  anthropic: 'Anthropic',
  openrouter: 'OpenRouter',
  qwen: 'Qwen',
  kimi: 'Kimi',
  glm: 'GLM',
  atlascloud: 'Atlas Cloud',
  custom: 'Custom',
};

const DEFAULT_THIRD_PARTY_PROVIDER_CONFIGS: Record<ThirdPartyProviderId, ThirdPartyProviderConfig> = {
  openai: {
    apiKey: null,
    baseUrl: 'https://api.openai.com/v1',
    modelId: 'gpt-5.6-sol',
    models: [{ id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', isPinned: true }],
    protocol: 'openai-compatible',
    enabled: false,
  },
  deepseek: {
    apiKey: null,
    baseUrl: 'https://api.deepseek.com',
    modelId: 'deepseek-v4-flash',
    models: [
      { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', isPinned: true },
      { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro' },
    ],
    protocol: 'openai-compatible',
    enabled: false,
  },
  anthropic: {
    apiKey: null,
    baseUrl: 'https://api.anthropic.com',
    modelId: 'claude-fable-5',
    models: [
      { id: 'claude-fable-5', name: 'Claude Fable 5', isPinned: true },
      { id: 'claude-opus-5', name: 'Claude Opus 5' },
      { id: 'claude-sonnet-5', name: 'Claude Sonnet 5' },
      { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5' },
    ],
    protocol: 'anthropic',
    enabled: false,
  },
  openrouter: {
    apiKey: null,
    baseUrl: 'https://openrouter.ai/api/v1',
    modelId: '~openai/gpt-latest',
    models: [{ id: '~openai/gpt-latest', name: 'OpenAI GPT Latest', isPinned: true }],
    protocol: 'openai-compatible',
    enabled: false,
  },
  qwen: {
    apiKey: null,
    baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    modelId: 'qwen3.7-max',
    models: [
      { id: 'qwen3.7-max', name: 'Qwen3.7 Max', isPinned: true },
      { id: 'qwen3.7-plus', name: 'Qwen3.7 Plus' },
    ],
    protocol: 'openai-compatible',
    enabled: false,
  },
  kimi: {
    apiKey: null,
    baseUrl: 'https://api.moonshot.ai/v1',
    modelId: 'kimi-k3',
    models: [{ id: 'kimi-k3', name: 'Kimi K3', isPinned: true }],
    protocol: 'openai-compatible',
    enabled: false,
  },
  glm: {
    apiKey: null,
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    modelId: 'glm-5.2',
    models: [{ id: 'glm-5.2', name: 'GLM-5.2', isPinned: true }],
    protocol: 'openai-compatible',
    enabled: false,
  },
  atlascloud: {
    apiKey: null,
    baseUrl: 'https://api.atlascloud.ai/v1',
    modelId: 'deepseek-ai/deepseek-v4-pro',
    models: [{ id: 'deepseek-ai/deepseek-v4-pro', name: 'DeepSeek V4 Pro', isPinned: true }],
    protocol: 'openai-compatible',
    enabled: false,
  },
  custom: {
    apiKey: null,
    baseUrl: null,
    modelId: 'custom-model',
    models: [{ id: 'custom-model', name: 'Custom Model', isPinned: true }],
    protocol: 'openai-compatible',
    enabled: false,
  },
};

export const DEFAULT_THIRD_PARTY_API_SETTINGS: ThirdPartyApiSettings = {
  activeProvider: 'openai',
  providers: DEFAULT_THIRD_PARTY_PROVIDER_CONFIGS,
};

const isThirdPartyProviderId = (value: unknown): value is ThirdPartyProviderId =>
  typeof value === 'string' && THIRD_PARTY_PROVIDER_IDS.includes(value as ThirdPartyProviderId);

const isThirdPartyProtocol = (value: unknown): value is ThirdPartyApiProtocol =>
  value === 'openai-compatible' || value === 'anthropic';

const cloneModels = (models: ModelOption[]): ModelOption[] => models.map((model) => ({ ...model }));

const cloneThirdPartyProviderConfig = (config: ThirdPartyProviderConfig): ThirdPartyProviderConfig => ({
  ...config,
  models: cloneModels(config.models),
});

export const createDefaultThirdPartyApiSettings = (): ThirdPartyApiSettings => ({
  activeProvider: DEFAULT_THIRD_PARTY_API_SETTINGS.activeProvider,
  providers: Object.fromEntries(
    THIRD_PARTY_PROVIDER_IDS.map((providerId) => [
      providerId,
      cloneThirdPartyProviderConfig(DEFAULT_THIRD_PARTY_PROVIDER_CONFIGS[providerId]),
    ]),
  ) as Record<ThirdPartyProviderId, ThirdPartyProviderConfig>,
});

export const getThirdPartyProviderConfig = (settings: Pick<AppSettings, 'thirdPartyApi'>): ThirdPartyProviderConfig => {
  const thirdPartyApi = settings.thirdPartyApi ?? createDefaultThirdPartyApiSettings();
  return thirdPartyApi.providers[thirdPartyApi.activeProvider] ?? thirdPartyApi.providers.openai;
};

export const getThirdPartyProviderModels = (settings: Pick<AppSettings, 'thirdPartyApi'>): ModelOption[] =>
  getThirdPartyProviderConfig(settings).models;

export const getThirdPartyProviderModelId = (
  settings: Pick<AppSettings, 'thirdPartyApi'>,
  sessionModelId?: string,
): string => sessionModelId ?? getThirdPartyProviderConfig(settings).modelId;

/**
 * Returns all enabled third-party providers as { id, config } pairs.
 * A provider is considered enabled only when `config.enabled === true`.
 */
export const getEnabledThirdPartyProviders = (
  settings: Pick<AppSettings, 'thirdPartyApi'>,
): { id: ThirdPartyProviderId; config: ThirdPartyProviderConfig }[] => {
  const thirdPartyApi = settings.thirdPartyApi ?? createDefaultThirdPartyApiSettings();
  return THIRD_PARTY_PROVIDER_IDS.filter((id) => thirdPartyApi.providers[id]?.enabled === true).map((id) => ({
    id,
    config: thirdPartyApi.providers[id],
  }));
};

/**
 * Given a modelId, find the enabled provider that contains it.
 * Falls back to the activeProvider config if no match is found.
 */
export const resolveProviderForModelId = (
  settings: Pick<AppSettings, 'thirdPartyApi'>,
  modelId: string,
): { id: ThirdPartyProviderId; config: ThirdPartyProviderConfig } => {
  const enabled = getEnabledThirdPartyProviders(settings);
  const match = enabled.find(({ config }) => config.models.some((m) => m.id === modelId));
  if (match) return match;

  // Fallback: active provider
  const activeId = settings.thirdPartyApi?.activeProvider ?? 'openai';
  const activeConfig = getThirdPartyProviderConfig(settings);
  return { id: activeId, config: activeConfig };
};

export const buildProviderAwareModelList = (
  appSettings: Pick<AppSettings, 'isThirdPartyApiEnabled' | 'thirdPartyApi'>,
  baseModels: ModelOption[],
): ModelOption[] => {
  const thirdPartyModels =
    appSettings.isThirdPartyApiEnabled === true
      ? getEnabledThirdPartyProviders(appSettings).flatMap(({ id, config }) =>
          config.models.map((model) => ({
            ...model,
            apiMode: 'third-party' as const,
            providerId: id,
          })),
        )
      : [];

  return deduplicateModelsById([...baseModels, ...thirdPartyModels]);
};

const sanitizeThirdPartyProviderConfig = (
  providerId: ThirdPartyProviderId,
  value: Partial<ThirdPartyProviderConfig> | undefined,
): ThirdPartyProviderConfig => {
  const defaults = DEFAULT_THIRD_PARTY_PROVIDER_CONFIGS[providerId];
  const candidateModels = Array.isArray(value?.models) ? value.models : defaults.models;
  const sanitizedModels = sanitizeModelOptions(candidateModels);
  const models = sanitizedModels.length > 0 ? sanitizedModels : defaults.models;
  const defaultModelId = models.find((model) => model.isPinned)?.id ?? models[0]?.id ?? defaults.modelId;
  const modelId = typeof value?.modelId === 'string' ? value.modelId.trim() || defaultModelId : defaultModelId;

  return {
    apiKey: typeof value?.apiKey === 'string' ? value.apiKey : null,
    baseUrl: typeof value?.baseUrl === 'string' ? value.baseUrl : defaults.baseUrl,
    modelId,
    models,
    protocol: isThirdPartyProtocol(value?.protocol) ? value.protocol : defaults.protocol,
    enabled: value?.enabled === true,
  };
};

export const sanitizeThirdPartyApiSettings = (
  value: Partial<ThirdPartyApiSettings> | undefined,
  legacyOpenAICompatible?: {
    apiKey?: string | null;
    baseUrl?: string | null;
    modelId?: string;
    models?: ModelOption[];
  },
): ThirdPartyApiSettings => {
  const activeProvider = isThirdPartyProviderId(value?.activeProvider) ? value.activeProvider : 'openai';
  const valueProviders: Partial<Record<ThirdPartyProviderId, Partial<ThirdPartyProviderConfig>>> =
    value?.providers ?? {};
  const providers = Object.fromEntries(
    THIRD_PARTY_PROVIDER_IDS.map((providerId) => [
      providerId,
      sanitizeThirdPartyProviderConfig(providerId, valueProviders[providerId]),
    ]),
  ) as Record<ThirdPartyProviderId, ThirdPartyProviderConfig>;

  if (legacyOpenAICompatible) {
    providers.openai = sanitizeThirdPartyProviderConfig('openai', {
      ...providers.openai,
      apiKey: legacyOpenAICompatible.apiKey ?? providers.openai.apiKey,
      baseUrl: legacyOpenAICompatible.baseUrl ?? providers.openai.baseUrl,
      modelId: legacyOpenAICompatible.modelId ?? providers.openai.modelId,
      models: legacyOpenAICompatible.models ?? providers.openai.models,
      protocol: 'openai-compatible',
    });
  }

  return {
    activeProvider,
    providers,
  };
};

export const updateThirdPartyProviderConfig = (
  thirdPartyApi: ThirdPartyApiSettings,
  providerId: ThirdPartyProviderId,
  updates: Partial<ThirdPartyProviderConfig>,
): ThirdPartyApiSettings => ({
  ...thirdPartyApi,
  providers: {
    ...thirdPartyApi.providers,
    [providerId]: sanitizeThirdPartyProviderConfig(providerId, {
      ...thirdPartyApi.providers[providerId],
      ...updates,
    }),
  },
});

export const updateActiveThirdPartyProviderConfig = (
  thirdPartyApi: ThirdPartyApiSettings,
  updates: Partial<ThirdPartyProviderConfig>,
): ThirdPartyApiSettings => updateThirdPartyProviderConfig(thirdPartyApi, thirdPartyApi.activeProvider, updates);
