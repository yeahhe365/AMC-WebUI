import type { McpServerConfig, McpServerTransport } from '@/types';
import {
  isValidMcpHttpUrl,
  sanitizeMcpTimeout,
  sanitizeStringArray,
  sanitizeStringRecord,
} from '../../../shared/mcpServerConfig';
import { isRecord } from '../../../shared/predicates';

interface AddMcpServerPayload {
  id?: string;
  name: string;
  transport: McpServerTransport;
  url?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  headers?: Record<string, string>;
  bearerToken?: string;
  timeout?: number;
  longRunning?: boolean;
  enabled?: boolean;
  isTrusted?: boolean;
  disabledTools?: string[];
  disabledAutoApproveTools?: string[];
}

interface UpdateMcpServerPayload {
  name?: string;
  url?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  headers?: Record<string, string>;
  bearerToken?: string;
  timeout?: number;
  longRunning?: boolean;
  enabled?: boolean;
  isTrusted?: boolean;
  disabledTools?: string[];
  disabledAutoApproveTools?: string[];
}

export const slugifyName = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'server';

export const generateUniqueServerId = (name: string, existingIds: Iterable<string>): string => {
  const base = `mcp_${slugifyName(name)}`;
  const ids = new Set(existingIds);
  if (!ids.has(base)) return base;

  let counter = 2;
  while (ids.has(`${base}_${counter}`)) {
    counter += 1;
  }
  return `${base}_${counter}`;
};

export const validateAndBuildNewServer = (
  payload: Partial<AddMcpServerPayload> | unknown,
  existingServers: McpServerConfig[],
): { server?: McpServerConfig; error?: string } => {
  if (!isRecord(payload)) {
    return { error: 'Payload must be an object.' };
  }

  const name = typeof payload.name === 'string' ? payload.name.trim() : '';
  if (!name) {
    return { error: 'Server name is required and cannot be empty.' };
  }

  const transport = payload.transport;
  if (transport !== 'http' && transport !== 'sse' && transport !== 'stdio') {
    return { error: "Transport must be one of: 'http', 'sse', 'stdio'." };
  }

  const existingIds = new Set(existingServers.map((s) => s.id));
  let id = typeof payload.id === 'string' && payload.id.trim() ? payload.id.trim() : '';
  if (id) {
    if (existingIds.has(id)) {
      return { error: `Server with id "${id}" already exists.` };
    }
  } else {
    id = generateUniqueServerId(name, existingIds);
  }

  const server: McpServerConfig = {
    id,
    name,
    transport,
    enabled: payload.enabled !== false,
  };

  if (transport === 'http' || transport === 'sse') {
    const url = typeof payload.url === 'string' ? payload.url.trim() : '';
    if (!url) {
      return { error: `URL is required for transport "${transport}".` };
    }
    if (!isValidMcpHttpUrl(url)) {
      return { error: `Invalid HTTP/HTTPS URL: "${url}".` };
    }
    server.url = url;

    const headers = sanitizeStringRecord(payload.headers);
    if (headers) server.headers = headers;

    const bearerToken = typeof payload.bearerToken === 'string' ? payload.bearerToken.trim() : '';
    if (bearerToken) {
      server.auth = { type: 'bearer', token: bearerToken };
    } else {
      server.auth = { type: 'none' };
    }
  }

  if (transport === 'stdio') {
    const command = typeof payload.command === 'string' ? payload.command.trim() : '';
    if (!command) {
      return { error: 'Command is required for stdio transport.' };
    }
    server.command = command;

    const args = sanitizeStringArray(payload.args);
    if (args) server.args = args;

    const env = sanitizeStringRecord(payload.env);
    if (env) server.env = env;
  }

  const timeout = sanitizeMcpTimeout(payload.timeout);
  if (timeout !== undefined) server.timeout = timeout;

  if (typeof payload.longRunning === 'boolean') {
    server.longRunning = payload.longRunning;
  }

  if (typeof payload.isTrusted === 'boolean') {
    server.isTrusted = payload.isTrusted;
  } else {
    server.isTrusted = true;
  }

  const disabledTools = sanitizeStringArray(payload.disabledTools);
  if (disabledTools) server.disabledTools = disabledTools;

  const disabledAutoApproveTools = sanitizeStringArray(payload.disabledAutoApproveTools);
  if (disabledAutoApproveTools) server.disabledAutoApproveTools = disabledAutoApproveTools;

  return { server };
};

export const applyMcpServerUpdate = (
  server: McpServerConfig,
  patch: Partial<UpdateMcpServerPayload> | unknown,
): { updatedServer?: McpServerConfig; error?: string } => {
  if (!isRecord(patch)) {
    return { error: 'Patch must be an object.' };
  }

  const updated: McpServerConfig = { ...server };

  if (typeof patch.name === 'string' && patch.name.trim()) {
    updated.name = patch.name.trim();
  }

  if (typeof patch.enabled === 'boolean') {
    updated.enabled = patch.enabled;
  }

  if (updated.transport === 'http' || updated.transport === 'sse') {
    if (typeof patch.url === 'string' && patch.url.trim()) {
      const trimmedUrl = patch.url.trim();
      if (!isValidMcpHttpUrl(trimmedUrl)) {
        return { error: `Invalid HTTP/HTTPS URL: "${trimmedUrl}".` };
      }
      updated.url = trimmedUrl;
    }

    if (patch.headers !== undefined) {
      const headers = sanitizeStringRecord(patch.headers);
      updated.headers = headers;
    }

    if (typeof patch.bearerToken === 'string') {
      const token = patch.bearerToken.trim();
      updated.auth = token ? { type: 'bearer', token } : { type: 'none' };
    }
  }

  if (updated.transport === 'stdio') {
    if (typeof patch.command === 'string' && patch.command.trim()) {
      updated.command = patch.command.trim();
    }

    if (patch.args !== undefined) {
      updated.args = sanitizeStringArray(patch.args);
    }

    if (patch.env !== undefined) {
      updated.env = sanitizeStringRecord(patch.env);
    }
  }

  if (patch.timeout !== undefined) {
    updated.timeout = sanitizeMcpTimeout(patch.timeout);
  }

  if (typeof patch.longRunning === 'boolean') {
    updated.longRunning = patch.longRunning;
  }

  if (typeof patch.isTrusted === 'boolean') {
    updated.isTrusted = patch.isTrusted;
  }

  if (patch.disabledTools !== undefined) {
    updated.disabledTools = sanitizeStringArray(patch.disabledTools);
  }

  if (patch.disabledAutoApproveTools !== undefined) {
    updated.disabledAutoApproveTools = sanitizeStringArray(patch.disabledAutoApproveTools);
  }

  return { updatedServer: updated };
};
