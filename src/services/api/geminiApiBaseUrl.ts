import type { AppSettings } from '@/types';
import { DEFAULT_GEMINI_API_BASE_URL, normalizeGeminiApiBaseUrl } from '@/utils/apiProxyUrl';

const GEMINI_API_VERSION_SUFFIX = /\/v\d+(?:(?:alpha|beta)\d*|\.\d+)?$/i;

type GeminiApiBaseUrlSettings = Pick<AppSettings, 'useCustomApiConfig' | 'useApiProxy' | 'apiProxyUrl'>;

export const resolveConfiguredGeminiBaseUrl = (appSettings: GeminiApiBaseUrlSettings): string | null => {
  const shouldUseProxy = !!(appSettings.useCustomApiConfig && appSettings.useApiProxy);
  return shouldUseProxy ? (appSettings.apiProxyUrl ?? null) : null;
};

const isAbsoluteHttpUrl = (url: string): boolean => /^https?:\/\//i.test(url.trim());

const normalizeConfiguredProxyBaseUrl = (baseUrl: string): string =>
  baseUrl.trim().replace(/\/+$/, '').replace(GEMINI_API_VERSION_SUFFIX, '');

export const getGeminiApiBaseUrlForSettings = (settings?: GeminiApiBaseUrlSettings | null): string => {
  const configuredBaseUrl = settings ? resolveConfiguredGeminiBaseUrl(settings) : null;
  return normalizeGeminiApiBaseUrl(configuredBaseUrl ?? DEFAULT_GEMINI_API_BASE_URL);
};

export const getGeminiProxyBaseUrlForSettings = (settings?: GeminiApiBaseUrlSettings | null): string | null => {
  const configuredBaseUrl = settings ? resolveConfiguredGeminiBaseUrl(settings) : null;
  return configuredBaseUrl ? normalizeConfiguredProxyBaseUrl(configuredBaseUrl) : null;
};

export const resolveLiveClientBaseUrl = (appSettings: GeminiApiBaseUrlSettings): string | null => {
  const configuredBaseUrl = resolveConfiguredGeminiBaseUrl(appSettings);
  if (!configuredBaseUrl || !isAbsoluteHttpUrl(configuredBaseUrl)) {
    return null;
  }

  const normalizedConfiguredBaseUrl = normalizeGeminiApiBaseUrl(configuredBaseUrl);
  return isAbsoluteHttpUrl(normalizedConfiguredBaseUrl) ? normalizedConfiguredBaseUrl : null;
};
