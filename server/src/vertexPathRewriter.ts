import type { VertexBackendConfig } from './config.js';

const VERTEX_HOST_SUFFIX = '-aiplatform.googleapis.com';
const AISTUDIO_VERSION_PREFIX_PATTERN = /^\/v\d+(?:(?:alpha|beta)\d*|\.\d+)?\//;

const MODEL_ID_MAP: Record<string, string> = {
  'imagen-4.0-generate-001': 'imagen-3.0-generate-002',
  'imagen-4.0-fast-generate-001': 'imagen-3.0-fast-generate-001',
  'imagen-4.0-ultra-generate-001': 'imagen-3.0-ultra-generate-002',
};

export function mapModelId(aiStudioModelId: string): string {
  return MODEL_ID_MAP[aiStudioModelId] ?? aiStudioModelId;
}

interface RewriteResult {
  url: string;
  isModelInvocation: boolean;
}

export function rewriteToVertex(upstreamPath: string, search: string, vertex: VertexBackendConfig): RewriteResult {
  const host = vertex.location === 'global' ? 'aiplatform.googleapis.com' : `${vertex.location}${VERTEX_HOST_SUFFIX}`;
  const normalizedPath = upstreamPath.startsWith('/') ? upstreamPath : `/${upstreamPath}`;

  const withoutVersion = normalizedPath.replace(AISTUDIO_VERSION_PREFIX_PATTERN, '/');

  const modelInvocationMatch = withoutVersion.match(/^\/models\/([^/:]+)(:[^/]+)$/);
  if (modelInvocationMatch) {
    const [, modelId, methodSuffix] = modelInvocationMatch;
    const mappedModel = mapModelId(modelId);
    const vertexPath = `/v1/projects/${vertex.projectId}/locations/${vertex.location}/publishers/google/models/${mappedModel}${methodSuffix}`;
    return {
      url: `https://${host}${vertexPath}${search}`,
      isModelInvocation: true,
    };
  }

  return {
    url: `https://${host}/v1/projects/${vertex.projectId}/locations/${vertex.location}${withoutVersion}${search}`,
    isModelInvocation: false,
  };
}
