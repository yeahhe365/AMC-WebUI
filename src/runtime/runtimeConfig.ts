import type { AppSettings } from '@/types';

type RuntimeConfigKey =
  | 'serverManagedApi'
  | 'useCustomApiConfig'
  | 'useApiProxy'
  | 'apiProxyUrl'
  | 'liveApiBaseUrl'
  | 'thirdPartyProxyUrl'
  | 'pyodideBaseUrl';

type RuntimeConfigShape = Partial<Record<RuntimeConfigKey, unknown>>;

declare global {
  interface Window {
    __AMC_RUNTIME_CONFIG__?: RuntimeConfigShape;
  }
}

function readBooleanValue(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') {
      return true;
    }
    if (normalized === 'false' || normalized === '0') {
      return false;
    }
  }

  return undefined;
}

function readNullableString(value: unknown): string | null | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (value === null) {
    return null;
  }

  return undefined;
}

function getRuntimeConfig(): RuntimeConfigShape | undefined {
  return typeof window !== 'undefined' ? window.__AMC_RUNTIME_CONFIG__ : undefined;
}

export function getPyodideBaseUrl(): string | null {
  return readNullableString(getRuntimeConfig()?.pyodideBaseUrl) ?? null;
}

/**
 * Live API WS proxy base URL injected by the Docker web container
 * (RUNTIME_LIVE_API_BASE_URL). Returns null in static/Pages deploys so the
 * frontend falls back to a direct browser WS connection.
 */
export function getLiveApiProxyBaseUrl(): string | null {
  return readNullableString(getRuntimeConfig()?.liveApiBaseUrl) ?? null;
}

/**
 * Third-party (OpenAI-compatible / Anthropic) HTTP proxy base URL injected by
 * the Docker web container (RUNTIME_THIRD_PARTY_PROXY_URL). Returns null in
 * static/Pages deploys so the frontend falls back to direct browser requests.
 */
export function getThirdPartyProxyBaseUrl(): string | null {
  return readNullableString(getRuntimeConfig()?.thirdPartyProxyUrl) ?? null;
}

/**
 * Whether the deployment provides an api container that can proxy /api/gemini
 * requests. True only when the runtime config (Docker web-server.js) explicitly
 * enables the proxy AND sets it to a relative path. False in static/Pages
 * deploys where requests go directly from the browser to the upstream.
 *
 * Unlike appSettings.useApiProxy (which the user can toggle), this reads the
 * original deployment-level runtime config before any user settings override it.
 */
export function hasDeploymentApiContainer(): boolean {
  const config = getRuntimeConfig();
  if (!config) return false;
  const enabled = readBooleanValue(config.useApiProxy) === true;
  const proxyUrl = readNullableString(config.apiProxyUrl);
  return enabled && Boolean(proxyUrl && !/^https?:\/\//i.test(proxyUrl.trim()));
}

/**
 * Returns the deployment-level Gemini API proxy URL (e.g. "/api/gemini") when
 * the api container is available; null otherwise. Reads the raw runtime config,
 * not user settings, so it survives changes to appSettings.apiProxyUrl.
 *
 * Use this when deciding the base URL the browser should send requests TO.
 * When available, all Gemini requests route through the api container even if
 * the user configured an absolute upstream address.
 */
export function getGeminiApiProxyBaseUrl(): string | null {
  if (!hasDeploymentApiContainer()) return null;
  return readNullableString(getRuntimeConfig()?.apiProxyUrl) ?? null;
}

export function getRuntimeConfigAppSettingsOverrides(): Partial<
  Pick<AppSettings, 'serverManagedApi' | 'useCustomApiConfig' | 'useApiProxy' | 'apiProxyUrl'>
> {
  const runtimeConfig = getRuntimeConfig();

  if (!runtimeConfig) {
    return {};
  }

  const overrides: Partial<
    Pick<AppSettings, 'serverManagedApi' | 'useCustomApiConfig' | 'useApiProxy' | 'apiProxyUrl'>
  > = {};

  const serverManagedApi = readBooleanValue(runtimeConfig.serverManagedApi);
  if (serverManagedApi !== undefined) {
    overrides.serverManagedApi = serverManagedApi;
  }

  const useCustomApiConfig = readBooleanValue(runtimeConfig.useCustomApiConfig);
  if (useCustomApiConfig !== undefined) {
    overrides.useCustomApiConfig = useCustomApiConfig;
  }

  const useApiProxy = readBooleanValue(runtimeConfig.useApiProxy);
  if (useApiProxy !== undefined) {
    overrides.useApiProxy = useApiProxy;
  }

  const apiProxyUrl = readNullableString(runtimeConfig.apiProxyUrl);
  if (apiProxyUrl !== undefined) {
    overrides.apiProxyUrl = apiProxyUrl;
  }

  return overrides;
}
