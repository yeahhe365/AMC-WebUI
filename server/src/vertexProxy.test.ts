// @vitest-environment node
import { Buffer } from 'node:buffer';
import { Writable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHttpServerCleanup, startHttpServer } from '../test/httpServer';
import { createServer } from './createServer';
import { createGcsFilesAdapter, type StorageLike } from './gcsFilesAdapter';

function createInMemoryAdapter() {
  const files = new Map<string, { data: Buffer; contentType: string; metadata: Record<string, string> }>();
  const storage: StorageLike = {
    bucket: (bucketName: string) => ({
      file: (path: string) => {
        const key = `${bucketName}/${path}`;
        return {
          save: async (data: Buffer, options) => {
            files.set(key, {
              data,
              contentType: options.metadata?.contentType ?? options.contentType ?? 'application/octet-stream',
              metadata: options.metadata?.metadata ?? {},
            });
          },
          createWriteStream: (options) => {
            const chunks: Buffer[] = [];
            return new Writable({
              write: (chunk, _encoding, callback) => {
                chunks.push(Buffer.from(chunk));
                callback();
              },
              final: (callback) => {
                files.set(key, {
                  data: Buffer.concat(chunks),
                  contentType: options.metadata?.contentType ?? options.contentType ?? 'application/octet-stream',
                  metadata: options.metadata?.metadata ?? {},
                });
                callback();
              },
            });
          },
          getMetadata: async () => {
            const file = files.get(key);
            if (!file) {
              throw new Error('not found');
            }
            return [
              {
                size: file.data.byteLength,
                contentType: file.contentType,
                metadata: file.metadata,
                timeCreated: '2026-05-18T00:00:00.000Z',
                updated: '2026-05-18T00:00:00.000Z',
              },
            ];
          },
          exists: async () => [files.has(key)],
        };
      },
    }),
  };

  return createGcsFilesAdapter({
    storage,
    config: { bucketName: 'test-bucket', objectPrefix: 'amc-files/', maxFileBytes: 1024 * 1024 },
    randomId: () => 'test-id',
    now: () => new Date('2026-05-18T12:00:00.000Z'),
  });
}

const serverCleanup = createHttpServerCleanup();

afterEach(serverCleanup.cleanup);

const vertexConfig = {
  geminiApiBase: 'https://generativelanguage.googleapis.com',
  backendFlavor: 'vertex' as const,
  vertex: { projectId: 'my-proj', location: 'us-central1' },
};

describe('Vertex Gemini proxy', () => {
  it('rewrites model requests and replaces API-key auth with a bearer token', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      return new Response('vertex-ok', { status: 200 });
    });
    const vertexAuth = { getAccessToken: vi.fn(async () => 'access-token-123') };
    const app = createServer(vertexConfig, { fetchImpl, vertexAuth });
    const started = serverCleanup.track(await startHttpServer(app));

    const response = await fetch(
      `${started.baseUrl}/api/gemini/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': 'browser-key' },
        body: JSON.stringify({ contents: [] }),
      },
    );

    expect(response.status).toBe(200);
    expect(vertexAuth.getAccessToken).toHaveBeenCalledTimes(1);

    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe(
      'https://us-central1-aiplatform.googleapis.com/v1/projects/my-proj/locations/us-central1/publishers/google/models/gemini-2.5-flash:streamGenerateContent?alt=sse',
    );
    expect(init?.headers).toBeInstanceOf(Headers);
    const headers = init?.headers as Headers;
    expect(headers.get('authorization')).toBe('Bearer access-token-123');
    expect(headers.get('x-goog-api-key')).toBeNull();
  });

  it('sanitizes AI Studio-only request fields before forwarding to Vertex', async () => {
    const capturedBodies: string[] = [];
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = init?.body instanceof Uint8Array ? Buffer.from(init.body).toString('utf8') : '';
      capturedBodies.push(body);
      return new Response('{}', { status: 200 });
    });
    const app = createServer(vertexConfig, {
      fetchImpl,
      vertexAuth: { getAccessToken: vi.fn(async () => 'token') },
    });
    const started = serverCleanup.track(await startHttpServer(app));

    await fetch(`${started.baseUrl}/api/gemini/v1beta/models/gemini-3-flash-preview:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              {
                functionResponse: {
                  id: 'call-1',
                  name: 'run_local_python',
                  response: { output: '42' },
                },
              },
              { fileData: { fileUri: 'https://www.youtube.com/watch?v=abc' } },
            ],
          },
        ],
        toolConfig: {
          functionCallingConfig: { mode: 'AUTO' },
          includeServerSideToolInvocations: true,
        },
      }),
    });

    expect(JSON.parse(capturedBodies[0])).toEqual({
      contents: [
        {
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: 'run_local_python',
                response: { output: '42' },
              },
            },
            {
              fileData: {
                fileUri: 'https://www.youtube.com/watch?v=abc',
                mimeType: 'video/mp4',
              },
            },
          ],
        },
      ],
      toolConfig: {
        functionCallingConfig: { mode: 'AUTO' },
      },
    });
  });

  it('returns an actionable error when Vertex authentication fails', async () => {
    const fetchImpl = vi.fn();
    const app = createServer(vertexConfig, {
      fetchImpl,
      vertexAuth: {
        getAccessToken: vi.fn(async () => {
          throw new Error('credential file missing');
        }),
      },
    });
    const started = serverCleanup.track(await startHttpServer(app));

    const response = await fetch(`${started.baseUrl}/api/gemini/v1beta/models/gemini-2.5-flash:generateContent`, {
      method: 'POST',
      body: '{}',
    });
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(500);
    expect(body.error).toMatch(/credential file missing/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns 500 when the Vertex auth provider is not wired', async () => {
    const app = createServer(vertexConfig, { fetchImpl: vi.fn() });
    const started = serverCleanup.track(await startHttpServer(app));

    const response = await fetch(`${started.baseUrl}/api/gemini/v1beta/models/gemini-2.5-flash:generateContent`, {
      method: 'POST',
      body: '{}',
    });
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(500);
    expect(body.error).toMatch(/Vertex auth provider/);
  });
});

describe('Vertex GCS Files adapter routing', () => {
  it('returns 503 for Files API requests when GCS is not configured', async () => {
    const app = createServer(vertexConfig, {
      vertexAuth: { getAccessToken: vi.fn(async () => 'token') },
    });
    const started = serverCleanup.track(await startHttpServer(app));

    const response = await fetch(`${started.baseUrl}/api/gemini/upload/v1beta/files`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ file: { displayName: 'a', mimeType: 'text/plain', sizeBytes: '1' } }),
    });

    expect(response.status).toBe(503);
  });

  it('adapts resumable upload, metadata, and generateContent file references', async () => {
    const capturedBodies: string[] = [];
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = init?.body instanceof Uint8Array ? Buffer.from(init.body).toString('utf8') : '';
      capturedBodies.push(body);
      return new Response('{}', { status: 200 });
    });
    const app = createServer(
      { ...vertexConfig, allowedOrigins: ['https://web.example'] },
      {
        fetchImpl,
        vertexAuth: { getAccessToken: vi.fn(async () => 'token') },
        gcsFilesAdapter: createInMemoryAdapter(),
      },
    );
    const started = serverCleanup.track(await startHttpServer(app));

    const initiate = await fetch(`${started.baseUrl}/api/gemini/upload/v1beta/files`, {
      method: 'POST',
      headers: {
        origin: 'https://web.example',
        'content-type': 'application/json',
        'x-goog-upload-header-content-length': '6',
        'x-goog-upload-header-content-type': 'application/octet-stream',
      },
      body: JSON.stringify({ file: { displayName: 'doc.bin' } }),
    });
    expect(initiate.status).toBe(200);
    expect(initiate.headers.get('access-control-expose-headers')).toContain('x-goog-upload-url');
    const uploadUrl = initiate.headers.get('x-goog-upload-url');
    expect(uploadUrl).toMatch(/__gcs-upload-chunk__\/test-id$/);

    const firstChunk = await fetch(`${started.baseUrl}/api/gemini/__gcs-upload-chunk__/test-id`, {
      method: 'POST',
      headers: { 'x-goog-upload-offset': '0', 'x-goog-upload-command': 'upload' },
      body: Buffer.from('foo'),
    });
    expect(firstChunk.headers.get('x-goog-upload-status')).toBe('active');

    const finalChunk = await fetch(`${started.baseUrl}/api/gemini/__gcs-upload-chunk__/test-id`, {
      method: 'POST',
      headers: { 'x-goog-upload-offset': '3', 'x-goog-upload-command': 'upload, finalize' },
      body: Buffer.from('bar'),
    });
    const finalBody = (await finalChunk.json()) as { file: { name: string; uri: string; state: string } };
    expect(finalChunk.headers.get('x-goog-upload-status')).toBe('final');
    expect(finalBody.file).toMatchObject({
      name: 'files/test-id',
      uri: 'https://generativelanguage.googleapis.com/v1beta/files/test-id',
      state: 'ACTIVE',
    });

    const metadata = await fetch(`${started.baseUrl}/api/gemini/v1beta/files/test-id`);
    expect(metadata.status).toBe(200);
    expect(await metadata.json()).toMatchObject({ name: 'files/test-id', state: 'ACTIVE' });

    const generateResponse = await fetch(
      `${started.baseUrl}/api/gemini/v1beta/models/gemini-2.5-flash:generateContent`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ fileData: { mimeType: 'application/octet-stream', fileUri: finalBody.file.uri } }],
            },
          ],
        }),
      },
    );

    expect(generateResponse.status).toBe(200);
    expect(capturedBodies).toHaveLength(1);
    expect(capturedBodies[0]).toContain('"fileUri":"gs://test-bucket/amc-files/test-id"');
  });

  it('rejects malformed upload metadata', async () => {
    const app = createServer(vertexConfig, {
      vertexAuth: { getAccessToken: vi.fn(async () => 'token') },
      gcsFilesAdapter: createInMemoryAdapter(),
    });
    const started = serverCleanup.track(await startHttpServer(app));

    const response = await fetch(`${started.baseUrl}/api/gemini/upload/v1beta/files`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ file: { displayName: 'missing-metadata' } }),
    });

    expect(response.status).toBe(400);
  });
});
