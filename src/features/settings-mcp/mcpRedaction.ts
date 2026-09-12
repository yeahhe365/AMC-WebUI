import type { McpServerConfig } from '@/types';
import type { VirtualMcpServer } from '@/features/mcp/virtualMcpRegistry';

export interface SanitizedMcpServerSummary {
  id: string;
  name: string;
  transport: McpServerConfig['transport'];
  enabled: boolean;
  url?: string;
  command?: string;
  args?: string[];
  envVarNames?: string[];
  headerNames?: string[];
  hasAuth: boolean;
  authType?: string;
  maskedToken?: string | null;
  isTrusted?: boolean;
  timeout?: number;
  longRunning?: boolean;
  disabledTools?: string[];
}

export interface SanitizedVirtualMcpServerSummary {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  isVirtual: true;
  disabledAutoApproveTools?: string[];
}

export const maskSecret = (secret: string | undefined): string | null => {
  if (!secret || typeof secret !== 'string') return null;
  const trimmed = secret.trim();
  if (!trimmed) return null;
  if (trimmed.length <= 6) return '***';
  return `${trimmed.slice(0, 3)}****${trimmed.slice(-3)}`;
};

export const toMcpServerSummary = (server: McpServerConfig): SanitizedMcpServerSummary => {
  const summary: SanitizedMcpServerSummary = {
    id: server.id,
    name: server.name,
    transport: server.transport,
    enabled: server.enabled,
    hasAuth: Boolean(server.auth?.token?.trim()),
    isTrusted: server.isTrusted,
    timeout: server.timeout,
    longRunning: server.longRunning,
    disabledTools: server.disabledTools,
  };

  if (server.transport === 'http' || server.transport === 'sse') {
    summary.url = server.url;
    if (server.headers) {
      summary.headerNames = Object.keys(server.headers);
    }
    if (server.auth) {
      summary.authType = server.auth.type;
      summary.maskedToken = maskSecret(server.auth.token);
    }
  }

  if (server.transport === 'stdio') {
    summary.command = server.command;
    summary.args = server.args;
    if (server.env) {
      summary.envVarNames = Object.keys(server.env);
    }
  }

  return summary;
};

export const toVirtualMcpServerSummary = (
  vServer: VirtualMcpServer,
  isEnabled: boolean,
): SanitizedVirtualMcpServerSummary => ({
  id: vServer.id,
  name: vServer.name,
  description: vServer.description,
  enabled: isEnabled,
  isVirtual: true,
  disabledAutoApproveTools: vServer.disabledAutoApproveTools,
});
