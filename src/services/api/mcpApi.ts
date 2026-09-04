import type { McpServerConfig } from '@/types';
import { readResponseErrorMessage } from '@/utils/errorMessage';
import { rememberDiscoveredTools } from '@/features/mcp/toolDisplayNames';

export interface McpToolDefinition {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface McpResourceDefinition {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  size?: number;
}

export interface McpResourceTemplateDefinition {
  uriTemplate: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface McpPromptDefinition {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

export interface McpResourceReadResult {
  contents: Array<{
    uri: string;
    mimeType?: string;
    text?: string;
    blob?: string;
  }>;
}

export interface McpPromptGetResult {
  messages: Array<{
    role?: string;
    content?: { type?: string; text?: string };
  }>;
}

export interface McpToolsResponse {
  servers: Array<{
    serverId: string;
    serverName: string;
    tools: McpToolDefinition[];
  }>;
  errors: Array<{
    serverId: string;
    serverName: string;
    error: string;
  }>;
}

interface McpResourcesResponse {
  servers: Array<{
    serverId: string;
    serverName: string;
    resources: McpResourceDefinition[];
    resourceTemplates: McpResourceTemplateDefinition[];
  }>;
  errors: Array<{
    serverId: string;
    serverName: string;
    error: string;
  }>;
}

interface McpPromptsResponse {
  servers: Array<{
    serverId: string;
    serverName: string;
    prompts: McpPromptDefinition[];
  }>;
  errors: Array<{
    serverId: string;
    serverName: string;
    error: string;
  }>;
}

export interface McpServerCapabilities {
  tools: McpToolDefinition[];
  resources: McpResourceDefinition[];
  resourceTemplates: McpResourceTemplateDefinition[];
  prompts: McpPromptDefinition[];
  errors: Array<{
    serverId: string;
    serverName: string;
    error: string;
  }>;
  version?: string;
}

export interface McpLogEntry {
  level: string;
  message: string;
  timestamp: number;
}

const readErrorMessage = (response: Response): Promise<string> => readResponseErrorMessage(response, 'MCP request');

/** One MCP progress notification relayed through the streaming tool-call response. */
export interface McpToolProgressEvent {
  progress?: number;
  total?: number;
  message?: string;
}

type McpProgressListener = (event: McpToolProgressEvent) => void;

interface NdjsonStreamLine {
  type?: string;
  result?: unknown;
  error?: string;
  progress?: number;
  total?: number;
  message?: string;
}

/**
 * Reads the streamed NDJSON tool-call protocol to completion, forwarding
 * `progress` lines to `onProgress` as they arrive and resolving with the
 * terminal `result` payload. An `error` line rejects with its message.
 */
const readNdjsonToolCallStream = async (
  body: ReadableStream<Uint8Array>,
  onProgress?: McpProgressListener,
): Promise<unknown> => {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalResult: unknown;

  const consumeLine = (line: string): boolean => {
    if (!line.trim()) return false;
    const parsed = JSON.parse(line) as NdjsonStreamLine;
    if (parsed.type === 'progress') {
      onProgress?.({
        ...(typeof parsed.progress === 'number' ? { progress: parsed.progress } : {}),
        ...(typeof parsed.total === 'number' ? { total: parsed.total } : {}),
        ...(typeof parsed.message === 'string' ? { message: parsed.message } : {}),
      });
      return false;
    }
    if (parsed.type === 'result') {
      finalResult = parsed.result;
      return true;
    }
    if (parsed.type === 'error') {
      throw new Error(parsed.error || 'MCP tool call failed.');
    }
    return false;
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        if (consumeLine(line)) {
          return finalResult;
        }
        newlineIndex = buffer.indexOf('\n');
      }
    }
    const tail = decoder.decode();
    if (tail) consumeLine(tail);
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return finalResult;
};

export const fetchMcpTools = async (
  servers: McpServerConfig[],
  abortSignal?: AbortSignal,
): Promise<McpToolsResponse> => {
  const response = await fetch('/api/mcp/tools', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ servers }),
    signal: abortSignal,
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const payload = (await response.json()) as McpToolsResponse;
  // Seed the readable-title registry used by chat tool-call blocks.
  rememberDiscoveredTools(payload);
  return payload;
};

export const fetchMcpResources = async (
  servers: McpServerConfig[],
  abortSignal?: AbortSignal,
): Promise<McpResourcesResponse> => {
  const response = await fetch('/api/mcp/resources', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ servers }),
    signal: abortSignal,
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return (await response.json()) as McpResourcesResponse;
};

export const fetchMcpPrompts = async (
  servers: McpServerConfig[],
  abortSignal?: AbortSignal,
): Promise<McpPromptsResponse> => {
  const response = await fetch('/api/mcp/prompts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ servers }),
    signal: abortSignal,
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return (await response.json()) as McpPromptsResponse;
};

export const fetchMcpResource = async (
  server: McpServerConfig,
  uri: string,
  abortSignal?: AbortSignal,
): Promise<{ result?: McpResourceReadResult }> => {
  const response = await fetch('/api/mcp/resource', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ server, uri }),
    signal: abortSignal,
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return (await response.json()) as { result?: McpResourceReadResult };
};

export const fetchMcpPrompt = async (
  server: McpServerConfig,
  promptName: string,
  args: Record<string, string>,
  abortSignal?: AbortSignal,
): Promise<{ result?: McpPromptGetResult }> => {
  const response = await fetch('/api/mcp/prompt', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ server, promptName, args }),
    signal: abortSignal,
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return (await response.json()) as { result?: McpPromptGetResult };
};

export const callMcpTool = async (
  server: McpServerConfig,
  toolName: string,
  args: Record<string, unknown>,
  abortSignal?: AbortSignal,
  onProgress?: McpProgressListener,
): Promise<unknown> => {
  const response = await fetch('/api/mcp/call', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/x-ndjson' },
    body: JSON.stringify({ server, toolName, args }),
    signal: abortSignal,
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('x-ndjson') && response.body) {
    return readNdjsonToolCallStream(response.body, onProgress);
  }

  // Legacy single-shot JSON response (old API server build).
  const body = (await response.json()) as { result?: unknown };
  return body.result;
};

export const fetchMcpLogs = async (server: McpServerConfig, signal?: AbortSignal): Promise<{ logs: McpLogEntry[] }> => {
  const response = await fetch(`/api/mcp/logs?serverId=${encodeURIComponent(server.id)}`, { signal });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  return (await response.json()) as { logs: McpLogEntry[] };
};

export const fetchMcpServerCapabilities = async (
  server: McpServerConfig,
  abortSignal?: AbortSignal,
): Promise<McpServerCapabilities> => {
  const [toolsResponse, resourcesResponse, promptsResponse] = await Promise.all([
    fetchMcpTools([server], abortSignal),
    fetchMcpResources([server], abortSignal),
    fetchMcpPrompts([server], abortSignal),
  ]);
  const toolServer = toolsResponse.servers.find((entry) => entry.serverId === server.id);
  const resourceServer = resourcesResponse.servers.find((entry) => entry.serverId === server.id);
  const promptServer = promptsResponse.servers.find((entry) => entry.serverId === server.id);

  return {
    tools: toolServer?.tools ?? [],
    resources: resourceServer?.resources ?? [],
    resourceTemplates: resourceServer?.resourceTemplates ?? [],
    prompts: promptServer?.prompts ?? [],
    errors: [...toolsResponse.errors, ...resourcesResponse.errors, ...promptsResponse.errors],
  };
};
