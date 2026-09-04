import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { getDefaultEnvironment, StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { assertMcpHttpUrlAllowed, createSafeMcpFetch, type FetchLike } from './mcpHttpSecurity.js';
import { redactSensitiveText } from './mcpRedact.js';
import { sanitizeMcpTimeout } from '../../shared/mcpServerConfig.js';
import type {
  McpClientBridge,
  McpLogEntry,
  McpLogLevel,
  McpPrompt,
  McpResource,
  McpResourceTemplate,
  McpServerConfig,
  McpTool,
} from './mcpTypes.js';

const MCP_REQUEST_TIMEOUT_MS = 60_000;
const SESSION_IDLE_MS = 5 * 60_000;
const MAX_POOLED_SESSIONS = 16;
/** Reused sessions idle longer than this get a liveness ping before reuse. */
const SESSION_PING_AFTER_MS = 30_000;
const SESSION_PING_TIMEOUT_MS = 5_000;
/** Total ceiling for long-running tool calls that keep receiving progress. */
const LONG_RUNNING_MAX_TOTAL_TIMEOUT_MS = 10 * 60_000;

/** Tool calls honor a per-server timeout (seconds); defaults to the global 60s. */
const callToolTimeoutMs = (server: McpServerConfig): number => {
  const configured = sanitizeMcpTimeout(server.timeout);
  return (configured ?? MCP_REQUEST_TIMEOUT_MS / 1000) * 1000;
};

/** A larger per-server timeout also raises the connect handshake ceiling. */
const connectTimeoutMs = (server: McpServerConfig): number =>
  Math.max(MCP_REQUEST_TIMEOUT_MS, (sanitizeMcpTimeout(server.timeout) ?? 0) * 1000);

// ponytail: synced from package.json so clientInfo stays current; clientInfo is
// informational only, so degrade to 0.0.0 instead of crashing on a missing file
const APP_VERSION = (() => {
  try {
    const { version } = JSON.parse(readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
    return typeof version === 'string' ? version : '0.0.0';
  } catch {
    return '0.0.0';
  }
})();

interface McpClientBridgeOptions {
  allowPrivateHttp?: boolean;
  fetchImpl?: FetchLike;
  /** Override idle eviction for tests. */
  sessionIdleMs?: number;
  /** Override the idle threshold before a reused session gets a liveness ping (tests). */
  sessionPingAfterMs?: number;
}

type HttpTransportKind = 'streamable' | 'sse';

interface PooledSession {
  key: string;
  client: Client;
  transport: Transport;
  lastUsed: number;
}

const isUnsupportedMethodError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return /method not found|not (?:found|supported)|-32601|does not support/i.test(message);
};

function createHttpHeaders(server: McpServerConfig): Record<string, string> | undefined {
  const headers = { ...(server.headers ?? {}) };
  const bearerToken = server.auth?.type === 'bearer' ? server.auth.token?.trim() : '';

  if (bearerToken) {
    headers.Authorization = `Bearer ${bearerToken}`;
  }

  return Object.keys(headers).length > 0 ? headers : undefined;
}

/**
 * Stable identity of a server's connection config, hashed so bearer tokens,
 * headers, and env values are never retained in memory as plaintext map keys.
 */
export const mcpConfigFingerprint = (server: McpServerConfig): string =>
  createHash('sha256')
    .update(
      JSON.stringify({
        id: server.id,
        transport: server.transport,
        command: server.command ?? null,
        args: server.args ?? null,
        env: server.env ?? null,
        url: server.url ?? null,
        headers: server.headers ?? null,
        auth: server.auth ?? null,
      }),
    )
    .digest('hex');

function poolKey(server: McpServerConfig): string {
  return mcpConfigFingerprint(server);
}

function createStdioTransport(server: McpServerConfig): Transport {
  if (!server.command?.trim()) {
    throw new Error('MCP stdio server command is required.');
  }

  return new StdioClientTransport({
    command: server.command,
    args: server.args ?? [],
    env: server.env ? { ...getDefaultEnvironment(), ...server.env } : undefined,
  });
}

function createHttpTransport(server: McpServerConfig, kind: HttpTransportKind, safeFetch: FetchLike): Transport {
  if (!server.url?.trim()) {
    throw new Error('MCP HTTP server URL is required.');
  }

  const headers = createHttpHeaders(server);
  const url = new URL(server.url);
  const requestInit = headers ? { headers } : undefined;

  if (kind === 'sse') {
    return new SSEClientTransport(url, {
      requestInit,
      fetch: safeFetch,
    });
  }

  return new StreamableHTTPClientTransport(url, {
    requestInit,
    fetch: safeFetch,
  });
}

async function connectClient(transport: Transport, timeoutMs: number = MCP_REQUEST_TIMEOUT_MS): Promise<Client> {
  const client = new Client({
    name: 'amc-webui',
    version: APP_VERSION,
  });
  try {
    await client.connect(transport, { timeout: timeoutMs });
    return client;
  } catch (error) {
    await closeTransportQuietly(client, transport);
    throw error;
  }
}

async function closeTransportQuietly(client: Client | undefined, transport: Transport | undefined): Promise<void> {
  if (client) {
    await client.close().catch((error) => {
      console.warn('[mcp] client.close() failed; subprocess may leak.', error);
    });
  }

  const candidate = transport as { subprocess?: { kill?: (signal?: string) => void } } | undefined;
  if (candidate?.subprocess?.kill) {
    try {
      candidate.subprocess.kill('SIGTERM');
    } catch {
      // best-effort cleanup
    }
  }
}

async function createConnectedSession(
  server: McpServerConfig,
  safeFetch: FetchLike,
  allowPrivateHttp: boolean,
): Promise<{ client: Client; transport: Transport }> {
  if (server.transport === 'stdio') {
    const transport = createStdioTransport(server);
    try {
      const client = await connectClient(transport, connectTimeoutMs(server));
      return { client, transport };
    } catch (error) {
      await closeTransportQuietly(undefined, transport);
      throw error;
    }
  }

  if (!server.url?.trim()) {
    throw new Error('MCP HTTP server URL is required.');
  }

  await assertMcpHttpUrlAllowed(server.url, allowPrivateHttp);

  const preferSse = server.transport === 'sse';
  const attempts: HttpTransportKind[] = preferSse ? ['sse'] : ['streamable', 'sse'];
  let lastError: unknown;

  for (const kind of attempts) {
    try {
      const transport = createHttpTransport(server, kind, safeFetch);
      const client = await connectClient(transport, connectTimeoutMs(server));
      return { client, transport };
    } catch (error) {
      lastError = error;
      // connectClient already closed the failed transport/client.
      // Only fall back from streamable → sse; if sse was explicit or last attempt, stop.
      if (kind === 'sse' || preferSse) {
        break;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Failed to connect to MCP server: ${String(lastError)}`);
}

function mapTool(tool: { name: string; description?: string; inputSchema: unknown }): McpTool {
  return {
    name: tool.name,
    ...(tool.description ? { description: tool.description } : {}),
    inputSchema: tool.inputSchema as Record<string, unknown>,
  };
}

function mapResource(resource: {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  size?: number;
}): McpResource {
  return {
    uri: resource.uri,
    name: resource.name,
    ...(resource.description ? { description: resource.description } : {}),
    ...(resource.mimeType ? { mimeType: resource.mimeType } : {}),
    ...(typeof resource.size === 'number' ? { size: resource.size } : {}),
  };
}

function mapResourceTemplate(template: {
  uriTemplate: string;
  name: string;
  description?: string;
  mimeType?: string;
}): McpResourceTemplate {
  return {
    uriTemplate: template.uriTemplate,
    name: template.name,
    ...(template.description ? { description: template.description } : {}),
    ...(template.mimeType ? { mimeType: template.mimeType } : {}),
  };
}

function mapPrompt(prompt: { name: string; description?: string; arguments?: McpPrompt['arguments'] }): McpPrompt {
  return {
    name: prompt.name,
    ...(prompt.description ? { description: prompt.description } : {}),
    ...(prompt.arguments ? { arguments: prompt.arguments } : {}),
  };
}

export const createMcpClientBridge = (options: McpClientBridgeOptions = {}): McpClientBridge => {
  const allowPrivateHttp = options.allowPrivateHttp ?? false;
  const safeFetch = createSafeMcpFetch(allowPrivateHttp, options.fetchImpl ?? fetch);
  const sessionIdleMs = options.sessionIdleMs ?? SESSION_IDLE_MS;
  const sessionPingAfterMs = options.sessionPingAfterMs ?? SESSION_PING_AFTER_MS;
  const sessions = new Map<string, PooledSession>();
  /** Per-key mutex chain so concurrent ops on the same server serialize. */
  const keyLocks = new Map<string, Promise<unknown>>();
  let evictionTimer: ReturnType<typeof setInterval> | undefined;

  const evictIdleSessions = (): void => {
    const now = Date.now();
    for (const [key, session] of sessions) {
      if (now - session.lastUsed >= sessionIdleMs) {
        sessions.delete(key);
        void closeTransportQuietly(session.client, session.transport);
      }
    }
    if (sessions.size === 0 && evictionTimer) {
      clearInterval(evictionTimer);
      evictionTimer = undefined;
    }
  };

  const ensureEvictionTimer = (): void => {
    if (evictionTimer || sessionIdleMs <= 0) {
      return;
    }
    evictionTimer = setInterval(evictIdleSessions, Math.min(sessionIdleMs, 60_000));
    // Allow the process to exit without waiting on the timer in Node.
    evictionTimer.unref?.();
  };

  const dispose = async (): Promise<void> => {
    if (evictionTimer) {
      clearInterval(evictionTimer);
      evictionTimer = undefined;
    }
    const closing = [...sessions.values()];
    sessions.clear();
    keyLocks.clear();
    logBuffers.clear();
    knownServerIds.clear();
    await Promise.all(closing.map((session) => closeTransportQuietly(session.client, session.transport)));
  };

  const logBuffers = new Map<string, McpLogEntry[]>();
  const knownServerIds = new Set<string>();
  const getErrorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));
  const appendLog = (serverId: string, level: McpLogLevel, rawMessage: string): void => {
    knownServerIds.add(serverId);
    const arr = logBuffers.get(serverId) ?? [];
    arr.push({ level, message: redactSensitiveText(rawMessage), timestamp: Date.now() });
    if (arr.length > 200) arr.splice(0, arr.length - 200);
    logBuffers.set(serverId, arr);
  };
  const getLogs = (serverId: string): McpLogEntry[] => [...(logBuffers.get(serverId) ?? [])];
  const hasLogs = (serverId: string): boolean => knownServerIds.has(serverId) || logBuffers.has(serverId);

  const withConnectedClient = async <T>(server: McpServerConfig, run: (client: Client) => Promise<T>): Promise<T> => {
    const key = poolKey(server);

    const runExclusive = async (): Promise<T> => {
      let session = sessions.get(key);
      if (session && sessionPingAfterMs >= 0 && Date.now() - session.lastUsed >= sessionPingAfterMs) {
        // Liveness check before trusting a pooled session that sat idle; a
        // stale stdio child or dead HTTP endpoint would otherwise fail the
        // real operation with a confusing error (Cherry Studio #18144).
        try {
          const ping = (session.client as { ping?: (opts?: { timeout?: number }) => Promise<unknown> }).ping;
          if (typeof ping === 'function') {
            await ping.call(session.client, { timeout: SESSION_PING_TIMEOUT_MS });
          }
        } catch {
          sessions.delete(key);
          await closeTransportQuietly(session.client, session.transport);
          session = undefined;
        }
      }
      if (!session) {
        // Evict oldest if at capacity.
        if (sessions.size >= MAX_POOLED_SESSIONS) {
          let oldestKey: string | undefined;
          let oldestTime = Infinity;
          for (const [entryKey, entry] of sessions) {
            if (entry.lastUsed < oldestTime) {
              oldestTime = entry.lastUsed;
              oldestKey = entryKey;
            }
          }
          if (oldestKey) {
            const evicted = sessions.get(oldestKey);
            sessions.delete(oldestKey);
            if (evicted) {
              await closeTransportQuietly(evicted.client, evicted.transport);
            }
          }
        }

        const connected = await createConnectedSession(server, safeFetch, allowPrivateHttp);
        session = {
          key,
          client: connected.client,
          transport: connected.transport,
          lastUsed: Date.now(),
        };
        sessions.set(key, session);
        ensureEvictionTimer();
        // Capture stdio stderr output for log buffer (I7)
        if (server.transport === 'stdio') {
          const t = connected.transport as unknown as {
            stderr?: { on?: (ev: string, cb: (c: Buffer | string) => void) => void };
            process?: { stderr?: { on?: (ev: string, cb: (c: Buffer | string) => void) => void } };
            subprocess?: { stderr?: { on?: (ev: string, cb: (c: Buffer | string) => void) => void } };
          };
          const maybeStderr = t.stderr ?? t.process?.stderr ?? t.subprocess?.stderr;
          if (maybeStderr?.on) {
            maybeStderr.on('data', (chunk: Buffer | string) => {
              const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
              for (const line of text.split('\n')) {
                const trimmed = line.trim();
                if (trimmed) appendLog(server.id, 'stderr', trimmed);
              }
            });
          }
        }
        knownServerIds.add(server.id);
      }

      try {
        const result = await run(session.client);
        session.lastUsed = Date.now();
        return result;
      } catch (error) {
        // Drop broken sessions so the next call reconnects.
        if (sessions.get(key) === session) {
          sessions.delete(key);
          await closeTransportQuietly(session.client, session.transport);
        }
        throw error;
      }
    };

    const previous = keyLocks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const chained = previous.finally(() => gate);
    keyLocks.set(key, chained);

    try {
      await previous.catch(() => undefined);
      return await runExclusive();
    } finally {
      release();
      // Drop the lock entry once the chain drains so the map does not grow
      // unbounded across unique server configs. A successor that queued
      // behind us replaces the entry first and keeps it alive.
      void chained.then(() => {
        if (keyLocks.get(key) === chained) {
          keyLocks.delete(key);
        }
      });
    }
  };

  return {
    listTools: async (server) => {
      try {
        const tools = await withConnectedClient(server, async (client) => {
          const tools: McpTool[] = [];
          let cursor: string | undefined;

          do {
            const result = await client.listTools(cursor ? { cursor } : undefined, { timeout: MCP_REQUEST_TIMEOUT_MS });
            tools.push(...result.tools.map(mapTool));
            cursor = result.nextCursor;
          } while (cursor);

          return tools;
        });
        knownServerIds.add(server.id);
        appendLog(server.id, 'info', `Listed ${tools.length} tools`);
        return tools;
      } catch (error) {
        appendLog(server.id, 'error', getErrorMessage(error));
        throw error;
      }
    },

    callTool: async (server, toolName, args, onProgress) => {
      try {
        const longRunning = server.longRunning === true;
        const result = await withConnectedClient(server, (client) =>
          client.callTool(
            {
              name: toolName,
              arguments: args,
            },
            undefined,
            {
              timeout: callToolTimeoutMs(server),
              resetTimeoutOnProgress: longRunning,
              ...(longRunning ? { maxTotalTimeout: LONG_RUNNING_MAX_TOTAL_TIMEOUT_MS } : {}),
              // Forwarding onprogress also makes the SDK attach a progress
              // token to the request, which is what prompts conforming
              // servers to emit notifications at all.
              ...(onProgress
                ? {
                    onprogress: (notification: { progress?: number; total?: number; message?: string }) =>
                      onProgress({
                        ...(typeof notification.progress === 'number' ? { progress: notification.progress } : {}),
                        ...(typeof notification.total === 'number' ? { total: notification.total } : {}),
                        ...(typeof notification.message === 'string' ? { message: notification.message } : {}),
                      }),
                  }
                : {}),
            },
          ),
        );
        knownServerIds.add(server.id);
        appendLog(server.id, 'info', `Called tool ${toolName} successfully`);
        return result;
      } catch (error) {
        appendLog(server.id, 'error', getErrorMessage(error));
        throw error;
      }
    },

    listResources: async (server) =>
      withConnectedClient(server, async (client) => {
        const resources: McpResource[] = [];
        let cursor: string | undefined;

        try {
          do {
            const result = await client.listResources(cursor ? { cursor } : undefined, {
              timeout: MCP_REQUEST_TIMEOUT_MS,
            });
            resources.push(...result.resources.map(mapResource));
            cursor = result.nextCursor;
          } while (cursor);
        } catch (error) {
          if (isUnsupportedMethodError(error)) {
            return [];
          }
          throw error;
        }

        return resources;
      }),

    listResourceTemplates: async (server) =>
      withConnectedClient(server, async (client) => {
        const resourceTemplates: McpResourceTemplate[] = [];
        let cursor: string | undefined;

        try {
          do {
            const result = await client.listResourceTemplates(cursor ? { cursor } : undefined, {
              timeout: MCP_REQUEST_TIMEOUT_MS,
            });
            resourceTemplates.push(...result.resourceTemplates.map(mapResourceTemplate));
            cursor = result.nextCursor;
          } while (cursor);
        } catch (error) {
          if (isUnsupportedMethodError(error)) {
            return [];
          }
          throw error;
        }

        return resourceTemplates;
      }),

    listResourcesAndTemplates: async (server) =>
      withConnectedClient(server, async (client) => {
        const resources: McpResource[] = [];
        let resourcesCursor: string | undefined;

        try {
          do {
            const result = await client.listResources(resourcesCursor ? { cursor: resourcesCursor } : undefined, {
              timeout: MCP_REQUEST_TIMEOUT_MS,
            });
            resources.push(...result.resources.map(mapResource));
            resourcesCursor = result.nextCursor;
          } while (resourcesCursor);
        } catch (error) {
          if (!isUnsupportedMethodError(error)) {
            throw error;
          }
          // Server has no resources capability — continue to templates.
        }

        const resourceTemplates: McpResourceTemplate[] = [];
        let templatesCursor: string | undefined;

        try {
          do {
            const result = await client.listResourceTemplates(
              templatesCursor ? { cursor: templatesCursor } : undefined,
              {
                timeout: MCP_REQUEST_TIMEOUT_MS,
              },
            );
            resourceTemplates.push(...result.resourceTemplates.map(mapResourceTemplate));
            templatesCursor = result.nextCursor;
          } while (templatesCursor);
        } catch (error) {
          if (!isUnsupportedMethodError(error)) {
            throw error;
          }
        }

        return { resources, resourceTemplates };
      }),

    readResource: async (server, uri) =>
      withConnectedClient(server, (client) => client.readResource({ uri }, { timeout: MCP_REQUEST_TIMEOUT_MS })),

    listPrompts: async (server) =>
      withConnectedClient(server, async (client) => {
        const prompts: McpPrompt[] = [];
        let cursor: string | undefined;

        try {
          do {
            const result = await client.listPrompts(cursor ? { cursor } : undefined, {
              timeout: MCP_REQUEST_TIMEOUT_MS,
            });
            prompts.push(...result.prompts.map(mapPrompt));
            cursor = result.nextCursor;
          } while (cursor);
        } catch (error) {
          if (isUnsupportedMethodError(error)) {
            return [];
          }
          throw error;
        }

        return prompts;
      }),

    getPrompt: async (server, promptName, args) =>
      withConnectedClient(server, (client) =>
        client.getPrompt(
          {
            name: promptName,
            arguments: args,
          },
          { timeout: MCP_REQUEST_TIMEOUT_MS },
        ),
      ),

    dispose,
    appendLog,
    getLogs,
    hasLogs,
  };
};
