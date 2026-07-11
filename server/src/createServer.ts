import http from 'node:http';
import type { ApiServerConfig } from './config.js';
import {
  handleLocalClipboardImageRequest,
  LOCAL_CLIPBOARD_IMAGE_PATH,
  type LocalClipboardImage,
  readMacOsClipboardPng,
} from './clipboardImage.js';
import { getCorsHeaders, sendJson } from './cors.js';
import type { GcsFilesAdapter } from './gcsFilesAdapter.js';
import { GEMINI_PROXY_PREFIX, proxyGeminiRequest } from './geminiProxy.js';
import { IMAGE_PROXY_PATH, proxyExternalImage } from './imageProxy.js';
import { createMcpClientBridge } from './mcpClient.js';
import { handleMcpRequest } from './mcpRoutes.js';
import type { McpClientBridge } from './mcpTypes.js';
import type { VertexAccessTokenProvider } from './vertexAuth.js';

export { readMacOsClipboardPng } from './clipboardImage.js';

interface CreateServerDependencies {
  fetchImpl?: typeof fetch;
  readLocalClipboardImage?: () => Promise<LocalClipboardImage | null>;
  vertexAuth?: VertexAccessTokenProvider;
  gcsFilesAdapter?: GcsFilesAdapter;
  mcpClient?: McpClientBridge;
}

type CreateServerConfig = Pick<ApiServerConfig, 'geminiApiBase' | 'geminiApiKey'> &
  Partial<
    Pick<ApiServerConfig, 'allowedOrigins' | 'backendFlavor' | 'vertex' | 'enableMcpStdio' | 'enableMcpPrivateHttp'>
  >;

interface ResolvedServerConfig extends CreateServerConfig {
  allowedOrigins: string[];
  backendFlavor: ApiServerConfig['backendFlavor'];
  enableMcpStdio: boolean;
  enableMcpPrivateHttp: boolean;
}

export function createServer(config: CreateServerConfig, dependencies: CreateServerDependencies = {}): http.Server {
  const resolvedConfig: ResolvedServerConfig = {
    ...config,
    allowedOrigins: config.allowedOrigins ?? [],
    backendFlavor: config.backendFlavor ?? 'aistudio',
    enableMcpStdio: config.enableMcpStdio ?? false,
    enableMcpPrivateHttp: config.enableMcpPrivateHttp ?? false,
  };

  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const readLocalClipboardImage = dependencies.readLocalClipboardImage ?? readMacOsClipboardPng;
  const vertexAuth = dependencies.vertexAuth;
  const gcsFilesAdapter = dependencies.gcsFilesAdapter;
  const mcpClient = dependencies.mcpClient ?? createMcpClientBridge();

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

      if (path === GEMINI_PROXY_PREFIX || path.startsWith(`${GEMINI_PROXY_PREFIX}/`)) {
        await proxyGeminiRequest(request, response, resolvedConfig, { fetchImpl, vertexAuth, gcsFilesAdapter });
        return;
      }

      sendJson(request, response, 404, { error: 'Not found' }, resolvedConfig.allowedOrigins);
    } catch {
      sendJson(request, response, 500, { error: 'Internal server error' }, resolvedConfig.allowedOrigins);
    }
  });
}
