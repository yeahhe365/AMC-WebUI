import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import type { ApiServerConfig } from './config.js';
import type { GcsFilesAdapter } from './gcsFilesAdapter.js';
import { getCorsHeaders, sendJson } from './cors.js';
import type { VertexAccessTokenProvider } from './vertexAuth.js';
import { rewriteToVertex } from './vertexPathRewriter.js';

export const GEMINI_PROXY_PREFIX = '/api/gemini';

const MAX_REWRITE_BODY_BYTES = 50 * 1024 * 1024;
const MAX_INITIATE_BODY_BYTES = 64 * 1024;
const GCS_UPLOAD_INITIATE_PATH = '/upload/v1beta/files';
const GCS_UPLOAD_CHUNK_PATTERN = /^\/__gcs-upload-chunk__\/([\w-]+)$/;
const GCS_FILE_METADATA_PATTERN = /^\/v\d+(?:beta\d*|alpha\d*)?\/files\/([\w-]+)$/;

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);
const STRIPPED_PROXY_REQUEST_HEADERS = new Set([
  ...HOP_BY_HOP_HEADERS,
  'accept-encoding',
  'authorization',
  'content-length',
  'cookie',
  'host',
]);
const STRIPPED_PROXY_RESPONSE_HEADERS = new Set([...HOP_BY_HOP_HEADERS, 'content-encoding', 'content-length']);

type GeminiProxyConfig = Pick<ApiServerConfig, 'geminiApiBase' | 'geminiApiKey' | 'backendFlavor' | 'vertex'> & {
  allowedOrigins: string[];
};

interface GeminiProxyDependencies {
  fetchImpl: typeof fetch;
  vertexAuth?: VertexAccessTokenProvider;
  gcsFilesAdapter?: GcsFilesAdapter;
}

type ProxyAuth = { kind: 'apiKey'; apiKey: string } | { kind: 'bearer'; accessToken: string };

class RequestBodyTooLargeError extends Error {
  constructor(limit: number) {
    super(`Request body exceeds ${limit} bytes.`);
    this.name = 'RequestBodyTooLargeError';
  }
}

interface InitiateUploadMetadata {
  displayName: string;
  mimeType: string;
  sizeBytes: number;
}

function getConnectionManagedHeaders(value: string | null | undefined): Set<string> {
  if (!value) {
    return new Set();
  }

  return new Set(
    value
      .split(',')
      .map((headerName) => headerName.trim().toLowerCase())
      .filter((headerName) => headerName.length > 0),
  );
}

function resolveRequestApiKey(request: IncomingMessage, serverApiKey?: string): string {
  const trimmedServerApiKey = serverApiKey?.trim();
  if (trimmedServerApiKey) {
    return trimmedServerApiKey;
  }

  const browserApiKey = request.headers['x-goog-api-key'];
  if (Array.isArray(browserApiKey)) {
    return browserApiKey[0]?.trim() ?? '';
  }

  return browserApiKey?.trim() ?? '';
}

function buildProxyHeaders(request: IncomingMessage, auth: ProxyAuth): Headers {
  const headers = new Headers();
  const connectionManagedHeaders = getConnectionManagedHeaders(
    Array.isArray(request.headers.connection) ? request.headers.connection.join(',') : request.headers.connection,
  );

  for (const [name, value] of Object.entries(request.headers)) {
    if (typeof value === 'undefined') {
      continue;
    }

    const normalizedName = name.toLowerCase();
    if (STRIPPED_PROXY_REQUEST_HEADERS.has(normalizedName) || connectionManagedHeaders.has(normalizedName)) {
      continue;
    }

    if (Array.isArray(value)) {
      headers.set(normalizedName, value.join(','));
      continue;
    }

    headers.set(normalizedName, value);
  }

  if (auth.kind === 'apiKey') {
    headers.set('x-goog-api-key', auth.apiKey);
  } else {
    headers.delete('x-goog-api-key');
    headers.set('authorization', `Bearer ${auth.accessToken}`);
  }

  return headers;
}

function buildProxyResponseHeaders(
  request: IncomingMessage,
  upstreamResponse: Response,
  allowedOrigins: string[],
): Record<string, string> {
  const responseHeaders: Record<string, string> = {};
  const connectionManagedHeaders = getConnectionManagedHeaders(upstreamResponse.headers.get('connection'));

  upstreamResponse.headers.forEach((value, key) => {
    const normalizedName = key.toLowerCase();
    if (STRIPPED_PROXY_RESPONSE_HEADERS.has(normalizedName) || connectionManagedHeaders.has(normalizedName)) {
      return;
    }

    responseHeaders[normalizedName] = value;
  });

  Object.assign(responseHeaders, getCorsHeaders(request, allowedOrigins));
  return responseHeaders;
}

async function readBufferedBody(request: IncomingMessage, maxBytes: number): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let received = 0;
    let aborted = false;

    const onData = (chunk: Buffer) => {
      if (aborted) {
        return;
      }

      received += chunk.byteLength;
      if (received > maxBytes) {
        aborted = true;
        request.off('data', onData);
        request.off('end', onEnd);
        request.off('error', onError);
        reject(new RequestBodyTooLargeError(maxBytes));
        return;
      }

      chunks.push(chunk);
    };

    const onEnd = () => {
      if (!aborted) {
        resolve(Buffer.concat(chunks));
      }
    };

    const onError = (error: unknown) => {
      if (!aborted) {
        aborted = true;
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    };

    request.on('data', onData);
    request.on('end', onEnd);
    request.on('error', onError);
  });
}

function stripVertexUnsupportedToolConfig(body: Buffer): Buffer {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body.toString('utf8'));
  } catch {
    return body;
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return body;
  }

  const root = parsed as Record<string, unknown>;
  const toolConfig = root.toolConfig;
  if (!toolConfig || typeof toolConfig !== 'object' || Array.isArray(toolConfig)) {
    return body;
  }

  const sanitizedToolConfig = { ...(toolConfig as Record<string, unknown>) };
  if (!Object.prototype.hasOwnProperty.call(sanitizedToolConfig, 'includeServerSideToolInvocations')) {
    return body;
  }

  delete sanitizedToolConfig.includeServerSideToolInvocations;
  if (Object.keys(sanitizedToolConfig).length > 0) {
    root.toolConfig = sanitizedToolConfig;
  } else {
    delete root.toolConfig;
  }

  return Buffer.from(JSON.stringify(root), 'utf8');
}

function isYouTubeUri(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false;
  }

  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return (
      hostname === 'youtu.be' ||
      hostname === 'youtube.com' ||
      hostname.endsWith('.youtube.com') ||
      hostname === 'youtube-nocookie.com' ||
      hostname.endsWith('.youtube-nocookie.com')
    );
  } catch {
    return false;
  }
}

const sanitizeVertexRequestValue = (value: unknown): boolean => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  if (Array.isArray(value)) {
    return value.reduce<boolean>((changed, item) => sanitizeVertexRequestValue(item) || changed, false);
  }

  const record = value as Record<string, unknown>;
  let changed = false;
  const functionResponse = record.functionResponse;

  if (functionResponse && typeof functionResponse === 'object' && !Array.isArray(functionResponse)) {
    const responseRecord = functionResponse as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(responseRecord, 'id')) {
      delete responseRecord.id;
      changed = true;
    }
  }

  const fileData = record.fileData;
  if (fileData && typeof fileData === 'object' && !Array.isArray(fileData)) {
    const fileDataRecord = fileData as Record<string, unknown>;
    if (!fileDataRecord.mimeType && isYouTubeUri(fileDataRecord.fileUri)) {
      fileDataRecord.mimeType = 'video/mp4';
      changed = true;
    }
  }

  for (const child of Object.values(record)) {
    changed = sanitizeVertexRequestValue(child) || changed;
  }

  return changed;
};

function rewriteVertexRequestBody(body: Buffer, gcsFilesAdapter: GcsFilesAdapter | undefined): Buffer {
  const toolConfigSanitizedBody = stripVertexUnsupportedToolConfig(body);

  let parsed: unknown;
  try {
    parsed = JSON.parse(toolConfigSanitizedBody.toString('utf8'));
  } catch {
    return gcsFilesAdapter
      ? gcsFilesAdapter.rewriteFileUriInJsonBody(toolConfigSanitizedBody)
      : toolConfigSanitizedBody;
  }

  const vertexSanitizedBody = sanitizeVertexRequestValue(parsed)
    ? Buffer.from(JSON.stringify(parsed), 'utf8')
    : toolConfigSanitizedBody;

  return gcsFilesAdapter ? gcsFilesAdapter.rewriteFileUriInJsonBody(vertexSanitizedBody) : vertexSanitizedBody;
}

function parseInitiateUploadMetadata(
  body: Buffer,
  fallbackMetadata: { mimeType?: string; sizeBytes?: string } = {},
): InitiateUploadMetadata | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body.toString('utf8'));
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  const fileWrapper = (parsed as { file?: unknown }).file;
  const fileRecord = (typeof fileWrapper === 'object' && fileWrapper !== null ? fileWrapper : parsed) as {
    displayName?: unknown;
    display_name?: unknown;
    mimeType?: unknown;
    mime_type?: unknown;
    sizeBytes?: unknown;
    size_bytes?: unknown;
  };

  const displayName = typeof fileRecord.displayName === 'string' ? fileRecord.displayName : fileRecord.display_name;
  const mimeType =
    typeof fileRecord.mimeType === 'string'
      ? fileRecord.mimeType
      : typeof fileRecord.mime_type === 'string'
        ? fileRecord.mime_type
        : fallbackMetadata.mimeType;
  const rawSize =
    typeof fileRecord.sizeBytes !== 'undefined'
      ? fileRecord.sizeBytes
      : typeof fileRecord.size_bytes !== 'undefined'
        ? fileRecord.size_bytes
        : fallbackMetadata.sizeBytes;
  const sizeBytes =
    typeof rawSize === 'number' ? rawSize : Number.parseInt(typeof rawSize === 'string' ? rawSize : '', 10);

  if (typeof displayName !== 'string' || typeof mimeType !== 'string' || !Number.isFinite(sizeBytes)) {
    return null;
  }

  return { displayName, mimeType, sizeBytes };
}

function readHeader(request: IncomingMessage, name: string): string | undefined {
  const value = request.headers[name.toLowerCase()];
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

async function handleGcsFilesRequest(
  request: IncomingMessage,
  response: ServerResponse,
  upstreamPath: string,
  adapter: GcsFilesAdapter,
  allowedOrigins: string[],
): Promise<boolean> {
  const method = request.method || 'GET';
  const corsHeaders = getCorsHeaders(request, allowedOrigins);
  const uploadCorsHeaders = {
    ...corsHeaders,
    'access-control-expose-headers': 'x-goog-upload-url, x-goog-upload-status',
  };

  if (
    method === 'POST' &&
    (upstreamPath === GCS_UPLOAD_INITIATE_PATH || upstreamPath === `${GCS_UPLOAD_INITIATE_PATH}/`)
  ) {
    let bodyBuffer: Buffer;
    try {
      bodyBuffer = await readBufferedBody(request, MAX_INITIATE_BODY_BYTES);
    } catch (error) {
      const status = error instanceof RequestBodyTooLargeError ? 413 : 400;
      sendJson(request, response, status, { error: 'Failed to read initiate body.' }, allowedOrigins);
      return true;
    }

    const metadata = parseInitiateUploadMetadata(bodyBuffer, {
      mimeType: readHeader(request, 'x-goog-upload-header-content-type'),
      sizeBytes: readHeader(request, 'x-goog-upload-header-content-length'),
    });
    if (!metadata) {
      sendJson(request, response, 400, { error: 'Invalid file metadata in upload initiate request.' }, allowedOrigins);
      return true;
    }

    let initiated: ReturnType<GcsFilesAdapter['initiateUpload']>;
    try {
      initiated = adapter.initiateUpload(metadata);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown initiate error';
      sendJson(request, response, 413, { error: message }, allowedOrigins);
      return true;
    }

    response.writeHead(200, {
      ...uploadCorsHeaders,
      'x-goog-upload-url': initiated.uploadUrl,
      'x-goog-upload-status': 'active',
      'content-type': 'application/json; charset=utf-8',
    });
    response.end('{}');
    return true;
  }

  const chunkMatch = GCS_UPLOAD_CHUNK_PATTERN.exec(upstreamPath);
  if (method === 'POST' && chunkMatch) {
    const sessionId = chunkMatch[1];
    const offsetHeader = readHeader(request, 'x-goog-upload-offset');
    const commandHeader = readHeader(request, 'x-goog-upload-command');
    const offset = Number.parseInt(offsetHeader ?? '', 10);
    if (!Number.isFinite(offset) || offset < 0 || !commandHeader) {
      sendJson(request, response, 400, { error: 'Missing or invalid upload offset/command headers.' }, allowedOrigins);
      return true;
    }

    let chunk: Buffer;
    try {
      chunk = await readBufferedBody(request, MAX_REWRITE_BODY_BYTES);
    } catch (error) {
      const status = error instanceof RequestBodyTooLargeError ? 413 : 400;
      sendJson(request, response, status, { error: 'Upload chunk exceeded size limit.' }, allowedOrigins);
      return true;
    }

    let result: Awaited<ReturnType<GcsFilesAdapter['uploadChunk']>>;
    try {
      result = await adapter.uploadChunk({ sessionId, offset, command: commandHeader, chunk });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown chunk upload error';
      sendJson(request, response, 400, { error: message }, allowedOrigins);
      return true;
    }

    if (result.file) {
      response.writeHead(200, {
        ...uploadCorsHeaders,
        'x-goog-upload-status': 'final',
        'content-type': 'application/json; charset=utf-8',
      });
      response.end(JSON.stringify({ file: result.file }));
      return true;
    }

    response.writeHead(200, { ...uploadCorsHeaders, 'x-goog-upload-status': 'active' });
    response.end();
    return true;
  }

  const getMatch = GCS_FILE_METADATA_PATTERN.exec(upstreamPath);
  if (method === 'GET' && getMatch) {
    const fileId = getMatch[1];
    const metadata = await adapter.getFileMetadata(fileId);
    if (!metadata) {
      sendJson(request, response, 404, { error: 'File not found.' }, allowedOrigins);
      return true;
    }
    sendJson(request, response, 200, metadata as unknown as Record<string, unknown>, allowedOrigins);
    return true;
  }

  return false;
}

export async function proxyGeminiRequest(
  request: IncomingMessage,
  response: ServerResponse,
  config: GeminiProxyConfig,
  dependencies: GeminiProxyDependencies,
): Promise<void> {
  const { fetchImpl, vertexAuth, gcsFilesAdapter } = dependencies;
  const requestUrl = new URL(request.url || '/', 'http://localhost');
  const upstreamPath = requestUrl.pathname.slice(GEMINI_PROXY_PREFIX.length) || '/';

  if (config.backendFlavor === 'vertex') {
    const looksLikeFilesRoute =
      upstreamPath === GCS_UPLOAD_INITIATE_PATH ||
      upstreamPath === `${GCS_UPLOAD_INITIATE_PATH}/` ||
      GCS_UPLOAD_CHUNK_PATTERN.test(upstreamPath) ||
      GCS_FILE_METADATA_PATTERN.test(upstreamPath);

    if (looksLikeFilesRoute) {
      if (!gcsFilesAdapter) {
        sendJson(
          request,
          response,
          503,
          { error: 'GCS Files adapter is not configured; set GCS_BUCKET to enable Files API in vertex mode.' },
          config.allowedOrigins,
        );
        return;
      }

      const handled = await handleGcsFilesRequest(
        request,
        response,
        upstreamPath,
        gcsFilesAdapter,
        config.allowedOrigins,
      );
      if (handled) {
        return;
      }
    }
  }

  let upstreamUrl: string;
  let auth: ProxyAuth;
  let isModelInvocation = false;

  if (config.backendFlavor === 'vertex') {
    if (!config.vertex) {
      sendJson(request, response, 500, { error: 'Vertex backend config is missing.' }, config.allowedOrigins);
      return;
    }
    if (!vertexAuth) {
      sendJson(request, response, 500, { error: 'Vertex auth provider is not configured.' }, config.allowedOrigins);
      return;
    }

    let accessToken: string;
    try {
      accessToken = await vertexAuth.getAccessToken();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown auth error';
      sendJson(
        request,
        response,
        500,
        { error: `Vertex access token retrieval failed: ${message}` },
        config.allowedOrigins,
      );
      return;
    }

    const rewritten = rewriteToVertex(upstreamPath, requestUrl.search, config.vertex);
    upstreamUrl = rewritten.url;
    isModelInvocation = rewritten.isModelInvocation;
    auth = { kind: 'bearer', accessToken };
  } else {
    const apiKeyForProxy = resolveRequestApiKey(request, config.geminiApiKey);
    if (!apiKeyForProxy) {
      sendJson(request, response, 500, { error: 'GEMINI_API_KEY is not configured.' }, config.allowedOrigins);
      return;
    }

    const targetBase = config.geminiApiBase.replace(/\/$/, '');
    upstreamUrl = `${targetBase}${upstreamPath}${requestUrl.search}`;
    auth = { kind: 'apiKey', apiKey: apiKeyForProxy };
  }

  const method = request.method || 'GET';
  const hasBody = !['GET', 'HEAD'].includes(method);
  const abortController = new AbortController();
  const abortUpstream = () => {
    if (!abortController.signal.aborted) {
      abortController.abort();
    }
  };

  const requestInit: RequestInit & { duplex?: 'half' } = {
    method,
    headers: buildProxyHeaders(request, auth),
    signal: abortController.signal,
    // redirect: 'manual' so a public GEMINI_API_BASE cannot 302 into a private network host
    // after the input URL passed validation.
    redirect: 'manual',
  };

  const shouldRewriteBody = hasBody && config.backendFlavor === 'vertex' && isModelInvocation;

  if (shouldRewriteBody) {
    let bodyBuffer: Buffer;
    try {
      bodyBuffer = await readBufferedBody(request, MAX_REWRITE_BODY_BYTES);
    } catch (error) {
      if (error instanceof RequestBodyTooLargeError) {
        sendJson(
          request,
          response,
          413,
          { error: `Request body exceeds ${MAX_REWRITE_BODY_BYTES} bytes; cannot rewrite file URIs.` },
          config.allowedOrigins,
        );
        return;
      }
      const message = error instanceof Error ? error.message : 'Failed to read request body.';
      sendJson(request, response, 400, { error: message }, config.allowedOrigins);
      return;
    }

    const rewrittenBody = rewriteVertexRequestBody(bodyBuffer, gcsFilesAdapter);
    const rewrittenBodyView = new Uint8Array(rewrittenBody.buffer, rewrittenBody.byteOffset, rewrittenBody.byteLength);
    requestInit.body = rewrittenBodyView as unknown as BodyInit;
    requestInit.headers = new Headers(requestInit.headers);
    (requestInit.headers as Headers).set('content-length', String(rewrittenBody.byteLength));
  } else if (hasBody) {
    requestInit.body = request as unknown as BodyInit;
    requestInit.duplex = 'half';
  }

  request.once('aborted', abortUpstream);
  response.once('close', abortUpstream);

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetchImpl(upstreamUrl, requestInit);
  } catch (error) {
    request.off('aborted', abortUpstream);
    response.off('close', abortUpstream);
    if (abortController.signal.aborted) {
      if (!response.destroyed) {
        response.destroy();
      }
      return;
    }

    console.error('[gemini] upstream request failed:', error);
    sendJson(request, response, 502, { error: 'Gemini upstream request failed.' }, config.allowedOrigins);
    return;
  }

  // Block redirects: Gemini's API does not legitimately redirect, and a 3xx here would mean
  // we did not follow it (good) but the upstream attempted to point us elsewhere.
  if (upstreamResponse.status >= 300 && upstreamResponse.status < 400) {
    request.off('aborted', abortUpstream);
    response.off('close', abortUpstream);
    console.error('[gemini] upstream returned redirect:', upstreamResponse.status);
    sendJson(
      request,
      response,
      502,
      { error: 'Gemini upstream returned an unexpected redirect.' },
      config.allowedOrigins,
    );
    return;
  }

  response.writeHead(
    upstreamResponse.status,
    buildProxyResponseHeaders(request, upstreamResponse, config.allowedOrigins),
  );

  if (!upstreamResponse.body) {
    request.off('aborted', abortUpstream);
    response.off('close', abortUpstream);
    response.end();
    return;
  }

  try {
    await pipeline(Readable.fromWeb(upstreamResponse.body as unknown as NodeReadableStream), response);
  } catch (error) {
    if (!abortController.signal.aborted && !response.destroyed) {
      response.destroy(error instanceof Error ? error : undefined);
    }
  } finally {
    request.off('aborted', abortUpstream);
    response.off('close', abortUpstream);
  }
}
