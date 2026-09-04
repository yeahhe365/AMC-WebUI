import type { AppSettings } from '@/types';
import { DEFAULT_GEMINI_API_BASE_URL, normalizeGeminiApiBaseUrl } from '@/utils/apiProxyUrl';
import { getGeminiApiProxyBaseUrl, hasDeploymentApiContainer, getLiveApiProxyBaseUrl } from '@/runtime/runtimeConfig';

type GeminiApiBaseUrlSettings = Pick<AppSettings, 'useCustomApiConfig' | 'useApiProxy' | 'apiProxyUrl'>;

export const resolveConfiguredGeminiBaseUrl = (appSettings: GeminiApiBaseUrlSettings): string | null => {
  const shouldUseProxy = !!(appSettings.useCustomApiConfig && appSettings.useApiProxy);
  return shouldUseProxy ? (appSettings.apiProxyUrl ?? null) : null;
};

const isAbsoluteHttpUrl = (url: string): boolean => /^https?:\/\//i.test(url.trim());

/**
 * Whether the effective frontend base URL is a relative path, meaning the
 * browser sends Gemini requests through our own api container where the
 * stream-journal lives. Only then is it worth stamping x-amc-job-id for resume.
 *
 * Absolute proxy URLs bypass the api container, so journaling would be a no-op
 * there and we skip the header.
 */
export const isGeminiProxyRelativePath = (appSettings: GeminiApiBaseUrlSettings): boolean => {
  if (hasDeploymentApiContainer()) return true;
  const configured = resolveConfiguredGeminiBaseUrl(appSettings);
  return Boolean(configured) && !isAbsoluteHttpUrl(configured as string);
};

/**
 * When true, the browser should attach an x-gemini-upstream-base-url request
 * header telling the backend where the user's upstream proxy actually lives.
 * This happens when the deployment has an api container (Docker) AND the user
 * configured an absolute upstream proxy URL that differs from the frontend URL.
 */
export const shouldAttachGeminiUpstreamHeader = (appSettings: GeminiApiBaseUrlSettings): boolean => {
  if (!hasDeploymentApiContainer()) return false;
  const configured = resolveConfiguredGeminiBaseUrl(appSettings);
  return Boolean(configured) && isAbsoluteHttpUrl(configured as string);
};

/**
 * The normalized upstream base URL to send in the x-gemini-upstream-base-url
 * header. Returns null when no absolute upstream is configured.
 */
export const getNormalizedUpstreamBaseUrl = (appSettings: GeminiApiBaseUrlSettings): string | null => {
  const configured = resolveConfiguredGeminiBaseUrl(appSettings);
  if (!configured || !isAbsoluteHttpUrl(configured)) return null;
  return normalizeGeminiApiBaseUrl(configured);
};

/**
 * The base URL to use when constructing the SDK's GoogleGenAI client.
 *
 * In Docker mode, points to the api container via the deployment's proxy path
 * (e.g. "/api/gemini"), resolved against the current origin into an absolute
 * http(s) URL so the @google/genai SDK's internal `new URL(...)` does not throw
 * "Invalid URL" on a bare relative path. Requests still traverse our backend.
 * In static/Pages mode, uses the configured upstream or the default Gemini API URL.
 */
export const getGeminiApiBaseUrlForSettings = (settings?: GeminiApiBaseUrlSettings | null): string => {
  const runtimeBaseUrl = getGeminiApiProxyBaseUrl();
  if (runtimeBaseUrl) {
    return normalizeGeminiApiBaseUrl(toAbsoluteHttpUrl(runtimeBaseUrl));
  }
  const configuredBaseUrl = settings ? resolveConfiguredGeminiBaseUrl(settings) : null;
  return normalizeGeminiApiBaseUrl(configuredBaseUrl ?? DEFAULT_GEMINI_API_BASE_URL);
};

export const getGeminiProxyBaseUrlForSettings = (settings?: GeminiApiBaseUrlSettings | null): string | null => {
  const configuredBaseUrl = settings ? resolveConfiguredGeminiBaseUrl(settings) : null;
  return configuredBaseUrl ? normalizeGeminiApiBaseUrl(configuredBaseUrl) : null;
};

// Resolve a relative frontend path (e.g. "/api/live") injected by the Docker
// web container into an absolute http(s) URL against the current origin. The
// @google/genai SDK converts http→ws / https→wss itself in getWebsocketBaseUrl,
// so we hand it an HTTP(S) URL rather than a pre-converted ws(s):// one.
export const toAbsoluteHttpUrl = (httpUrl: string): string => {
  const trimmed = httpUrl.trim();
  if (isAbsoluteHttpUrl(trimmed)) {
    return trimmed;
  }
  if (typeof window !== 'undefined') {
    return new URL(trimmed, window.location.origin).toString();
  }
  return trimmed;
};

export const resolveLiveClientBaseUrl = (appSettings: GeminiApiBaseUrlSettings): string | null => {
  // Docker runtime injection takes precedence: a relative /api/live path means
  // the api container terminates the WS upgrade and bridges to the upstream.
  const runtimeProxy = getLiveApiProxyBaseUrl();
  if (runtimeProxy) {
    return toAbsoluteHttpUrl(runtimeProxy);
  }

  const configuredBaseUrl = resolveConfiguredGeminiBaseUrl(appSettings);
  if (!configuredBaseUrl) {
    return null;
  }

  const normalizedConfiguredBaseUrl = normalizeGeminiApiBaseUrl(configuredBaseUrl);
  return isAbsoluteHttpUrl(normalizedConfiguredBaseUrl) ? normalizedConfiguredBaseUrl : null;
};
