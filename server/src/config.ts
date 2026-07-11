export type GeminiBackendFlavor = 'aistudio' | 'vertex';

export interface ApiServerConfig {
  port: number;
  backendFlavor: GeminiBackendFlavor;
  geminiApiBase: string;
  geminiApiKey?: string;
  vertex?: VertexBackendConfig;
  gcs?: GcsConfig;
  allowedOrigins: string[];
  enableMcpStdio: boolean;
  enableMcpPrivateHttp: boolean;
}

export interface VertexBackendConfig {
  projectId: string;
  location: string;
}

export interface GcsConfig {
  bucketName: string;
  objectPrefix: string;
  maxFileBytes: number;
}

interface EnvLike {
  [key: string]: string | undefined;
}

const DEFAULT_PORT = 3001;
const DEFAULT_GEMINI_API_BASE = 'https://generativelanguage.googleapis.com';
const DEFAULT_VERTEX_LOCATION = 'us-central1';
const DEFAULT_GCS_OBJECT_PREFIX = 'amc-files/';
const DEFAULT_GCS_MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024;

function parsePort(port: string | undefined): number {
  if (!port) {
    return DEFAULT_PORT;
  }

  const parsed = Number.parseInt(port, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return DEFAULT_PORT;
  }

  return parsed;
}

function parseAllowedOrigins(rawOrigins: string | undefined): string[] {
  if (!rawOrigins) {
    return [];
  }

  return rawOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

function parseBooleanFlag(value: string | undefined): boolean {
  return ['1', 'true', 'yes', 'on'].includes(value?.trim().toLowerCase() ?? '');
}

function parseBackendFlavor(value: string | undefined): GeminiBackendFlavor {
  return value?.trim().toLowerCase() === 'vertex' ? 'vertex' : 'aistudio';
}

function loadVertexConfig(env: EnvLike): VertexBackendConfig {
  const projectId = env.GCP_PROJECT_ID?.trim();
  if (!projectId) {
    throw new Error('GCP_PROJECT_ID is required when GEMINI_BACKEND=vertex.');
  }

  return {
    projectId,
    location: env.GCP_LOCATION?.trim() || DEFAULT_VERTEX_LOCATION,
  };
}

function normalizeObjectPrefix(value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    return DEFAULT_GCS_OBJECT_PREFIX;
  }

  const withoutLeadingSlash = trimmed.replace(/^\/+/, '');
  return withoutLeadingSlash.endsWith('/') ? withoutLeadingSlash : `${withoutLeadingSlash}/`;
}

function parseMaxFileBytes(value: string | undefined): number {
  if (!value) {
    return DEFAULT_GCS_MAX_FILE_BYTES;
  }

  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_GCS_MAX_FILE_BYTES;
}

function loadGcsConfig(env: EnvLike): GcsConfig | undefined {
  const bucketName = env.GCS_BUCKET?.trim();
  if (!bucketName) {
    return undefined;
  }

  return {
    bucketName,
    objectPrefix: normalizeObjectPrefix(env.GCS_OBJECT_PREFIX),
    maxFileBytes: parseMaxFileBytes(env.GCS_MAX_FILE_BYTES),
  };
}

export function loadConfig(env: EnvLike = process.env): ApiServerConfig {
  const backendFlavor = parseBackendFlavor(env.GEMINI_BACKEND);
  const baseConfig = {
    port: parsePort(env.PORT),
    backendFlavor,
    geminiApiBase: env.GEMINI_API_BASE?.trim() || DEFAULT_GEMINI_API_BASE,
    geminiApiKey: env.GEMINI_API_KEY?.trim() || undefined,
    allowedOrigins: parseAllowedOrigins(env.ALLOWED_ORIGINS),
    enableMcpStdio: parseBooleanFlag(env.ENABLE_MCP_STDIO),
    enableMcpPrivateHttp: parseBooleanFlag(env.ENABLE_MCP_PRIVATE_HTTP),
  };

  if (backendFlavor === 'vertex') {
    return {
      ...baseConfig,
      vertex: loadVertexConfig(env),
      gcs: loadGcsConfig(env),
    };
  }

  return baseConfig;
}
