import { Buffer } from 'node:buffer';
import type { IncomingHttpHeaders } from 'node:http';
import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { proxyExternalImage, IMAGE_PROXY_PATH } from '../server/src/proxy/imageProxy';
import {
  handleLocalClipboardImageRequest,
  LOCAL_CLIPBOARD_IMAGE_PATH,
  readMacOsClipboardPng,
} from '../server/src/clipboardImage';
import { handleEphemeralTokenRequest, EPHEMERAL_TOKEN_PATH } from '../server/src/security/ephemeralToken';
import { loadConfig } from '../server/src/config';
import { readBoundedResponseBody } from '../shared/imageProxyFetch';

const MCP_API_PREFIX = '/api/mcp';
const DEFAULT_MCP_API_BASE_URL = 'http://127.0.0.1:3001';
class DevBodyTooLarge extends Error {}

type DevServerRequest = {
  method?: string;
  url?: string;
  headers?: IncomingHttpHeaders;
  [Symbol.asyncIterator]?: () => AsyncIterator<Buffer | string | Uint8Array>;
};
type DevServerResponse = {
  writeHead: (status: number, headers: Record<string, string>) => void;
  end: (body?: string | Uint8Array) => void;
};

const writeImageProxyJson = (
  response: { writeHead: (status: number, headers: Record<string, string>) => void; end: (body?: string) => void },
  statusCode: number,
  body: Record<string, unknown>,
) => {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
};

const getMcpApiBaseUrl = (): string => process.env.MCP_API_BASE_URL?.trim() || DEFAULT_MCP_API_BASE_URL;

const isMcpApiPath = (pathname: string): boolean =>
  pathname === MCP_API_PREFIX || pathname.startsWith(`${MCP_API_PREFIX}/`);

const createForwardHeaders = (headers: IncomingHttpHeaders | undefined): Headers => {
  const forwardedHeaders = new Headers();

  for (const [name, value] of Object.entries(headers ?? {})) {
    if (typeof value === 'string') {
      forwardedHeaders.set(name, value);
    } else if (Array.isArray(value)) {
      forwardedHeaders.set(name, value.join(', '));
    }
  }

  forwardedHeaders.delete('connection');
  forwardedHeaders.delete('host');
  return forwardedHeaders;
};

const readRequestBody = async (request: DevServerRequest): Promise<Blob | undefined> => {
  if (!request[Symbol.asyncIterator]) {
    return undefined;
  }

  const MAX_DEV_BODY_BYTES = 1024 * 1024;
  const chunks: BlobPart[] = [];
  let totalBytes = 0;
  for await (const chunk of request as AsyncIterable<Buffer | string | Uint8Array>) {
    const blobPart = typeof chunk === 'string' ? chunk : new Uint8Array(chunk);
    totalBytes += typeof blobPart === 'string' ? Buffer.byteLength(blobPart) : blobPart.byteLength;
    if (totalBytes > MAX_DEV_BODY_BYTES) {
      throw new DevBodyTooLarge('MCP request body exceeds 1 MiB.');
    }
    chunks.push(blobPart);
  }

  if (totalBytes === 0) {
    return undefined;
  }

  return new Blob(chunks);
};

const writeMcpProxyJson = (response: DevServerResponse, statusCode: number, body: Record<string, unknown>) => {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
};

const proxyMcpApiRequest = async (
  request: DevServerRequest,
  response: DevServerResponse,
  requestUrl: URL,
): Promise<void> => {
  const method = request.method ?? 'GET';
  const upstreamUrl = new URL(`${requestUrl.pathname}${requestUrl.search}`, getMcpApiBaseUrl());
  let upstreamResponse: Response;

  try {
    upstreamResponse = await fetch(upstreamUrl.toString(), {
      method,
      signal: AbortSignal.timeout(90_000),
      headers: createForwardHeaders(request.headers),
      body: method === 'GET' || method === 'HEAD' ? undefined : await readRequestBody(request),
    });
  } catch (error) {
    if (error instanceof DevBodyTooLarge) {
      writeMcpProxyJson(response, 413, { error: error.message });
      return;
    }
    const message = error instanceof Error ? error.message : 'Unknown upstream error';
    writeMcpProxyJson(response, 502, { error: `MCP API proxy request failed: ${message}` });
    return;
  }

  const responseHeaders: Record<string, string> = {};
  upstreamResponse.headers.forEach((value, name) => {
    responseHeaders[name] = value;
  });

  const body = await readBoundedResponseBody(upstreamResponse, 8 * 1024 * 1024);
  if (!body) {
    writeMcpProxyJson(response, 502, { error: 'MCP response exceeds 8 MiB or could not be read.' });
    return;
  }
  response.writeHead(upstreamResponse.status, responseHeaders);
  response.end(method === 'HEAD' ? undefined : body);
};

const handleLocalApiRequest = (request: DevServerRequest, response: DevServerResponse, next: () => void) => {
  const requestUrl = new URL(request.url || '/', 'http://localhost');

  if (requestUrl.pathname === IMAGE_PROXY_PATH) {
    void proxyExternalImage(request as IncomingMessage, response as ServerResponse, requestUrl, [], fetch).catch(
      (error) => {
        const message = error instanceof Error ? error.message : 'Unknown image proxy error';
        writeImageProxyJson(response, 500, { error: message });
      },
    );
    return;
  }

  if (requestUrl.pathname === LOCAL_CLIPBOARD_IMAGE_PATH) {
    void handleLocalClipboardImageRequest(
      request as IncomingMessage,
      response as ServerResponse,
      [],
      readMacOsClipboardPng,
    ).catch((error) => {
      const message = error instanceof Error ? error.message : 'Unknown local clipboard image error';
      writeImageProxyJson(response, 500, { error: message });
    });
    return;
  }

  if (isMcpApiPath(requestUrl.pathname)) {
    void proxyMcpApiRequest(request, response, requestUrl).catch((error) => {
      const message = error instanceof Error ? error.message : 'Unknown MCP API proxy error';
      writeMcpProxyJson(response, 500, { error: message });
    });
    return;
  }

  if (requestUrl.pathname === EPHEMERAL_TOKEN_PATH) {
    void handleEphemeralTokenRequest(request as IncomingMessage, response as ServerResponse, loadConfig(), fetch).catch(
      (error) =>
        writeImageProxyJson(response, 500, {
          error: error instanceof Error ? error.message : 'Token request failed',
        }),
    );
    return;
  }

  next();
};

export const createLocalApiPlugin = (): Plugin => ({
  name: 'amc-local-api',
  configureServer(server) {
    server.middlewares.use(handleLocalApiRequest);
  },
  configurePreviewServer(server) {
    server.middlewares.use(handleLocalApiRequest);
  },
});
