import http from 'node:http';
import type { ApiServerConfig } from './config.js';
import { type ThirdPartyProxyRoute } from './config.js';
import {
  handleLocalClipboardImageRequest,
  LOCAL_CLIPBOARD_IMAGE_PATH,
  type LocalClipboardImage,
  readMacOsClipboardPng,
} from './clipboardImage.js';
import { getCorsHeaders, sendJson } from './cors.js';
import { GEMINI_PROXY_PREFIX, proxyGeminiRequest, type GeminiProxyConfig } from './proxy/geminiProxy.js';
import { IMAGE_PROXY_PATH, proxyExternalImage } from './proxy/imageProxy.js';
import { createMcpClientBridge } from './mcp/mcpClient.js';
import { handleMcpRequest } from './mcp/mcpRoutes.js';
import type { McpClientBridge } from './mcp/mcpTypes.js';
import { handleEphemeralTokenRequest, EPHEMERAL_TOKEN_PATH } from './security/ephemeralToken.js';
import { abortJob, readJobSecret } from './stream-jobs/streamJobStore.js';
import { STREAM_ABORT_PREFIX, UNIFIED_STREAM_ABORT_PREFIX } from './stream-jobs/streamJobsRoutes.js';
import { OPENAI_PROXY_PREFIX, proxyThirdPartyRequest, type ThirdPartyProxyConfig } from './proxy/thirdPartyProxy.js';
import { timingSafePasswordEqual } from './security/passwordSecurity.js';
import {
  ACCESS_COOKIE_NAME,
  buildAccessCookieClearHeader,
  buildAccessCookieHeader,
  readCookieValue,
  timingSafeCookieEqual,
} from './security/accessCookie.js';

interface CreateServerDependencies {
  fetchImpl?: typeof fetch;
  readLocalClipboardImage?: () => Promise<LocalClipboardImage | null>;
  mcpClient?: McpClientBridge;
}

type CreateServerConfig = Pick<ApiServerConfig, 'geminiApiBase' | 'geminiApiKey'> &
  Partial<
    Pick<
      ApiServerConfig,
      | 'accessPassword'
      | 'allowedOrigins'
      | 'enableMcpStdio'
      | 'enableMcpPrivateHttp'
      | 'enableThirdPartyPrivateHttp'
      | 'enableLiveWsProxy'
      | 'liveWsIdleTimeoutMs'
      | 'liveWsUpstreamBase'
      | 'serverKeyPriority'
      | 'thirdPartyRoutes'
    >
  >;

interface ResolvedServerConfig
  extends
    Omit<
      CreateServerConfig,
      | 'allowedOrigins'
      | 'enableMcpStdio'
      | 'enableMcpPrivateHttp'
      | 'enableThirdPartyPrivateHttp'
      | 'enableLiveWsProxy'
      | 'liveWsIdleTimeoutMs'
      | 'liveWsUpstreamBase'
      | 'serverKeyPriority'
      | 'thirdPartyRoutes'
    >,
    GeminiProxyConfig,
    ThirdPartyProxyConfig {
  accessPassword?: string;
  allowedOrigins: string[];
  enableMcpStdio: boolean;
  enableMcpPrivateHttp: boolean;
  enableThirdPartyPrivateHttp: boolean;
  enableLiveWsProxy: boolean;
  liveWsIdleTimeoutMs: number;
  liveWsUpstreamBase?: string;
  serverKeyPriority: boolean;
  thirdPartyRoutes: Record<string, ThirdPartyProxyRoute>;
}

function isAuthorized(request: http.IncomingMessage, accessPassword?: string): boolean {
  if (!accessPassword) {
    return true;
  }

  const rawAuth = request.headers['authorization'];
  const authHeader = Array.isArray(rawAuth) ? rawAuth[0] : rawAuth;
  if (authHeader && typeof authHeader === 'string') {
    const trimmed = authHeader.trim();
    if (trimmed.startsWith('Bearer ')) {
      const token = trimmed.slice(7).trim();
      if (timingSafePasswordEqual(token, accessPassword)) {
        return true;
      }
    }
  }

  const rawToken = request.headers['x-access-token'];
  const customToken = Array.isArray(rawToken) ? rawToken[0] : rawToken;
  if (typeof customToken === 'string' && timingSafePasswordEqual(customToken.trim(), accessPassword)) {
    return true;
  }

  // Browsers cannot set headers on a WebSocket handshake, but they do send
  // cookies, so a session cookie from /api/auth/verify is the only channel that
  // works for deployments without the Docker WS bridge.
  const rawCookie = request.headers.cookie;
  const cookieHeader = Array.isArray(rawCookie) ? rawCookie[0] : rawCookie;
  if (timingSafeCookieEqual(readCookieValue(cookieHeader, ACCESS_COOKIE_NAME), accessPassword)) {
    return true;
  }

  return false;
}

/** Whether the request's Origin names a different host than the one that was called. */
const isCrossSiteRequest = (request: http.IncomingMessage): boolean => {
  const rawOrigin = request.headers.origin;
  const origin = Array.isArray(rawOrigin) ? rawOrigin[0] : rawOrigin;
  const rawHost = request.headers.host;
  const host = Array.isArray(rawHost) ? rawHost[0] : rawHost;
  if (!origin || !host) {
    return false;
  }
  try {
    return new URL(origin).host !== host;
  } catch {
    return false;
  }
};

/** Whether the request arrived over TLS, so cookies may be marked Secure. */
const isSecureRequest = (request: http.IncomingMessage): boolean => {
  const forwardedProto = request.headers['x-forwarded-proto'];
  const proto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
  return typeof proto === 'string' && proto.split(',')[0].trim().toLowerCase() === 'https';
};

export function createServer(config: CreateServerConfig, dependencies: CreateServerDependencies = {}): http.Server {
  const resolvedConfig: ResolvedServerConfig = {
    ...config,
    accessPassword: config.accessPassword,
    allowedOrigins: config.allowedOrigins ?? [],
    enableMcpStdio: config.enableMcpStdio ?? false,
    enableMcpPrivateHttp: config.enableMcpPrivateHttp ?? false,
    enableThirdPartyPrivateHttp: config.enableThirdPartyPrivateHttp ?? false,
    enablePrivateHttp: config.enableThirdPartyPrivateHttp ?? false,
    enableLiveWsProxy: config.enableLiveWsProxy ?? false,
    liveWsIdleTimeoutMs: config.liveWsIdleTimeoutMs ?? 300_000,
    serverKeyPriority: config.serverKeyPriority ?? false,
    thirdPartyRoutes: config.thirdPartyRoutes ?? {},
  };

  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const readLocalClipboardImage = dependencies.readLocalClipboardImage ?? readMacOsClipboardPng;
  const mcpClient =
    dependencies.mcpClient ??
    createMcpClientBridge({
      allowPrivateHttp: resolvedConfig.enableMcpPrivateHttp,
      fetchImpl,
    });

  return http.createServer(async (request, response) => {
    try {
      const corsHeaders = getCorsHeaders(request, resolvedConfig.allowedOrigins);
      const requestUrl = new URL(request.url || '/', 'http://localhost');
      const path = requestUrl.pathname;
      const method = request.method || 'GET';

      if (method === 'OPTIONS') {
        response.writeHead(204, {
          ...corsHeaders,
          'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
          'access-control-allow-headers':
            (request.headers['access-control-request-headers'] as string | undefined) || '*',
        });
        response.end();
        return;
      }

      if (method === 'GET' && (path === '/health' || path === '/api/health')) {
        sendJson(
          request,
          response,
          200,
          {
            status: 'ok',
            timestamp: new Date().toISOString(),
            uptimeSeconds: Math.floor(process.uptime()),
            authRequired: Boolean(resolvedConfig.accessPassword),
            capabilities: {
              liveWsProxy: resolvedConfig.enableLiveWsProxy,
              thirdPartyProxy: Object.keys(resolvedConfig.thirdPartyRoutes).length > 0,
              mcpStdio: resolvedConfig.enableMcpStdio,
              mcpPrivateHttp: resolvedConfig.enableMcpPrivateHttp,
              thirdPartyPrivateHttp: resolvedConfig.enableThirdPartyPrivateHttp,
            },
          },
          resolvedConfig.allowedOrigins,
        );
        return;
      }

      if (path === '/api/auth/verify') {
        const authorized = isAuthorized(request, resolvedConfig.accessPassword);
        const secure = isSecureRequest(request);
        // A cross-site frontend needs SameSite=None to have the cookie ride a
        // WS upgrade; same-site deployments keep the stricter Lax.
        const crossSite = isCrossSiteRequest(request);
        // Issue (or clear) the cookie session here: this is the only successful
        // credential handshake the browser can complete, and the WS upgrade
        // cannot carry a header.
        const cookieHeaders = authorized
          ? [buildAccessCookieHeader(resolvedConfig.accessPassword, { secure, crossSite })].filter(
              (value): value is string => value !== null,
            )
          : [];
        const clearCookies = !authorized && request.headers.cookie;
        sendJson(
          request,
          response,
          authorized ? 200 : 401,
          authorized
            ? { ok: true, authRequired: Boolean(resolvedConfig.accessPassword) }
            : { error: 'Unauthorized', message: 'Invalid or missing server access password' },
          resolvedConfig.allowedOrigins,
          [...cookieHeaders, ...(clearCookies ? [buildAccessCookieClearHeader({ secure, crossSite })] : [])],
        );
        return;
      }

      if (!isAuthorized(request, resolvedConfig.accessPassword)) {
        sendJson(
          request,
          response,
          401,
          { error: 'Unauthorized', message: 'Invalid or missing server access password' },
          resolvedConfig.allowedOrigins,
        );
        return;
      }

      if (path === IMAGE_PROXY_PATH) {
        await proxyExternalImage(request, response, requestUrl, resolvedConfig.allowedOrigins, fetchImpl);
        return;
      }

      if (path === LOCAL_CLIPBOARD_IMAGE_PATH) {
        await handleLocalClipboardImageRequest(
          request,
          response,
          resolvedConfig.allowedOrigins,
          readLocalClipboardImage,
        );
        return;
      }

      if (
        await handleMcpRequest(request, response, path, resolvedConfig.allowedOrigins, mcpClient, {
          enableStdio: resolvedConfig.enableMcpStdio,
          enablePrivateHttp: resolvedConfig.enableMcpPrivateHttp,
        })
      ) {
        return;
      }

      if (path === EPHEMERAL_TOKEN_PATH) {
        await handleEphemeralTokenRequest(request, response, resolvedConfig, fetchImpl);
        return;
      }

      if (path === OPENAI_PROXY_PREFIX || path.startsWith(`${OPENAI_PROXY_PREFIX}/`)) {
        await proxyThirdPartyRequest(request, response, resolvedConfig, fetchImpl);
        return;
      }

      // Local helper shared by the unified stream-abort endpoint and the legacy
      // Gemini alias below: a POST carrying a job id kills that journal job and
      // is answered 200/404; anything else falls through to the next route.
      const respondAbort = (prefix: string): boolean => {
        if (!path.startsWith(`${prefix}/`)) {
          return false;
        }
        const jobId = path.slice(`${prefix}/`.length);
        if (!(method === 'POST' && jobId)) {
          return false;
        }
        const aborted = abortJob(jobId, readJobSecret(request));
        sendJson(
          request,
          response,
          aborted ? 200 : 404,
          aborted ? { ok: true } : { error: 'job not found' },
          resolvedConfig.allowedOrigins,
        );
        return true;
      };

      // Unified stream-abort endpoint: terminates any job in the shared store
      // regardless of provider (Gemini, OpenAI-compatible, or Anthropic). Placed
      // before the provider blocks so it works for every provider's job id.
      if (respondAbort(UNIFIED_STREAM_ABORT_PREFIX)) {
        return;
      }

      if (path === GEMINI_PROXY_PREFIX || path.startsWith(`${GEMINI_PROXY_PREFIX}/`)) {
        // Legacy stream-abort alias: the browser POSTs here when the user
        // clicks "stop" so the upstream is killed in addition to the local
        // abort. Kept for backward compat; routes to the same shared store.
        if (respondAbort(STREAM_ABORT_PREFIX)) {
          return;
        }

        await proxyGeminiRequest(request, response, resolvedConfig, fetchImpl);
        return;
      }

      sendJson(request, response, 404, { error: 'Not found' }, resolvedConfig.allowedOrigins);
    } catch (requestError) {
      // The 500 body stays generic; the diagnostics only go to the server log.
      console.error(
        '[server] Unhandled request error:',
        requestError instanceof Error ? requestError.message : String(requestError),
      );
      sendJson(request, response, 500, { error: 'Internal server error' }, resolvedConfig.allowedOrigins);
    }
  });
}

// Live API uses a WebSocket upgrade, which the HTTP request handler above never
// sees. The host (index.ts) calls attachLiveWsUpgrade on the returned server to
// take over /api/live upgrades.
export { attachLiveWsUpgrade } from './proxy/liveWsProxy.js';
