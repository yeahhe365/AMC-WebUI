import { Buffer } from 'node:buffer';
import { Writable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { createGcsFilesAdapter, type StorageLike } from './gcsFilesAdapter';
import type { GcsConfig } from './config';

interface FakeFileState {
  data: Buffer;
  contentType: string;
  metadata: Record<string, string>;
  timeCreated: string;
  updated: string;
}

interface FakeStorage extends StorageLike {
  files: Map<string, FakeFileState>;
}

function createFakeStorage(): FakeStorage {
  const files = new Map<string, FakeFileState>();
  const now = '2026-05-18T12:00:00.000Z';

  const storage: FakeStorage = {
    files,
    bucket: (bucketName: string) => ({
      file: (path: string) => {
        const key = `${bucketName}/${path}`;
        return {
          save: async (data: Buffer, options) => {
            files.set(key, {
              data,
              contentType: options.metadata?.contentType ?? options.contentType ?? 'application/octet-stream',
              metadata: options.metadata?.metadata ?? {},
              timeCreated: now,
              updated: now,
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
                  timeCreated: now,
                  updated: now,
                });
                callback();
              },
            });
          },
          getMetadata: async () => {
            const existing = files.get(key);
            if (!existing) {
              throw new Error(`File not found: ${key}`);
            }
            return [
              {
                size: existing.data.byteLength,
                contentType: existing.contentType,
                metadata: existing.metadata,
                timeCreated: existing.timeCreated,
                updated: existing.updated,
              },
            ];
          },
          exists: async () => [files.has(key)],
        };
      },
    }),
  };

  return storage;
}

const baseConfig: GcsConfig = {
  bucketName: 'my-bucket',
  objectPrefix: 'amc-files/',
  maxFileBytes: 1024 * 1024,
};

describe('createGcsFilesAdapter', () => {
  it('uploads a single-chunk file and returns AI-Studio shaped File metadata', async () => {
    const storage = createFakeStorage();
    const fixedDate = new Date('2026-05-18T12:00:00.000Z');
    const adapter = createGcsFilesAdapter({
      storage,
      config: baseConfig,
      now: () => fixedDate,
      randomId: () => 'abc123',
    });

    const init = adapter.initiateUpload({ displayName: 'cat.png', mimeType: 'image/png', sizeBytes: 5 });
    expect(init.sessionId).toBe('abc123');
    expect(init.uploadUrl).toBe('https://generativelanguage.googleapis.com/__gcs-upload-chunk__/abc123');

    const data = Buffer.from('hello');
    const result = await adapter.uploadChunk({
      sessionId: 'abc123',
      offset: 0,
      command: 'upload, finalize',
      chunk: data,
    });

    expect(result.status).toBe('final');
    expect(result.file).toEqual({
      name: 'files/abc123',
      displayName: 'cat.png',
      mimeType: 'image/png',
      sizeBytes: '5',
      createTime: '2026-05-18T12:00:00.000Z',
      updateTime: '2026-05-18T12:00:00.000Z',
      expirationTime: '2027-05-18T12:00:00.000Z',
      state: 'ACTIVE',
      uri: 'https://generativelanguage.googleapis.com/v1beta/files/abc123',
    });

    const stored = storage.files.get('my-bucket/amc-files/abc123');
    expect(stored?.data.equals(data)).toBe(true);
    expect(stored?.contentType).toBe('image/png');
    expect(stored?.metadata['amc-display-name']).toBe('cat.png');
  });

  it('aggregates multiple resumable chunks before writing to GCS', async () => {
    const storage = createFakeStorage();
    const adapter = createGcsFilesAdapter({
      storage,
      config: baseConfig,
      now: () => new Date('2026-01-01T00:00:00.000Z'),
      randomId: () => 'sess-1',
    });
    adapter.initiateUpload({ displayName: 'doc.bin', mimeType: 'application/octet-stream', sizeBytes: 6 });

    const first = await adapter.uploadChunk({
      sessionId: 'sess-1',
      offset: 0,
      command: 'upload',
      chunk: Buffer.from('foo'),
    });
    expect(first.status).toBe('active');
    expect(first.file).toBeUndefined();
    expect(storage.files.size).toBe(0);

    const second = await adapter.uploadChunk({
      sessionId: 'sess-1',
      offset: 3,
      command: 'upload, finalize',
      chunk: Buffer.from('bar'),
    });

    expect(second.status).toBe('final');
    expect(second.file?.sizeBytes).toBe('6');
    expect(storage.files.get('my-bucket/amc-files/sess-1')?.data.toString('utf8')).toBe('foobar');
  });

  it('rejects unexpected chunk offsets', async () => {
    const storage = createFakeStorage();
    const adapter = createGcsFilesAdapter({
      storage,
      config: baseConfig,
      randomId: () => 'sess-x',
    });
    adapter.initiateUpload({ displayName: 'a', mimeType: 'text/plain', sizeBytes: 4 });

    await expect(
      adapter.uploadChunk({ sessionId: 'sess-x', offset: 1, command: 'upload', chunk: Buffer.from('a') }),
    ).rejects.toThrow(/Unexpected upload offset/);
  });

  it('rejects finalize when accumulated size differs from declared size', async () => {
    const storage = createFakeStorage();
    const adapter = createGcsFilesAdapter({
      storage,
      config: baseConfig,
      randomId: () => 'sess-y',
    });
    adapter.initiateUpload({ displayName: 'a', mimeType: 'text/plain', sizeBytes: 10 });

    await expect(
      adapter.uploadChunk({
        sessionId: 'sess-y',
        offset: 0,
        command: 'upload, finalize',
        chunk: Buffer.from('short'),
      }),
    ).rejects.toThrow(/File size mismatch/);
  });

  it('rejects oversize uploads at initiate time', () => {
    const storage = createFakeStorage();
    const adapter = createGcsFilesAdapter({
      storage,
      config: { ...baseConfig, maxFileBytes: 100 },
      randomId: () => 'sess-z',
    });

    expect(() =>
      adapter.initiateUpload({ displayName: 'big.bin', mimeType: 'application/octet-stream', sizeBytes: 200 }),
    ).toThrow(/exceeds GCS_MAX_FILE_BYTES/);
  });

  it('allows a declared 400MB video upload session when the configured limit permits it', () => {
    const storage = createFakeStorage();
    const adapter = createGcsFilesAdapter({
      storage,
      config: { ...baseConfig, maxFileBytes: 2 * 1024 * 1024 * 1024 },
      randomId: () => 'video-400mb',
    });

    const init = adapter.initiateUpload({
      displayName: 'large.mp4',
      mimeType: 'video/mp4',
      sizeBytes: 400 * 1024 * 1024,
    });

    expect(init.sessionId).toBe('video-400mb');
    expect(init.uploadUrl).toBe('https://generativelanguage.googleapis.com/__gcs-upload-chunk__/video-400mb');
  });

  it('returns null for unknown file IDs in getFileMetadata', async () => {
    const storage = createFakeStorage();
    const adapter = createGcsFilesAdapter({ storage, config: baseConfig });

    expect(await adapter.getFileMetadata('does-not-exist')).toBeNull();
  });

  it('rejects malformed file IDs in getFileMetadata', async () => {
    const storage = createFakeStorage();
    const adapter = createGcsFilesAdapter({ storage, config: baseConfig });

    expect(await adapter.getFileMetadata('../escape')).toBeNull();
    expect(await adapter.getFileMetadata('with/slashes')).toBeNull();
  });

  it('builds metadata from GCS object after upload', async () => {
    const storage = createFakeStorage();
    const adapter = createGcsFilesAdapter({
      storage,
      config: baseConfig,
      now: () => new Date('2026-05-18T12:00:00.000Z'),
      randomId: () => 'fixed-id',
    });
    adapter.initiateUpload({ displayName: 'img.png', mimeType: 'image/png', sizeBytes: 3 });
    await adapter.uploadChunk({
      sessionId: 'fixed-id',
      offset: 0,
      command: 'upload, finalize',
      chunk: Buffer.from('abc'),
    });

    const meta = await adapter.getFileMetadata('fixed-id');
    expect(meta).toMatchObject({
      name: 'files/fixed-id',
      displayName: 'img.png',
      mimeType: 'image/png',
      sizeBytes: '3',
      state: 'ACTIVE',
      uri: 'https://generativelanguage.googleapis.com/v1beta/files/fixed-id',
    });
  });

  it('rewrites AI Studio file URIs to gs:// in JSON bodies', () => {
    const storage = createFakeStorage();
    const adapter = createGcsFilesAdapter({ storage, config: baseConfig });
    const body = Buffer.from(
      JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              {
                fileData: {
                  mimeType: 'image/png',
                  fileUri: 'https://generativelanguage.googleapis.com/v1beta/files/abc-123',
                },
              },
              { text: 'describe this' },
            ],
          },
        ],
      }),
    );

    const rewritten = adapter.rewriteFileUriInJsonBody(body);
    expect(rewritten.toString('utf8')).toContain('"fileUri":"gs://my-bucket/amc-files/abc-123"');
    expect(rewritten.toString('utf8')).not.toContain('generativelanguage.googleapis.com');
  });

  it('returns the original buffer when no AI Studio URI is present', () => {
    const storage = createFakeStorage();
    const adapter = createGcsFilesAdapter({ storage, config: baseConfig });
    const body = Buffer.from('{"contents":[{"role":"user","parts":[{"text":"hi"}]}]}');

    expect(adapter.rewriteFileUriInJsonBody(body)).toBe(body);
  });

  it('uses the configured object prefix in both GCS path and rewritten URI', async () => {
    const storage = createFakeStorage();
    const adapter = createGcsFilesAdapter({
      storage,
      config: { ...baseConfig, objectPrefix: 'tenant-x/files/' },
      randomId: () => 'item-1',
    });
    adapter.initiateUpload({ displayName: 'a', mimeType: 'text/plain', sizeBytes: 1 });
    await adapter.uploadChunk({
      sessionId: 'item-1',
      offset: 0,
      command: 'upload, finalize',
      chunk: Buffer.from('a'),
    });

    expect(storage.files.has('my-bucket/tenant-x/files/item-1')).toBe(true);

    const rewritten = adapter.rewriteFileUriInJsonBody(
      Buffer.from('"https://generativelanguage.googleapis.com/v1beta/files/item-1"'),
    );
    expect(rewritten.toString('utf8')).toBe('"gs://my-bucket/tenant-x/files/item-1"');
  });

  it('cleans up the upload session after finalize', async () => {
    const storage = createFakeStorage();
    const adapter = createGcsFilesAdapter({
      storage,
      config: baseConfig,
      randomId: () => 'cleanup-test',
    });
    adapter.initiateUpload({ displayName: 'a', mimeType: 'text/plain', sizeBytes: 1 });
    await adapter.uploadChunk({
      sessionId: 'cleanup-test',
      offset: 0,
      command: 'upload, finalize',
      chunk: Buffer.from('a'),
    });

    await expect(
      adapter.uploadChunk({
        sessionId: 'cleanup-test',
        offset: 0,
        command: 'upload',
        chunk: Buffer.from('a'),
      }),
    ).rejects.toThrow(/Upload session .* not found/);
  });

  it('returns 0 size when GCS metadata size is missing', async () => {
    const noopStorage: StorageLike = {
      bucket: () => ({
        file: () => ({
          save: vi.fn(),
          exists: async () => [true],
          getMetadata: async () => [{ contentType: 'image/png' }],
        }),
      }),
    };

    const adapter = createGcsFilesAdapter({ storage: noopStorage, config: baseConfig });
    const meta = await adapter.getFileMetadata('any-id');
    expect(meta?.sizeBytes).toBe('0');
  });
});
