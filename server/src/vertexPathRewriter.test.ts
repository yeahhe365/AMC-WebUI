import { describe, expect, it } from 'vitest';
import { mapModelId, rewriteToVertex } from './vertexPathRewriter';
import type { VertexBackendConfig } from './config';

const vertex: VertexBackendConfig = { projectId: 'my-proj', location: 'us-central1' };

describe('mapModelId', () => {
  it('maps Imagen 4 AI Studio IDs to Vertex Imagen 3 IDs', () => {
    expect(mapModelId('imagen-4.0-generate-001')).toBe('imagen-3.0-generate-002');
    expect(mapModelId('imagen-4.0-fast-generate-001')).toBe('imagen-3.0-fast-generate-001');
    expect(mapModelId('imagen-4.0-ultra-generate-001')).toBe('imagen-3.0-ultra-generate-002');
  });

  it('passes through unmapped IDs unchanged', () => {
    expect(mapModelId('gemini-2.5-flash')).toBe('gemini-2.5-flash');
    expect(mapModelId('gemini-2.5-pro')).toBe('gemini-2.5-pro');
  });
});

describe('rewriteToVertex', () => {
  it('rewrites generateContent invocations to the Vertex publisher path', () => {
    const result = rewriteToVertex('/v1beta/models/gemini-2.5-flash:generateContent', '', vertex);

    expect(result.url).toBe(
      'https://us-central1-aiplatform.googleapis.com/v1/projects/my-proj/locations/us-central1/publishers/google/models/gemini-2.5-flash:generateContent',
    );
    expect(result.isModelInvocation).toBe(true);
  });

  it('preserves the search string on streamGenerateContent', () => {
    const result = rewriteToVertex('/v1beta/models/gemini-2.5-pro:streamGenerateContent', '?alt=sse', vertex);

    expect(result.url).toBe(
      'https://us-central1-aiplatform.googleapis.com/v1/projects/my-proj/locations/us-central1/publishers/google/models/gemini-2.5-pro:streamGenerateContent?alt=sse',
    );
  });

  it('maps Imagen IDs through the model ID map during rewrite', () => {
    const result = rewriteToVertex('/v1beta/models/imagen-4.0-generate-001:predict', '', vertex);

    expect(result.url).toContain('publishers/google/models/imagen-3.0-generate-002:predict');
  });

  it('routes non-model paths to the projects/locations prefix', () => {
    const result = rewriteToVertex('/v1beta/models', '', vertex);

    expect(result.url).toBe(
      'https://us-central1-aiplatform.googleapis.com/v1/projects/my-proj/locations/us-central1/models',
    );
    expect(result.isModelInvocation).toBe(false);
  });

  it('respects a non-default location in both host and path', () => {
    const result = rewriteToVertex('/v1beta/models/gemini-2.5-flash:generateContent', '', {
      projectId: 'p',
      location: 'europe-west4',
    });

    expect(result.url).toBe(
      'https://europe-west4-aiplatform.googleapis.com/v1/projects/p/locations/europe-west4/publishers/google/models/gemini-2.5-flash:generateContent',
    );
  });

  it('uses the unprefixed aiplatform host when location is global', () => {
    const result = rewriteToVertex('/v1beta/models/gemini-2.5-flash:generateContent', '', {
      projectId: 'p',
      location: 'global',
    });

    expect(result.url).toBe(
      'https://aiplatform.googleapis.com/v1/projects/p/locations/global/publishers/google/models/gemini-2.5-flash:generateContent',
    );
  });
});
