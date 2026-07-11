import type { GoogleGenAI } from '@google/genai';
import type { AppSettings } from '@/types';
import { dbService } from '@/services/db/dbService';
import { logService } from '@/services/logService';
import { getRuntimeConfigAppSettingsOverrides, isRuntimeApiConfigEnforced } from '@/runtime/runtimeConfig';
import {
  getGeminiApiBaseUrlForSettings,
  getGeminiProxyBaseUrlForSettings,
  resolveConfiguredGeminiBaseUrl,
} from './geminiApiBaseUrl';
import type { GeminiClientHttpOptions } from './geminiApiVersion';
import type { InternalGeminiApiClient } from './geminiResumableUpload';

type ClientConfig = {
  apiKey: string;
  httpOptions?: GeminiClientHttpOptions;
};

type GeminiApiRoutingSettings = Pick<AppSettings, 'useCustomApiConfig' | 'useApiProxy' | 'apiProxyUrl'>;

type ConfiguredApiRouting = {
  settings: GeminiApiRoutingSettings | null;
  apiProxyUrl: string | null;
};

type ConfiguredApiClientContext = {
  client: GoogleGenAI;
  uploadApiClient: InternalGeminiApiClient;
  apiBaseUrl: string;
  proxyBaseUrl: string | null;
};

type GoogleGenAIUploadClient = GoogleGenAI & {
  readonly apiClient: InternalGeminiApiClient;
};

const loadGoogleGenAI = async () => {
  const { GoogleGenAI } = await import('@google/genai');
  return GoogleGenAI;
};

const getUploadApiClient = (client: GoogleGenAI): InternalGeminiApiClient =>
  (client as GoogleGenAIUploadClient).apiClient;

export const getClient = async (
  apiKey: string,
  baseUrl?: string | null,
  httpOptions?: GeminiClientHttpOptions,
): Promise<GoogleGenAI> => {
  try {
    const sanitizedApiKey = apiKey
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u00A0]/g, ' ');

    if (apiKey !== sanitizedApiKey) {
      logService.warn('API key was sanitized. Non-ASCII characters were replaced.');
    }

    const config: ClientConfig = { apiKey: sanitizedApiKey };
    const mergedHttpOptions = httpOptions ? { ...httpOptions } : undefined;

    if (baseUrl && baseUrl.trim().length > 0) {
      const sanitizedBaseUrl = getGeminiApiBaseUrlForSettings({
        useCustomApiConfig: true,
        useApiProxy: true,
        apiProxyUrl: baseUrl,
      });
      if (mergedHttpOptions) {
        mergedHttpOptions.baseUrl = sanitizedBaseUrl;
      } else {
        config.httpOptions = { baseUrl: sanitizedBaseUrl };
      }
    }

    if (mergedHttpOptions) {
      config.httpOptions = mergedHttpOptions;
    }

    const GoogleGenAIConstructor = await loadGoogleGenAI();
    return new GoogleGenAIConstructor(config);
  } catch (error) {
    logService.error('Failed to initialize GoogleGenAI client:', error);
    throw error;
  }
};

const applyEnforcedRuntimeRouting = (
  settings: GeminiApiRoutingSettings | null | undefined,
): GeminiApiRoutingSettings | null => {
  if (!isRuntimeApiConfigEnforced()) {
    return settings ?? null;
  }

  const runtimeOverrides = getRuntimeConfigAppSettingsOverrides();
  return {
    useCustomApiConfig: runtimeOverrides.useCustomApiConfig ?? settings?.useCustomApiConfig ?? false,
    useApiProxy: runtimeOverrides.useApiProxy ?? settings?.useApiProxy ?? false,
    apiProxyUrl:
      runtimeOverrides.apiProxyUrl !== undefined ? runtimeOverrides.apiProxyUrl : (settings?.apiProxyUrl ?? null),
  };
};

const loadConfiguredApiRouting = async (): Promise<ConfiguredApiRouting> => {
  const settings = applyEnforcedRuntimeRouting(await dbService.getAppSettings());

  const shouldUseProxy = !!(settings?.useCustomApiConfig && settings?.useApiProxy);
  const apiProxyUrl = settings ? resolveConfiguredGeminiBaseUrl(settings) : null;

  if (settings?.useCustomApiConfig && !shouldUseProxy && settings?.apiProxyUrl && !settings?.useApiProxy) {
    logService.debug("[API Config] Proxy URL present but 'Use API Proxy' toggle is OFF.");
  }

  return { settings, apiProxyUrl };
};

export const getConfiguredApiClient = async (
  apiKey: string,
  httpOptions?: GeminiClientHttpOptions,
): Promise<GoogleGenAI> => {
  const { apiProxyUrl } = await loadConfiguredApiRouting();
  return getClient(apiKey, apiProxyUrl, httpOptions);
};

export const getConfiguredApiClientContext = async (
  apiKey: string,
  httpOptions?: GeminiClientHttpOptions,
): Promise<ConfiguredApiClientContext> => {
  const { settings, apiProxyUrl } = await loadConfiguredApiRouting();
  const client = await getClient(apiKey, apiProxyUrl, httpOptions);

  return {
    client,
    uploadApiClient: getUploadApiClient(client),
    apiBaseUrl: getGeminiApiBaseUrlForSettings(settings),
    proxyBaseUrl: getGeminiProxyBaseUrlForSettings(settings),
  };
};
