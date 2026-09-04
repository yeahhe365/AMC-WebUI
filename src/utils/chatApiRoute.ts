import { type AppSettings, type ChatSettings, type ThirdPartyConnection, GEMINI_PROVIDER_ID } from '@/types';
import { findThirdPartyConnection, getEnabledThirdPartyProviders } from './thirdPartyApiProviders';

export type ChatApiRouteUnavailable = 'missing' | 'disabled';

export type ChatApiRoute =
  | {
      apiMode: 'gemini-native';
      modelId: string;
      provider?: undefined;
      providerId?: undefined;
      unavailable?: undefined;
    }
  | {
      apiMode: 'third-party';
      modelId: string;
      provider: ThirdPartyConnection;
      providerId: string;
      unavailable?: undefined;
    }
  | {
      apiMode: 'third-party';
      modelId: string;
      provider?: ThirdPartyConnection;
      providerId: string;
      unavailable: ChatApiRouteUnavailable;
    };

const findProviderForModelId = (
  appSettings: AppSettings,
  modelId: string,
): { id: string; config: ThirdPartyConnection } | undefined => {
  for (const { id, config } of getEnabledThirdPartyProviders(appSettings)) {
    if (config.models.some((model) => model.id === modelId)) {
      return { id, config };
    }
  }
  return undefined;
};

const isGeminiFamilyModelId = (modelId: string): boolean =>
  modelId.toLowerCase().includes('gemini') || modelId.toLowerCase().includes('gemma');

/**
 * Resolve which API a session talks to from `(providerId, modelId)`.
 * An explicit third-party connection id never falls back to Gemini when the
 * connection is missing or disabled.
 */
export const resolveChatApiRoute = (
  appSettings: AppSettings,
  chatSettings: ChatSettings,
  geminiModelIds?: Set<string>,
): ChatApiRoute => {
  const { modelId, providerId } = chatSettings;

  if (providerId && providerId !== GEMINI_PROVIDER_ID) {
    const connection = findThirdPartyConnection(appSettings, providerId);
    if (!connection) {
      return {
        apiMode: 'third-party',
        modelId,
        providerId,
        unavailable: 'missing',
      };
    }
    if (!connection.enabled) {
      return {
        apiMode: 'third-party',
        modelId: modelId || connection.modelId,
        provider: connection,
        providerId,
        unavailable: 'disabled',
      };
    }
    return {
      apiMode: 'third-party',
      modelId: modelId || connection.modelId,
      provider: connection,
      providerId,
    };
  }

  if (!providerId) {
    const isGemini = geminiModelIds ? geminiModelIds.has(modelId) : isGeminiFamilyModelId(modelId);
    if (!isGemini) {
      const resolved = findProviderForModelId(appSettings, modelId);
      if (resolved) {
        return {
          apiMode: 'third-party',
          modelId,
          provider: resolved.config,
          providerId: resolved.id,
        };
      }
    }
  }

  return {
    apiMode: 'gemini-native',
    modelId,
  };
};

export const isThirdPartyApiRoute = (appSettings: AppSettings, chatSettings: ChatSettings): boolean =>
  resolveChatApiRoute(appSettings, chatSettings).apiMode === 'third-party';

export const isUnavailableThirdPartyRoute = (
  route: ChatApiRoute,
): route is Extract<ChatApiRoute, { unavailable: ChatApiRouteUnavailable }> => route.unavailable !== undefined;
