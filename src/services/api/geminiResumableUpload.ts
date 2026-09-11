import type { File as GeminiFile } from '@google/genai';
import { logService } from '@/services/logService';
import { safeJsonParse } from '@/utils/safeJsonParse';

const ABORT_ERROR_MESSAGE = 'Upload cancelled by user.';
const MAX_UPLOAD_CHUNK_SIZE = 8 * 1024 * 1024;
const MAX_UPLOAD_RETRIES_PER_CHUNK = 2;
const UPLOAD_RETRY_BASE_DELAY_MS = 100;
const RETRYABLE_UPLOAD_STATUS_CODES = new Set([408, 429]);

export const createUploadAbortError = () => {
  const abortError = new Error(ABORT_ERROR_MESSAGE);
  abortError.name = 'AbortError';
  return abortError;
};

type HttpResponseLike = {
  headers: Record<string, string>;
  json: () => Promise<unknown>;
};

export type InternalGeminiApiClient = {
  request: (request: {
    path: string;
    body?: string | Blob;
    httpMethod: 'POST';
    httpOptions?: {
      apiVersion?: string;
      baseUrl?: string;
      headers?: Record<string, string>;
    };
    abortSignal?: AbortSignal;
  }) => Promise<HttpResponseLike>;
};

type UploadChunkResponse = {
  headers: Record<string, string>;
  payload: unknown;
};

type UploadGeminiFileResumableOptions = {
  apiClient: InternalGeminiApiClient;
  apiBaseUrl: string;
  proxyBaseUrl: string | null;
  apiKey: string;
  file: File;
  mimeType: string;
  displayName: string;
  signal: AbortSignal;
  onProgress?: (loaded: number, total: number) => void;
};

const normalizeUploadResult = (payload: unknown): GeminiFile => {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Unexpected upload response payload.');
  }

  const typedPayload = payload as { file?: GeminiFile };
  return typedPayload.file ?? (payload as GeminiFile);
};

const parseRawHeaders = (rawHeaders: string): Record<string, string> => {
  const headers: Record<string, string> = {};
  rawHeaders
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .forEach((line) => {
      const separatorIndex = line.indexOf(':');
      if (separatorIndex === -1) return;
      const header = line.slice(0, separatorIndex).trim().toLowerCase();
      const value = line.slice(separatorIndex + 1).trim();
      headers[header] = value;
    });
  return headers;
};

const parseJsonPayload = (value: string): unknown => safeJsonParse(value, null);

const createUploadHttpError = (status: number, responseText: string) => {
  const message = responseText
    ? `Upload chunk failed with HTTP ${status}: ${responseText}`
    : `Upload chunk failed with HTTP ${status}.`;
  const error = new Error(message) as Error & { status?: number };
  error.status = status;
  return error;
};

const isRetryableUploadError = (error: unknown): boolean => {
  if (error instanceof Error && error.name === 'AbortError') return false;
  const status = (error as { status?: number } | null)?.status;
  if (!status) return true;
  // 408 Request Timeout / 429 Too Many Requests / 5xx Server Error are worth retrying.
  return RETRYABLE_UPLOAD_STATUS_CODES.has(status) || status >= 500;
};

const waitForUploadRetry = (attempt: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(createUploadAbortError());
      return;
    }

    const timeoutId = window.setTimeout(
      () => {
        signal.removeEventListener('abort', handleAbort);
        resolve();
      },
      UPLOAD_RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1),
    );

    const handleAbort = () => {
      window.clearTimeout(timeoutId);
      reject(createUploadAbortError());
    };

    signal.addEventListener('abort', handleAbort, { once: true });
  });

const buildProxiedUploadUrl = (uploadUrl: string, proxyBaseUrl: string): string => {
  const originalUploadUrl = new URL(uploadUrl);
  const fallbackOrigin =
    typeof window !== 'undefined'
      ? window.location.origin
      : ((globalThis as { location?: { origin?: string } }).location?.origin ?? originalUploadUrl.origin);
  const proxyUrl = new URL(proxyBaseUrl, fallbackOrigin);
  const proxyPathPrefix = proxyUrl.pathname.replace(/\/+$/, '');

  originalUploadUrl.protocol = proxyUrl.protocol;
  originalUploadUrl.host = proxyUrl.host;
  originalUploadUrl.port = proxyUrl.port;

  if (proxyPathPrefix && proxyPathPrefix !== '/') {
    originalUploadUrl.pathname = `${proxyPathPrefix}/${originalUploadUrl.pathname.replace(/^\/+/, '')}`;
  }

  return originalUploadUrl.toString();
};

const startResumableUploadSession = async (
  apiClient: InternalGeminiApiClient,
  apiBaseUrl: string,
  file: File,
  mimeType: string,
  displayName: string,
  signal: AbortSignal,
): Promise<string> => {
  const response = await apiClient.request({
    path: 'upload/v1beta/files',
    body: JSON.stringify({
      file: {
        displayName,
      },
    }),
    httpMethod: 'POST',
    httpOptions: {
      apiVersion: '',
      baseUrl: apiBaseUrl,
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': `${file.size}`,
        'X-Goog-Upload-Header-Content-Type': mimeType,
      },
    },
    abortSignal: signal,
  });

  const uploadUrl = response.headers['x-goog-upload-url'];
  if (!uploadUrl) {
    throw new Error('Upload session did not return a resumable upload URL.');
  }

  return uploadUrl;
};

const uploadFileBytes = async (
  apiClient: InternalGeminiApiClient,
  uploadUrl: string,
  file: File,
  signal: AbortSignal,
  proxyBaseUrl: string | null,
  apiKey: string,
  onProgress?: (loaded: number, total: number) => void,
): Promise<GeminiFile> => {
  const finalUploadUrl = proxyBaseUrl ? buildProxiedUploadUrl(uploadUrl, proxyBaseUrl) : uploadUrl;

  let offset = 0;

  const uploadChunkWithXhr = async (
    chunk: Blob,
    uploadCommand: string,
    chunkOffset: number,
  ): Promise<UploadChunkResponse> =>
    new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(createUploadAbortError());
        return;
      }

      const xhr = new XMLHttpRequest();
      let settled = false;
      const cleanup = () => {
        signal.removeEventListener('abort', handleAbort);
      };
      const settle = (callback: () => void) => {
        if (settled) return;
        settled = true;
        cleanup();
        callback();
      };
      const handleAbort = () => {
        xhr.abort();
        settle(() => reject(createUploadAbortError()));
      };

      xhr.open('POST', finalUploadUrl);
      xhr.setRequestHeader('X-Goog-Upload-Offset', String(chunkOffset));
      xhr.setRequestHeader('X-Goog-Upload-Command', uploadCommand);
      xhr.setRequestHeader('x-goog-api-key', apiKey);

      xhr.upload.addEventListener('progress', (event) => {
        if (!event.lengthComputable || !onProgress) return;
        const loadedWithinChunk = Math.min(event.loaded, chunk.size);
        onProgress(chunkOffset + loadedWithinChunk, file.size);
      });

      xhr.onload = () => {
        settle(() => {
          if (signal.aborted) {
            reject(createUploadAbortError());
            return;
          }

          if (xhr.status < 200 || xhr.status >= 300) {
            reject(createUploadHttpError(xhr.status, xhr.responseText));
            return;
          }

          resolve({
            headers: parseRawHeaders(xhr.getAllResponseHeaders()),
            payload: parseJsonPayload(xhr.responseText),
          });
        });
      };
      xhr.onerror = () => settle(() => reject(new Error('Network error during file upload.')));
      xhr.onabort = () => settle(() => reject(createUploadAbortError()));
      signal.addEventListener('abort', handleAbort, { once: true });
      xhr.send(chunk);
    });

  const uploadChunkWithClient = async (
    chunk: Blob,
    uploadCommand: string,
    chunkOffset: number,
  ): Promise<UploadChunkResponse> => {
    const response = await apiClient.request({
      path: '',
      body: chunk,
      httpMethod: 'POST',
      httpOptions: {
        apiVersion: '',
        baseUrl: finalUploadUrl,
        headers: {
          'X-Goog-Upload-Offset': String(chunkOffset),
          'X-Goog-Upload-Command': uploadCommand,
          'Content-Length': String(chunk.size),
        },
      },
      abortSignal: signal,
    });

    return {
      headers: response.headers,
      payload: await response.json().catch(() => null),
    };
  };

  const uploadChunk = async (chunk: Blob, uploadCommand: string, chunkOffset: number): Promise<UploadChunkResponse> => {
    if (typeof XMLHttpRequest !== 'undefined') {
      return uploadChunkWithXhr(chunk, uploadCommand, chunkOffset);
    }

    return uploadChunkWithClient(chunk, uploadCommand, chunkOffset);
  };

  if (file.size === 0) {
    throw new Error('Cannot upload an empty file (size is 0 bytes).');
  }

  while (offset < file.size) {
    const chunkSize = Math.min(MAX_UPLOAD_CHUNK_SIZE, file.size - offset);
    const chunk = file.slice(offset, offset + chunkSize);
    const uploadCommand = offset + chunkSize >= file.size ? 'upload, finalize' : 'upload';

    let retryAttempt = 0;
    while (true) {
      if (signal.aborted) {
        throw createUploadAbortError();
      }

      try {
        const response = await uploadChunk(chunk, uploadCommand, offset);
        const uploadStatus = response.headers['x-goog-upload-status'] ?? null;
        offset += chunkSize;

        if (onProgress) {
          onProgress(offset, file.size);
        }

        if (uploadStatus !== 'active') {
          return normalizeUploadResult(response.payload);
        }

        break;
      } catch (error) {
        if (retryAttempt >= MAX_UPLOAD_RETRIES_PER_CHUNK || !isRetryableUploadError(error)) {
          throw error;
        }

        retryAttempt += 1;
        logService.warn(`Retrying file upload chunk at offset ${offset}.`, {
          attempt: retryAttempt,
          fileName: file.name,
          error,
        });
        await waitForUploadRetry(retryAttempt, signal);
      }
    }
  }

  throw new Error('All content has been uploaded, but the upload status is not finalized.');
};

export const uploadGeminiFileResumable = async ({
  apiClient,
  apiBaseUrl,
  proxyBaseUrl,
  apiKey,
  file,
  mimeType,
  displayName,
  signal,
  onProgress,
}: UploadGeminiFileResumableOptions): Promise<GeminiFile> => {
  const uploadUrl = await startResumableUploadSession(apiClient, apiBaseUrl, file, mimeType, displayName, signal);
  return uploadFileBytes(apiClient, uploadUrl, file, signal, proxyBaseUrl, apiKey, onProgress);
};
