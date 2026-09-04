import { type AppSettings, type ChatSettings, type ThirdPartyConnection } from '@/types';
import { API_KEY_LAST_USED_INDEX_BY_TARGET_KEY, API_KEY_LAST_USED_INDEX_KEY } from '@/constants/storageKeys';
import { logService } from '@/services/logService';
import { isUnavailableThirdPartyRoute, resolveChatApiRoute } from './chatApiRoute';
import { SERVER_MANAGED_API_KEY } from '../../shared/serverManagedApiKey';

export { SERVER_MANAGED_API_KEY };
const GEMINI_API_KEY_ROTATION_TARGET = '__gemini__';

export const THIRD_PARTY_CONNECTION_MISSING_ERROR = 'Third-party connection is unavailable.';
export const THIRD_PARTY_CONNECTION_DISABLED_ERROR = 'Third-party connection is disabled.';

type ServerManagedProxyEligibility = Pick<
  AppSettings,
  'serverManagedApi' | 'useCustomApiConfig' | 'useApiProxy' | 'apiProxyUrl'
>;

export const isServerManagedApiEnabledForProxyRequests = (appSettings: ServerManagedProxyEligibility): boolean =>
  !!(
    appSettings.serverManagedApi &&
    appSettings.useCustomApiConfig &&
    appSettings.useApiProxy &&
    appSettings.apiProxyUrl?.trim()
  );

type ApiKeyRequestMode = 'active' | 'gemini-native' | 'third-party';

type GetKeyForRequestOptions = {
  skipIncrement?: boolean;
  skipUsageLogging?: boolean;
  apiMode?: ApiKeyRequestMode;
  provider?: ThirdPartyConnection;
};

const resolveApiKeyRequestMode = (
  appSettings: AppSettings,
  currentChatSettings: ChatSettings,
  apiMode: ApiKeyRequestMode = 'active',
) => {
  if (apiMode !== 'active') {
    return apiMode;
  }

  return resolveChatApiRoute(appSettings, currentChatSettings).apiMode === 'third-party'
    ? 'third-party'
    : 'gemini-native';
};

const resolveProviderForKey = (
  appSettings: AppSettings,
  currentChatSettings: ChatSettings,
  options: GetKeyForRequestOptions,
): ThirdPartyConnection | undefined => {
  if (options.provider) {
    return options.provider;
  }
  const route = resolveChatApiRoute(appSettings, currentChatSettings);
  if (route.provider) {
    return route.provider;
  }
  return undefined;
};

const getActiveApiConfig = (
  appSettings: AppSettings,
  currentChatSettings: ChatSettings,
  options: GetKeyForRequestOptions = {},
): { apiKeysString: string | null } => {
  const importEnv = (
    import.meta as ImportMeta & {
      env?: {
        VITE_GEMINI_API_KEY?: string;
        VITE_OPENAI_API_KEY?: string;
      };
    }
  ).env;

  if (resolveApiKeyRequestMode(appSettings, currentChatSettings, options.apiMode) === 'third-party') {
    const provider = resolveProviderForKey(appSettings, currentChatSettings, options);
    const envFallback = provider?.protocol === 'openai-compatible' ? importEnv?.VITE_OPENAI_API_KEY : null;
    return { apiKeysString: provider?.apiKey || envFallback || null };
  }

  if (appSettings.useCustomApiConfig) {
    return {
      apiKeysString: appSettings.apiKey,
    };
  }
  return {
    apiKeysString: importEnv?.VITE_GEMINI_API_KEY || null,
  };
};

export const parseApiKeys = (apiKeysString: string | null): string[] => {
  if (!apiKeysString) return [];
  return apiKeysString
    .split(/[\n,]+/)
    .map((apiKey) => apiKey.trim().replace(/^["']|["']$/g, ''))
    .filter((apiKey) => apiKey.length > 0);
};

const readRotationMap = (): Record<string, number> => {
  try {
    const storedMap = localStorage.getItem(API_KEY_LAST_USED_INDEX_BY_TARGET_KEY);
    if (storedMap) {
      const parsed: unknown = JSON.parse(storedMap);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, number>;
      }
    }

    const legacyIndex = localStorage.getItem(API_KEY_LAST_USED_INDEX_KEY);
    if (legacyIndex !== null) {
      const parsed = parseInt(legacyIndex, 10);
      if (!Number.isNaN(parsed)) {
        return { [GEMINI_API_KEY_ROTATION_TARGET]: parsed };
      }
    }
  } catch (storageError) {
    logService.error('Could not parse last used API key index', storageError);
  }

  return {};
};

const writeRotationIndex = (targetId: string, index: number) => {
  try {
    const nextMap = { ...readRotationMap(), [targetId]: index };
    localStorage.setItem(API_KEY_LAST_USED_INDEX_BY_TARGET_KEY, JSON.stringify(nextMap));
  } catch (storageError) {
    logService.error('Could not save last used API key index', storageError);
  }
};

export const getKeyForRequest = (
  appSettings: AppSettings,
  currentChatSettings: ChatSettings,
  options: GetKeyForRequestOptions = {},
): { key: string; isNewKey: boolean } | { error: string } => {
  const { skipIncrement = false } = options;
  const { skipUsageLogging = false } = options;
  const apiKeyRequestMode = resolveApiKeyRequestMode(appSettings, currentChatSettings, options.apiMode);
  const route = resolveChatApiRoute(appSettings, currentChatSettings);

  if ((options.apiMode ?? 'active') === 'active' && isUnavailableThirdPartyRoute(route)) {
    return {
      error:
        route.unavailable === 'disabled' ? THIRD_PARTY_CONNECTION_DISABLED_ERROR : THIRD_PARTY_CONNECTION_MISSING_ERROR,
    };
  }

  const shouldUseServerManagedMarker =
    apiKeyRequestMode !== 'third-party' && isServerManagedApiEnabledForProxyRequests(appSettings);
  const shouldLogUsage = !skipUsageLogging && (apiKeyRequestMode === 'third-party' || appSettings.useCustomApiConfig);

  const logUsage = (key: string) => {
    if (shouldLogUsage) {
      logService.recordApiKeyUsage(key);
    }
  };

  const { apiKeysString } = getActiveApiConfig(appSettings, currentChatSettings, options);
  if (!apiKeysString) {
    if (shouldUseServerManagedMarker) {
      return { key: SERVER_MANAGED_API_KEY, isNewKey: false };
    }
    return { error: 'API Key not configured.' };
  }

  const availableKeys = parseApiKeys(apiKeysString);

  if (availableKeys.length === 0) {
    if (shouldUseServerManagedMarker) {
      return { key: SERVER_MANAGED_API_KEY, isNewKey: false };
    }
    return { error: 'No valid API keys found.' };
  }

  if (currentChatSettings.lockedApiKey) {
    if (availableKeys.includes(currentChatSettings.lockedApiKey)) {
      logUsage(currentChatSettings.lockedApiKey);
      return { key: currentChatSettings.lockedApiKey, isNewKey: false };
    }
    logService.warn('Locked key not found in current configuration. Falling back to rotation.');
  }

  if (availableKeys.length === 1) {
    const key = availableKeys[0];
    logUsage(key);
    const isNewKey = currentChatSettings.lockedApiKey !== key;
    return { key, isNewKey };
  }

  const rotationTarget =
    apiKeyRequestMode === 'third-party'
      ? (options.provider?.id ?? route.providerId ?? GEMINI_API_KEY_ROTATION_TARGET)
      : GEMINI_API_KEY_ROTATION_TARGET;
  const rotationMap = readRotationMap();
  let lastUsedIndex = rotationMap[rotationTarget] ?? -1;

  if (isNaN(lastUsedIndex) || lastUsedIndex < 0 || lastUsedIndex >= availableKeys.length) {
    lastUsedIndex = -1;
  }

  let targetIndex: number;

  if (skipIncrement) {
    targetIndex = lastUsedIndex === -1 ? 0 : lastUsedIndex;
  } else {
    targetIndex = (lastUsedIndex + 1) % availableKeys.length;
    writeRotationIndex(rotationTarget, targetIndex);
  }

  const nextKey = availableKeys[targetIndex];
  logUsage(nextKey);
  return { key: nextKey, isNewKey: true };
};

export const getGeminiKeyForRequest = (
  appSettings: AppSettings,
  currentChatSettings: ChatSettings,
  options: Omit<GetKeyForRequestOptions, 'apiMode'> = {},
): { key: string; isNewKey: boolean } | { error: string } => {
  const keySettings =
    resolveChatApiRoute(appSettings, currentChatSettings).apiMode === 'third-party'
      ? { ...currentChatSettings, lockedApiKey: null }
      : currentChatSettings;

  return getKeyForRequest(appSettings, keySettings, {
    ...options,
    apiMode: 'gemini-native',
  });
};

export const getLiveApiKey = (appSettings: AppSettings, currentChatSettings?: ChatSettings): string | null => {
  if (appSettings.liveApiKey && appSettings.liveApiKey.trim()) {
    const parsedKeys = parseApiKeys(appSettings.liveApiKey);
    if (parsedKeys.length > 0) {
      return parsedKeys[0];
    }
  }

  const fallbackSettings = currentChatSettings ?? ({ modelId: 'gemini-3.1-flash-live-preview' } as ChatSettings);
  const keyResult = getGeminiKeyForRequest(appSettings, fallbackSettings, {
    skipIncrement: true,
    skipUsageLogging: true,
  });

  if ('error' in keyResult || keyResult.key === SERVER_MANAGED_API_KEY) {
    return null;
  }

  return keyResult.key;
};

const getApiKeyErrorTranslationKey = (error: string): string | null => {
  switch (error) {
    case 'API Key not configured.':
      return 'apiRuntimeKeyNotConfigured';
    case 'No valid API keys found.':
      return 'apiRuntimeNoValidKeysFound';
    case THIRD_PARTY_CONNECTION_MISSING_ERROR:
      return 'apiRuntimeThirdPartyConnectionMissing';
    case THIRD_PARTY_CONNECTION_DISABLED_ERROR:
      return 'apiRuntimeThirdPartyConnectionDisabled';
    default:
      return null;
  }
};

export const formatApiKeyErrorMessage = (error: string, translate: (translationKey: string) => string): string => {
  const translationKey = getApiKeyErrorTranslationKey(error);
  return translationKey ? translate(translationKey) : error;
};
