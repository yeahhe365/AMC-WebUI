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
import { GEMINI_PROXY_PREFIX, proxyGeminiRequest, type GeminiProxyConfig } from './geminiProxy.js';
import { IMAGE_PROXY_PATH, proxyExternalImage } from './imageProxy.js';
import { createMcpClientBridge } from './mcpClient.js';
import { handleMcpRequest } from './mcpRoutes.js';
import type { McpClientBridge } from './mcpTypes.js';
import { handleEphemeralTokenRequest, EPHEMERAL_TOKEN_PATH, LEGACY_AUTH_TOKENS_PATH } from './ephemeralToken.js';
import { abortJob, readJobSecret } from './streamJobs.js';
import { STREAM_ABORT_PREFIX, UNIFIED_STREAM_ABORT_PREFIX } from './streamJobsRoutes.js';
import { OPENAI_PROXY_PREFIX, proxyThirdPartyRequest, type ThirdPartyProxyConfig } from './thirdPartyProxy.js';

export { readMacOsClipboardPng } from './clipboardImage.js';

interface CreateServerDependencies {
  fetchImpl?: typeof fetch;
  readLocalClipboardImage?: () => Promise<LocalClipboardImage | null>;
  mcpClient?: McpClientBridge;
}

type CreateServerConfig = Pick<ApiServerConfig, 'geminiApiBase' | 'geminiApiKey'> &
  Partial<
    Pick<
      ApiServerConfig,
      | 'allowedOrigins'
      | 'enableMcpStdio'
      | 'enableMcpPrivateHttp'
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
      | 'enableLiveWsProxy'
      | 'liveWsIdleTimeoutMs'
      | 'liveWsUpstreamBase'
      | 'serverKeyPriority'
      | 'thirdPartyRoutes'
    >,
    GeminiProxyConfig,
    ThirdPartyProxyConfig {
  allowedOrigins: string[];
  enableMcpStdio: boolean;
  enableMcpPrivateHttp: boolean;
  enableLiveWsProxy: boolean;
  liveWsIdleTimeoutMs: number;
  liveWsUpstreamBase?: string;
  serverKeyPriority: boolean;
  thirdPartyRoutes: Record<string, ThirdPartyProxyRoute>;
}

export function createServer(config: CreateServerConfig, dependencies: CreateServerDependencies = {}): http.Server {
  const resolvedConfig: ResolvedServerConfig = {
    ...config,
    allowedOrigins: config.allowedOrigins ?? [],
    enableMcpStdio: config.enableMcpStdio ?? false,
    enableMcpPrivateHttp: config.enableMcpPrivateHttp ?? false,
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

      if (method === 'GET' && path === '/health') {
        sendJson(
          request,
          response,
          200,
          {
            status: 'ok',
            timestamp: new Date().toISOString(),
            uptimeSeconds: Math.floor(process.uptime()),
            capabilities: {
              liveWsProxy: resolvedConfig.enableLiveWsProxy,
              thirdPartyProxy: Object.keys(resolvedConfig.thirdPartyRoutes).length > 0,
              mcpStdio: resolvedConfig.enableMcpStdio,
              mcpPrivateHttp: resolvedConfig.enableMcpPrivateHttp,
            },
          },
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

      if (path === EPHEMERAL_TOKEN_PATH || path === LEGACY_AUTH_TOKENS_PATH) {
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
    } catch (error) {
      // The 500 body stays generic; the diagnostics only go to the server log.
      console.error('[server] Unhandled request error:', error instanceof Error ? error.message : String(error));
      sendJson(request, response, 500, { error: 'Internal server error' }, resolvedConfig.allowedOrigins);
    }
  });
}

// Live API uses a WebSocket upgrade, which the HTTP request handler above never
// sees. The host (index.ts) calls attachLiveWsUpgrade on the returned server to
// take over /api/live upgrades.
export { attachLiveWsUpgrade } from './liveWsProxy.js';
