// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

describe('loadConfig', () => {
  it('defaults to AI Studio with MCP transports disabled', () => {
    const config = loadConfig({});

    expect(config.backendFlavor).toBe('aistudio');
    expect(config.vertex).toBeUndefined();
    expect(config.gcs).toBeUndefined();
    expect(config.enableMcpStdio).toBe(false);
    expect(config.enableMcpPrivateHttp).toBe(false);
  });

  it('keeps AI Studio for unrecognized GEMINI_BACKEND values', () => {
    expect(loadConfig({ GEMINI_BACKEND: 'studio' }).backendFlavor).toBe('aistudio');
    expect(loadConfig({ GEMINI_BACKEND: '' }).backendFlavor).toBe('aistudio');
  });

  it('parses GEMINI_BACKEND=vertex case-insensitively', () => {
    expect(loadConfig({ GEMINI_BACKEND: 'VERTEX', GCP_PROJECT_ID: 'p' }).backendFlavor).toBe('vertex');
  });

  it('requires GCP_PROJECT_ID in Vertex mode', () => {
    expect(() => loadConfig({ GEMINI_BACKEND: 'vertex' })).toThrow(/GCP_PROJECT_ID is required/);
  });

  it('reads Vertex config and defaults the location', () => {
    expect(loadConfig({ GEMINI_BACKEND: 'vertex', GCP_PROJECT_ID: 'my-proj' }).vertex).toEqual({
      projectId: 'my-proj',
      location: 'us-central1',
    });

    expect(
      loadConfig({
        GEMINI_BACKEND: 'vertex',
        GCP_PROJECT_ID: 'my-proj',
        GCP_LOCATION: 'europe-west4',
      }).vertex,
    ).toEqual({ projectId: 'my-proj', location: 'europe-west4' });
  });

  it('omits GCS config when GCS_BUCKET is unset', () => {
    const config = loadConfig({ GEMINI_BACKEND: 'vertex', GCP_PROJECT_ID: 'p' });
    expect(config.gcs).toBeUndefined();
  });

  it('reads GCS config with upload-safe defaults', () => {
    const config = loadConfig({
      GEMINI_BACKEND: 'vertex',
      GCP_PROJECT_ID: 'p',
      GCS_BUCKET: 'my-bucket',
    });

    expect(config.gcs).toEqual({
      bucketName: 'my-bucket',
      objectPrefix: 'amc-files/',
      maxFileBytes: 2 * 1024 * 1024 * 1024,
    });
    expect(config.gcs?.maxFileBytes).toBeGreaterThanOrEqual(400 * 1024 * 1024);
  });

  it('normalizes GCS object prefixes and parses the file size limit', () => {
    const config = loadConfig({
      GEMINI_BACKEND: 'vertex',
      GCP_PROJECT_ID: 'p',
      GCS_BUCKET: 'b',
      GCS_OBJECT_PREFIX: '/tenant/files',
      GCS_MAX_FILE_BYTES: '524288',
    });

    expect(config.gcs).toEqual({
      bucketName: 'b',
      objectPrefix: 'tenant/files/',
      maxFileBytes: 524288,
    });
  });

  it('falls back to the default GCS limit on invalid input', () => {
    const config = loadConfig({
      GEMINI_BACKEND: 'vertex',
      GCP_PROJECT_ID: 'p',
      GCS_BUCKET: 'b',
      GCS_MAX_FILE_BYTES: 'not-a-number',
    });

    expect(config.gcs?.maxFileBytes).toBe(2 * 1024 * 1024 * 1024);
  });

  it('ignores GCS settings in AI Studio mode', () => {
    expect(loadConfig({ GCS_BUCKET: 'ignored' }).gcs).toBeUndefined();
  });

  it('parses MCP transport enablement flags from the environment', () => {
    const config = loadConfig({
      ENABLE_MCP_STDIO: 'true',
      ENABLE_MCP_PRIVATE_HTTP: 'yes',
    });

    expect(config.enableMcpStdio).toBe(true);
    expect(config.enableMcpPrivateHttp).toBe(true);
  });
});
