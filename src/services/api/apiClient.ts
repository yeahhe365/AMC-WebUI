import type { GoogleGenAI } from '@google/genai';
import { dbService } from '@/services/db/dbService';
import { logService } from '@/services/logService';
import {
  getGeminiApiBaseUrlForSettings,
  getGeminiProxyBaseUrlForSettings,
  resolveConfiguredGeminiBaseUrl,
  shouldAttachGeminiUpstreamHeader,
  getNormalizedUpstreamBaseUrl,
  toAbsoluteHttpUrl,
} from './geminiApiBaseUrl';
import { normalizeGeminiApiBaseUrl } from '@/utils/apiProxyUrl';
import { type GeminiClientHttpOptions, withHttpOptionHeaders } from './geminiApiVersion';
import type { InternalGeminiApiClient } from './geminiResumableUpload';

type ClientConfig = {
  apiKey: string;
  httpOptions?: GeminiClientHttpOptions;
};

type ConfiguredApiRouting = {
  settings: Awaited<ReturnType<typeof dbService.getAppSettings>>;
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
      const sanitizedBaseUrl = baseUrl.includes('/api/live')
        ? normalizeGeminiApiBaseUrl(toAbsoluteHttpUrl(baseUrl))
        : getGeminiApiBaseUrlForSettings({
            useCustomApiConfig: true,
            useApiProxy: true,
            apiProxyUrl: baseUrl,
          });
      if (mergedHttpOptions) {
        if (!mergedHttpOptions.baseUrl) {
          mergedHttpOptions.baseUrl = sanitizedBaseUrl;
        }
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

const loadConfiguredApiRouting = async (): Promise<ConfiguredApiRouting> => {
  const settings = await dbService.getAppSettings();

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
  routingOverrides?: { directGoogleApi?: boolean },
): Promise<GoogleGenAI> => {
  const { settings, apiProxyUrl } = await loadConfiguredApiRouting();

  const effectiveApiProxyUrl = routingOverrides?.directGoogleApi ? null : apiProxyUrl;

  // Docker mode: when the user configured an absolute upstream proxy URL, the
  // frontend sends all Gemini requests to the api container's relative path
  // and needs to tell the backend where to forward via a request header.
  const upstreamHeader =
    settings && !routingOverrides?.directGoogleApi
      ? (() => {
          if (!shouldAttachGeminiUpstreamHeader(settings)) return undefined;
          const upstreamUrl = getNormalizedUpstreamBaseUrl(settings);
          return upstreamUrl ? { 'x-gemini-upstream-base-url': upstreamUrl } : undefined;
        })()
      : undefined;

  const mergedHttpOptions = upstreamHeader ? withHttpOptionHeaders(httpOptions, upstreamHeader) : httpOptions;
  return getClient(apiKey, effectiveApiProxyUrl, mergedHttpOptions);
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
