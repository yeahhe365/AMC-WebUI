export interface ThirdPartyProxyRoute {
  baseUrl: string;
  apiKey?: string;
}

export interface ApiServerConfig {
  port: number;
  geminiApiBase: string;
  geminiApiKey?: string;
  liveGeminiApiKey?: string;
  allowedOrigins: string[];
  enableMcpStdio: boolean;
  enableMcpPrivateHttp: boolean;
  enableLiveWsProxy: boolean;
  liveWsIdleTimeoutMs: number;
  /** Test hook only: overrides the Live upstream WS base (scheme + host). Production config never sets it. */
  liveWsUpstreamBase?: string;
  serverKeyPriority: boolean;
  thirdPartyRoutes: Record<string, ThirdPartyProxyRoute>;
}

interface EnvLike {
  [key: string]: string | undefined;
}

const DEFAULT_PORT = 3001;
const DEFAULT_GEMINI_API_BASE = 'https://generativelanguage.googleapis.com';
const DEFAULT_LIVE_WS_IDLE_TIMEOUT_MS = 300_000;

function parsePort(port: string | undefined): number {
  if (!port) {
    return DEFAULT_PORT;
  }

  const parsed = Number.parseInt(port, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return DEFAULT_PORT;
  }

  return parsed;
}

function parseAllowedOrigins(rawOrigins: string | undefined): string[] {
  if (!rawOrigins) {
    return [];
  }

  return rawOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

function parseBooleanFlag(value: string | undefined): boolean {
  return ['1', 'true', 'yes', 'on'].includes(value?.trim().toLowerCase() ?? '');
}

function parseLiveWsIdleTimeoutMs(value: string | undefined): number {
  if (!value) {
    return DEFAULT_LIVE_WS_IDLE_TIMEOUT_MS;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return DEFAULT_LIVE_WS_IDLE_TIMEOUT_MS;
  }

  return parsed;
}

// SERVER_KEY_PRIORITY selects which API key wins when both a server-managed key
// and a browser-supplied (BYOK) key are present:
//   false (default) → browser key first, server key as fallback (BYOK 兜底 semantics)
//   true            → server key first, browser key as fallback
const SERVER_KEY_PRIORITY_DEFAULT = false;

function parseServerKeyPriority(value: string | undefined): boolean {
  if (value === undefined || value.trim() === '') {
    return SERVER_KEY_PRIORITY_DEFAULT;
  }
  return parseBooleanFlag(value);
}

function parseThirdPartyRoutes(rawRoutes: string | undefined): Record<string, ThirdPartyProxyRoute> {
  if (!rawRoutes || !rawRoutes.trim()) {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawRoutes);
  } catch {
    console.error('[config] THIRD_PARTY_ROUTES is not valid JSON; ignoring.');
    return {};
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    console.error('[config] THIRD_PARTY_ROUTES must be a JSON object; ignoring.');
    return {};
  }

  const routes: Record<string, ThirdPartyProxyRoute> = {};
  for (const [providerId, entry] of Object.entries(parsed as Record<string, unknown>)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      continue;
    }

    const candidate = entry as { baseUrl?: unknown; apiKey?: unknown };
    const baseUrl = typeof candidate.baseUrl === 'string' ? candidate.baseUrl.trim() : '';
    if (!baseUrl) {
      continue;
    }

    const apiKey = typeof candidate.apiKey === 'string' ? candidate.apiKey.trim() : undefined;
    routes[providerId] = { baseUrl, apiKey: apiKey || undefined };
  }

  return routes;
}

export function loadConfig(env: EnvLike = process.env): ApiServerConfig {
  return {
    port: parsePort(env.PORT),
    geminiApiBase: env.GEMINI_API_BASE?.trim() || DEFAULT_GEMINI_API_BASE,
    geminiApiKey: env.GEMINI_API_KEY?.trim() || undefined,
    liveGeminiApiKey: env.LIVE_GEMINI_API_KEY?.trim() || undefined,
    allowedOrigins: parseAllowedOrigins(env.ALLOWED_ORIGINS),
    enableMcpStdio: parseBooleanFlag(env.ENABLE_MCP_STDIO),
    enableMcpPrivateHttp: parseBooleanFlag(env.ENABLE_MCP_PRIVATE_HTTP),
    enableLiveWsProxy: parseBooleanFlag(env.ENABLE_LIVE_WS_PROXY),
    liveWsIdleTimeoutMs: parseLiveWsIdleTimeoutMs(env.LIVE_WS_IDLE_TIMEOUT_MS),
    serverKeyPriority: parseServerKeyPriority(env.SERVER_KEY_PRIORITY),
    thirdPartyRoutes: parseThirdPartyRoutes(env.THIRD_PARTY_ROUTES),
  };
}
