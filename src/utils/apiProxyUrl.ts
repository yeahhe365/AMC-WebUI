const GEMINI_API_VERSION_SUFFIX = /\/v\d+(?:(?:alpha|beta)\d*|\.\d+)?$/i;

export const DEFAULT_GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com';
const DEFAULT_GEMINI_API_VERSION = 'v1beta';
export const DEFAULT_GEMINI_PROXY_URL = 'https://api-proxy.de/gemini';
export const DEFAULT_OPENAI_COMPATIBLE_BASE_URL = 'https://api.openai.com/v1';

const resolveRuntimeRelativeBaseUrl = (baseUrl: string): string => {
  try {
    return new URL(baseUrl, window.location.origin).toString();
  } catch {
    return baseUrl;
  }
};

export const normalizeGeminiApiBaseUrl = (baseUrl: string): string => {
  const rawBaseUrl = baseUrl.trim();
  const absoluteBaseUrl =
    rawBaseUrl.startsWith('/') && typeof window !== 'undefined'
      ? resolveRuntimeRelativeBaseUrl(rawBaseUrl)
      : rawBaseUrl;
  const trimmedBaseUrl = absoluteBaseUrl.replace(/\/+$/, '');
  return trimmedBaseUrl.replace(GEMINI_API_VERSION_SUFFIX, '');
};

export const buildGeminiRequestPreviewUrl = (
  baseUrl: string,
  modelId: string,
  method: 'generateContent' | 'streamGenerateContent',
  apiVersion: string = DEFAULT_GEMINI_API_VERSION,
): string => {
  const normalizedBaseUrl = normalizeGeminiApiBaseUrl(baseUrl);
  return `${normalizedBaseUrl}/${apiVersion}/models/${modelId}:${method}`;
};
