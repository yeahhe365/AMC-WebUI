import type { IncomingMessage, ServerResponse } from 'node:http';
import { getCorsHeaders, sendJson } from './cors.js';
import type { McpClientBridge, McpServerConfig, McpTool, McpToolProgressUpdate } from './mcpTypes.js';
import { isPrivateNetworkHostname } from '../../shared/privateNetwork.js';
import {
  isValidMcpHttpUrl,
  sanitizeMcpAuth,
  sanitizeMcpTimeout,
  sanitizeStringArray,
  sanitizeStringRecord,
} from '../../shared/mcpServerConfig.js';
import { isRecord } from '../../shared/predicates.js';

const MCP_TOOLS_PATH = '/api/mcp/tools';
const MCP_CALL_PATH = '/api/mcp/call';
const MCP_RESOURCES_PATH = '/api/mcp/resources';
const MCP_RESOURCE_PATH = '/api/mcp/resource';
const MCP_PROMPTS_PATH = '/api/mcp/prompts';

/** Env vars that would let a server config hijack the bridge process (Cherry Studio DXT denylist). */
const MCP_STDIO_ENV_DENYLIST = /^(NODE_OPTIONS|LD_PRELOAD|LD_LIBRARY_PATH|DYLD_[A-Z_]+)$/i;
const MCP_PROMPT_PATH = '/api/mcp/prompt';
const MCP_LOGS_PATH = '/api/mcp/logs';

const MAX_MCP_REQUEST_BYTES = 1024 * 1024;

const NDJSON_CONTENT_TYPE = 'application/x-ndjson';

/** True when the caller asked for the streamed progress protocol. */
const acceptsNdjsonStream = (request: IncomingMessage): boolean =>
  String(request.headers.accept ?? '').includes(NDJSON_CONTENT_TYPE);

/**
 * Streams the NDJSON tool-call protocol on a chunked response: a `start` line,
 * one `progress` line per MCP progress notification, then a terminal
 * `result` or `error` line. Only reached after full request validation, so
 * validation failures keep returning plain JSON for legacy callers.
 */
const streamNdjsonResponse = async (
  request: IncomingMessage,
  response: ServerResponse,
  allowedOrigins: string[],
  run: (emitProgress: (update: McpToolProgressUpdate) => void) => Promise<unknown>,
): Promise<void> => {
  if (response.headersSent || response.destroyed) {
    return;
  }
  response.writeHead(200, {
    ...getCorsHeaders(request, allowedOrigins),
    'content-type': NDJSON_CONTENT_TYPE,
    'cache-control': 'no-store',
  });
  const writeLine = (payload: Record<string, unknown>): void => {
    if (!response.destroyed && !response.writableEnded) {
      response.write(`${JSON.stringify(payload)}\n`);
    }
  };
  writeLine({ type: 'start' });
  try {
    const result = await run((update) => writeLine({ type: 'progress', ...update }));
    if (response.writableEnded) return;
    writeLine({ type: 'result', ...(result !== undefined ? { result } : {}) });
  } catch (error) {
    writeLine({ type: 'error', error: getErrorMessage(error) });
  } finally {
    response.end();
  }
};

const MCP_STDIO_DISABLED_ERROR = 'MCP stdio transport is disabled on this API server.';

interface McpRouteOptions {
  enableStdio: boolean;
  enablePrivateHttp: boolean;
}

type McpServerParseResult =
  | {
      ok: true;
      server: McpServerConfig;
    }
  | {
      ok: false;
      error?: {
        serverId: string;
        serverName: string;
        error: string;
      };
    };

const readRequestBody = async (request: IncomingMessage): Promise<string> => {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.byteLength;
    if (totalBytes > MAX_MCP_REQUEST_BYTES) {
      const error = new Error('MCP request body is too large.');
      error.name = 'HttpError';
      throw error;
    }
    chunks.push(buffer);
  }

  return Buffer.concat(chunks).toString('utf8');
};

const readJsonBody = async (request: IncomingMessage): Promise<unknown> => {
  const rawBody = await readRequestBody(request);
  if (!rawBody.trim()) {
    return {};
  }

  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    throw new SyntaxError('MCP request body must be valid JSON.');
  }
};

const isPrivateMcpHttpUrl = (value: string): boolean => {
  try {
    return isPrivateNetworkHostname(new URL(value).hostname);
  } catch {
    return false;
  }
};

const parseMcpServer = (value: unknown, options: McpRouteOptions): McpServerParseResult => {
  if (!isRecord(value)) {
    return { ok: false };
  }

  const id = typeof value.id === 'string' ? value.id.trim() : '';
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  const enabled = value.enabled === true;
  const transport = value.transport;
  if (!id || !name || (transport !== 'stdio' && transport !== 'http' && transport !== 'sse')) {
    // Attribute the failure to the (partial) server so the UI can show why a
    // configured server produced no tools instead of silently dropping it.
    return {
      ok: false,
      error: {
        serverId: id || '(missing id)',
        serverName: name || '(missing name)',
        error: !id
          ? 'MCP server configuration is missing a server ID.'
          : !name
            ? 'MCP server configuration is missing a name.'
            : 'MCP server transport must be stdio, http, or sse.',
      },
    };
  }

  const server: McpServerConfig = {
    id,
    name,
    enabled,
    transport,
  };

  const timeout = sanitizeMcpTimeout(value.timeout);
  if (timeout !== undefined) server.timeout = timeout;
  if (typeof value.longRunning === 'boolean') server.longRunning = value.longRunning;

  if (!enabled) {
    return { ok: true, server };
  }

  if (transport === 'stdio') {
    const command = typeof value.command === 'string' ? value.command.trim() : '';
    if (!command) {
      return {
        ok: false,
        error: {
          serverId: id,
          serverName: name,
          error: 'MCP stdio server requires a command.',
        },
      };
    }

    const env = sanitizeStringRecord(value.env);
    const dangerousEnvKey = Object.keys(env ?? {}).find((key) => MCP_STDIO_ENV_DENYLIST.test(key));
    if (dangerousEnvKey) {
      return {
        ok: false,
        error: {
          serverId: id,
          serverName: name,
          error: `MCP stdio servers refuse environment variable "${dangerousEnvKey}" (NODE_OPTIONS/LD_PRELOAD-style injection).`,
        },
      };
    }

    server.command = command;
    const args = sanitizeStringArray(value.args);
    if (args) server.args = args;
    if (env) server.env = env;
    return { ok: true, server };
  }

  // http | sse
  const url = typeof value.url === 'string' ? value.url.trim() : '';
  if (!url) {
    return {
      ok: false,
      error: {
        serverId: id,
        serverName: name,
        error: 'MCP http/sse server requires a URL.',
      },
    };
  }

  if (!isValidMcpHttpUrl(url)) {
    return {
      ok: false,
      error: {
        serverId: id,
        serverName: name,
        error: 'MCP HTTP server URL must use http:// or https://.',
      },
    };
  }

  if (!options.enablePrivateHttp && isPrivateMcpHttpUrl(url)) {
    return {
      ok: false,
      error: {
        serverId: id,
        serverName: name,
        error: 'Private MCP HTTP server URLs are disabled on this API server.',
      },
    };
  }

  server.url = url;
  const headers = sanitizeStringRecord(value.headers);
  const auth = sanitizeMcpAuth(value.auth);
  if (headers) server.headers = headers;
  if (auth) server.auth = auth;
  return { ok: true, server };
};

const getErrorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

type McpServerErrorEntry = {
  serverId: string;
  serverName: string;
  error: string;
};

type McpServerOutcome<T> = { ok: true; value: T } | { ok: false; error: McpServerErrorEntry };

/**
 * Runs one operation per server concurrently and collects per-server failures
 * instead of failing the whole batch: applies the stdio-disabled gate, turns
 * thrown errors into structured entries, and preserves input ordering.
 */
const runPerServerConcurrently = async <T>(
  servers: readonly McpServerConfig[],
  options: McpRouteOptions,
  operation: (server: McpServerConfig) => Promise<T>,
): Promise<{ values: T[]; errors: McpServerErrorEntry[] }> => {
  const outcomes = await Promise.all(
    servers.map(async (server): Promise<McpServerOutcome<T>> => {
      if (server.transport === 'stdio' && !options.enableStdio) {
        return {
          ok: false,
          error: {
            serverId: server.id,
            serverName: server.name,
            error: MCP_STDIO_DISABLED_ERROR,
          },
        };
      }

      try {
        return { ok: true, value: await operation(server) };
      } catch (error) {
        return {
          ok: false,
          error: {
            serverId: server.id,
            serverName: server.name,
            error: getErrorMessage(error),
          },
        };
      }
    }),
  );

  const values: T[] = [];
  const errors: McpServerErrorEntry[] = [];
  for (const outcome of outcomes) {
    if (outcome.ok) values.push(outcome.value);
    else errors.push(outcome.error);
  }
  return { values, errors };
};

const parseServersFromListBody = async (
  request: IncomingMessage,
  response: ServerResponse,
  allowedOrigins: string[],
  options: McpRouteOptions,
): Promise<
  | {
      ok: true;
      enabledServers: McpServerConfig[];
      errors: McpServerErrorEntry[];
    }
  | { ok: false }
> => {
  const body = await readJsonBody(request);
  const rawServers = isRecord(body) && Array.isArray(body.servers) ? body.servers : null;
  if (!rawServers) {
    sendJson(request, response, 400, { error: 'MCP servers must be provided.' }, allowedOrigins);
    return { ok: false };
  }

  const parsedServers = rawServers.map((server) => parseMcpServer(server, options));
  const enabledServers = parsedServers
    .filter((result): result is { ok: true; server: McpServerConfig } => result.ok && result.server.enabled)
    .map((result) => result.server);
  const errors: McpServerErrorEntry[] = parsedServers.flatMap((result) =>
    !result.ok && result.error ? [result.error] : [],
  );

  return { ok: true, enabledServers, errors };
};

const handleListTools = async (
  request: IncomingMessage,
  response: ServerResponse,
  allowedOrigins: string[],
  mcpClient: McpClientBridge,
  options: McpRouteOptions,
): Promise<void> => {
  const parsed = await parseServersFromListBody(request, response, allowedOrigins, options);
  if (!parsed.ok) return;

  const servers: Array<{ serverId: string; serverName: string; tools: McpTool[] }> = [];
  const errors = [...parsed.errors];

  // List concurrently: one slow or hung server must not delay the others.
  const { values, errors: operationErrors } = await runPerServerConcurrently(
    parsed.enabledServers,
    options,
    async (server) => ({
      serverId: server.id,
      serverName: server.name,
      tools: await mcpClient.listTools(server),
    }),
  );
  servers.push(...values);
  errors.push(...operationErrors);

  sendJson(request, response, 200, { servers, errors }, allowedOrigins);
};

interface SingleServerMcpRequestSpec {
  /** Fallback message used when body.server fails validation. */
  serverRequiredFallbackError: string;
  /** Extracts the required trimmed string field (tool name / URI / prompt name) from the parsed body. */
  extractRequiredValue: (body: Record<string, unknown>) => string;
  requiredValueMissingError: string;
  /**
   * Optional bridge-capability gate. When present and resolve() returns null
   * (method unsupported by this API server build), the route responds 501.
   */
  capability?: {
    resolve: (
      requiredValue: string,
      body: Record<string, unknown>,
    ) => ((server: McpServerConfig) => Promise<unknown>) | null;
    unsupportedError: string;
  };
  /**
   * Optional streamed-progress protocol (callTool only). When the caller sends
   * Accept: application/x-ndjson, progress updates are streamed as NDJSON
   * lines before the terminal result/error line instead of a single JSON body.
   */
  streaming?: {
    accepted: (request: IncomingMessage) => boolean;
    invoke: (
      server: McpServerConfig,
      requiredValue: string,
      args: Record<string, unknown>,
      emitProgress: (update: McpToolProgressUpdate) => void,
    ) => Promise<unknown>;
  };
}

/**
 * Shared skeleton for the single-server routes (/call, /resource, /prompt):
 * body validation → server parsing → enabled / required-field checks → stdio
 * guard → optional capability gate → bridge invocation with 502 error mapping.
 */
const respondToSingleServerRequest = async (
  request: IncomingMessage,
  response: ServerResponse,
  allowedOrigins: string[],
  mcpClient: McpClientBridge,
  options: McpRouteOptions,
  spec: SingleServerMcpRequestSpec,
): Promise<void> => {
  const body = await readJsonBody(request);
  if (!isRecord(body)) {
    sendJson(request, response, 400, { error: 'MCP request body must be an object.' }, allowedOrigins);
    return;
  }

  const parsedServer = parseMcpServer(body.server, options);
  const requiredValue = spec.extractRequiredValue(body);
  if (!parsedServer.ok) {
    sendJson(
      request,
      response,
      400,
      { error: parsedServer.error?.error ?? spec.serverRequiredFallbackError },
      allowedOrigins,
    );
    return;
  }

  if (!parsedServer.server.enabled) {
    sendJson(request, response, 400, { error: 'MCP server is disabled.' }, allowedOrigins);
    return;
  }

  if (!requiredValue) {
    sendJson(request, response, 400, { error: spec.requiredValueMissingError }, allowedOrigins);
    return;
  }

  const { server } = parsedServer;
  if (server.transport === 'stdio' && !options.enableStdio) {
    sendJson(request, response, 403, { error: MCP_STDIO_DISABLED_ERROR }, allowedOrigins);
    return;
  }

  const sendInvocationResult = async (invocation: (server: McpServerConfig) => Promise<unknown>): Promise<void> => {
    try {
      const result = await invocation(server);
      sendJson(request, response, 200, { result: result as Record<string, unknown> }, allowedOrigins);
    } catch (error) {
      sendJson(request, response, 502, { error: getErrorMessage(error) }, allowedOrigins);
    }
  };

  if (!spec.capability) {
    // callTool is always available on the bridge.
    const args = isRecord(body.args) ? body.args : {};
    const streaming = spec.streaming;
    if (streaming && streaming.accepted(request)) {
      await streamNdjsonResponse(request, response, allowedOrigins, (emitProgress) =>
        streaming.invoke(server, requiredValue, args, emitProgress),
      );
      return;
    }
    await sendInvocationResult((target) => mcpClient.callTool(target, requiredValue, args));
    return;
  }

  const invocation = spec.capability.resolve(requiredValue, body);
  if (!invocation) {
    sendJson(request, response, 501, { error: spec.capability.unsupportedError }, allowedOrigins);
    return;
  }
  await sendInvocationResult(invocation);
};

const handleCallTool = async (
  request: IncomingMessage,
  response: ServerResponse,
  allowedOrigins: string[],
  mcpClient: McpClientBridge,
  options: McpRouteOptions,
): Promise<void> => {
  await respondToSingleServerRequest(request, response, allowedOrigins, mcpClient, options, {
    serverRequiredFallbackError: 'MCP server and tool name are required.',
    extractRequiredValue: (body) => (typeof body.toolName === 'string' ? body.toolName.trim() : ''),
    requiredValueMissingError: 'MCP tool name is required.',
    streaming: {
      accepted: acceptsNdjsonStream,
      invoke: (server, toolName, args, emitProgress) => mcpClient.callTool(server, toolName, args, emitProgress),
    },
  });
};

const handleListResources = async (
  request: IncomingMessage,
  response: ServerResponse,
  allowedOrigins: string[],
  mcpClient: McpClientBridge,
  options: McpRouteOptions,
): Promise<void> => {
  const parsed = await parseServersFromListBody(request, response, allowedOrigins, options);
  if (!parsed.ok) return;

  const servers: Array<{
    serverId: string;
    serverName: string;
    resources: Awaited<ReturnType<NonNullable<McpClientBridge['listResources']>>>;
    resourceTemplates: Awaited<ReturnType<NonNullable<McpClientBridge['listResourceTemplates']>>>;
  }> = [];
  const errors = [...parsed.errors];

  // List concurrently so one slow server does not delay the rest.
  const { values, errors: operationErrors } = await runPerServerConcurrently(
    parsed.enabledServers,
    options,
    async (server) => {
      if (!mcpClient.listResourcesAndTemplates) {
        throw new Error('MCP resources are not supported by this API server.');
      }

      const { resources, resourceTemplates } = await mcpClient.listResourcesAndTemplates(server);
      return {
        serverId: server.id,
        serverName: server.name,
        resources,
        resourceTemplates,
      };
    },
  );
  servers.push(...values);
  errors.push(...operationErrors);

  sendJson(request, response, 200, { servers, errors }, allowedOrigins);
};

const handleReadResource = async (
  request: IncomingMessage,
  response: ServerResponse,
  allowedOrigins: string[],
  mcpClient: McpClientBridge,
  options: McpRouteOptions,
): Promise<void> => {
  await respondToSingleServerRequest(request, response, allowedOrigins, mcpClient, options, {
    serverRequiredFallbackError: 'MCP server and resource URI are required.',
    extractRequiredValue: (body) => (typeof body.uri === 'string' ? body.uri.trim() : ''),
    requiredValueMissingError: 'MCP resource URI is required.',
    capability: {
      resolve: (uri) => {
        const readResource = mcpClient.readResource;
        return readResource ? (server) => readResource(server, uri) : null;
      },
      unsupportedError: 'MCP resource reads are not supported by this API server.',
    },
  });
};

const handleListPrompts = async (
  request: IncomingMessage,
  response: ServerResponse,
  allowedOrigins: string[],
  mcpClient: McpClientBridge,
  options: McpRouteOptions,
): Promise<void> => {
  const parsed = await parseServersFromListBody(request, response, allowedOrigins, options);
  if (!parsed.ok) return;

  const servers: Array<{
    serverId: string;
    serverName: string;
    prompts: Awaited<ReturnType<NonNullable<McpClientBridge['listPrompts']>>>;
  }> = [];
  const errors = [...parsed.errors];

  // List concurrently so one slow server does not delay the rest.
  const { values, errors: operationErrors } = await runPerServerConcurrently(
    parsed.enabledServers,
    options,
    async (server) => {
      if (!mcpClient.listPrompts) {
        throw new Error('MCP prompts are not supported by this API server.');
      }

      return {
        serverId: server.id,
        serverName: server.name,
        prompts: await mcpClient.listPrompts(server),
      };
    },
  );
  servers.push(...values);
  errors.push(...operationErrors);

  sendJson(request, response, 200, { servers, errors }, allowedOrigins);
};

const handleGetPrompt = async (
  request: IncomingMessage,
  response: ServerResponse,
  allowedOrigins: string[],
  mcpClient: McpClientBridge,
  options: McpRouteOptions,
): Promise<void> => {
  await respondToSingleServerRequest(request, response, allowedOrigins, mcpClient, options, {
    serverRequiredFallbackError: 'MCP server and prompt name are required.',
    extractRequiredValue: (body) => (typeof body.promptName === 'string' ? body.promptName.trim() : ''),
    requiredValueMissingError: 'MCP prompt name is required.',
    capability: {
      resolve: (promptName, body) => {
        const args = sanitizeStringRecord(body.args) ?? {};
        const getPrompt = mcpClient.getPrompt;
        return getPrompt ? (server) => getPrompt(server, promptName, args) : null;
      },
      unsupportedError: 'MCP prompts are not supported by this API server.',
    },
  });
};

export const handleMcpRequest = async (
  request: IncomingMessage,
  response: ServerResponse,
  path: string,
  allowedOrigins: string[],
  mcpClient: McpClientBridge,
  options: McpRouteOptions = { enableStdio: false, enablePrivateHttp: false },
): Promise<boolean> => {
  if (path === MCP_LOGS_PATH) {
    if (request.method !== 'GET') {
      sendJson(request, response, 405, { error: 'Method not allowed' }, allowedOrigins);
      return true;
    }
    try {
      const url = new URL(request.url || '/', 'http://localhost');
      const serverId = url.searchParams.get('serverId')?.trim();
      if (!serverId) {
        sendJson(request, response, 400, { error: 'serverId required' }, allowedOrigins);
        return true;
      }
      // C1: private-host guard parity and 404 for unknown serverId.
      // GET /api/mcp/logs sits before POST-only guard; enforce same private-HTTP awareness
      // as handleListTools/handleCallTool. Unknown serverIds return 404 to avoid probing.
      if (mcpClient.hasLogs && !mcpClient.hasLogs(serverId)) {
        sendJson(request, response, 404, { error: 'MCP server not found.' }, allowedOrigins);
        return true;
      }
      // When private HTTP is disabled, we still serve logs for known servers but unknown
      // already 404s above; no hostname to check via isPrivateNetworkHostname here.
      // The hasLogs gate is the equivalent guard for this GET endpoint.
      void options.enablePrivateHttp;
      const logs = mcpClient.getLogs?.(serverId) ?? [];
      sendJson(request, response, 200, { logs }, allowedOrigins);
    } catch (error) {
      console.error('[mcp] logs request failed:', error);
      sendJson(request, response, 500, { error: 'MCP request failed.' }, allowedOrigins);
    }
    return true;
  }

  if (
    path !== MCP_TOOLS_PATH &&
    path !== MCP_CALL_PATH &&
    path !== MCP_RESOURCES_PATH &&
    path !== MCP_RESOURCE_PATH &&
    path !== MCP_PROMPTS_PATH &&
    path !== MCP_PROMPT_PATH
  ) {
    return false;
  }

  if (request.method !== 'POST') {
    sendJson(request, response, 405, { error: 'Method not allowed' }, allowedOrigins);
    return true;
  }

  try {
    switch (path) {
      case MCP_TOOLS_PATH:
        await handleListTools(request, response, allowedOrigins, mcpClient, options);
        break;
      case MCP_CALL_PATH:
        await handleCallTool(request, response, allowedOrigins, mcpClient, options);
        break;
      case MCP_RESOURCES_PATH:
        await handleListResources(request, response, allowedOrigins, mcpClient, options);
        break;
      case MCP_RESOURCE_PATH:
        await handleReadResource(request, response, allowedOrigins, mcpClient, options);
        break;
      case MCP_PROMPTS_PATH:
        await handleListPrompts(request, response, allowedOrigins, mcpClient, options);
        break;
      case MCP_PROMPT_PATH:
        await handleGetPrompt(request, response, allowedOrigins, mcpClient, options);
        break;
    }
  } catch (error) {
    if (error instanceof SyntaxError) {
      sendJson(request, response, 400, { error: error.message }, allowedOrigins);
      return true;
    }

    if (error instanceof Error && error.name === 'HttpError') {
      sendJson(request, response, 413, { error: error.message }, allowedOrigins);
      return true;
    }

    console.error('[mcp] request failed:', error);
    sendJson(request, response, 500, { error: 'MCP request failed.' }, allowedOrigins);
  }

  return true;
};
