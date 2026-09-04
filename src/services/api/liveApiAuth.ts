import type { GoogleGenAI } from '@google/genai';
import type { AppSettings } from '@/types';
import { getClient } from './apiClient';
import { SERVER_MANAGED_API_KEY } from '@/utils/apiKeySelection';
import { resolveLiveClientBaseUrl } from './geminiApiBaseUrl';
import type { GeminiClientHttpOptions } from './geminiApiVersion';

export class LiveApiAuthConfigurationError extends Error {
  code: 'MISSING_API_KEY';

  constructor(code: 'MISSING_API_KEY', message: string) {
    super(message);
    this.name = 'LiveApiAuthConfigurationError';
    this.code = code;
  }
}

export interface EphemeralTokenResponse {
  token: string;
  name: string;
  expireTime?: string;
  newSessionExpireTime?: string;
}

export const createLiveEphemeralToken = async (
  appSettings: Pick<AppSettings, 'useCustomApiConfig' | 'useApiProxy' | 'apiProxyUrl'>,
  options?: {
    model?: string;
    liveConnectConstraints?: Record<string, unknown>;
    apiKey?: string | null;
  },
): Promise<EphemeralTokenResponse> => {
  const proxyBaseUrl = resolveLiveClientBaseUrl(appSettings);
  const endpoint = proxyBaseUrl ? `${proxyBaseUrl}/api/live/ephemeral-token` : '/api/live/ephemeral-token';

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (options?.apiKey) {
    headers['x-goog-api-key'] = options.apiKey;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: options?.model,
      liveConnectConstraints: options?.liveConnectConstraints,
    }),
  });

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(errorData.error || `Failed to create ephemeral token: ${response.status}`);
  }

  return response.json() as Promise<EphemeralTokenResponse>;
};

export const getLiveApiClient = async (
  appSettings: Pick<AppSettings, 'useCustomApiConfig' | 'useApiProxy' | 'apiProxyUrl'>,
  httpOptions?: GeminiClientHttpOptions,
  apiKeyForLiveConnection?: string | null,
): Promise<GoogleGenAI> => {
  const proxyBaseUrl = resolveLiveClientBaseUrl(appSettings);
  const apiKey = apiKeyForLiveConnection?.trim();

  if (!apiKey) {
    // No browser key. If the Docker WS proxy is configured, hand the api
    // container the server-managed sentinel; it swaps in the real server key
    // (BYOK 兜底). Without the proxy there is nowhere to swap, so bail.
    if (proxyBaseUrl) {
      return getClient(SERVER_MANAGED_API_KEY, proxyBaseUrl, httpOptions);
    }
    throw new LiveApiAuthConfigurationError('MISSING_API_KEY', 'Live API requires a browser API key.');
  }

  return getClient(apiKey, proxyBaseUrl, httpOptions);
};
