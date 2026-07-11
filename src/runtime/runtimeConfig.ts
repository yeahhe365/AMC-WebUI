import type { AppSettings } from '@/types';

type BackendFlavor = 'aistudio' | 'vertex';

type RuntimeConfigKey =
  | 'serverManagedApi'
  | 'useCustomApiConfig'
  | 'useApiProxy'
  | 'apiProxyUrl'
  | 'pyodideBaseUrl'
  | 'backendFlavor'
  | 'enforceApiConfig';

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

export function getBackendFlavor(): BackendFlavor {
  const value = getRuntimeConfig()?.backendFlavor;
  return typeof value === 'string' && value.trim().toLowerCase() === 'vertex' ? 'vertex' : 'aistudio';
}

export function isRuntimeApiConfigEnforced(): boolean {
  return getBackendFlavor() === 'vertex' || readBooleanValue(getRuntimeConfig()?.enforceApiConfig) === true;
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

  if (getBackendFlavor() === 'vertex') {
    return {
      ...overrides,
      serverManagedApi: true,
      useCustomApiConfig: true,
      useApiProxy: true,
      apiProxyUrl: typeof overrides.apiProxyUrl === 'string' ? overrides.apiProxyUrl : '/api/gemini',
    };
  }

  return overrides;
}
