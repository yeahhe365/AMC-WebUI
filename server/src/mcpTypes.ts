import type { McpServerConfig } from '../../shared/mcpServerConfig.js';

export type { McpServerConfig } from '../../shared/mcpServerConfig.js';

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface McpResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  size?: number;
}

export interface McpResourceTemplate {
  uriTemplate: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface McpPromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

export interface McpPrompt {
  name: string;
  description?: string;
  arguments?: McpPromptArgument[];
}

export type McpLogLevel = 'debug' | 'info' | 'warn' | 'error' | 'stderr';

export interface McpLogEntry {
  level: McpLogLevel;
  message: string;
  timestamp: number;
}

/** Payload of an MCP progress notification for a running tool call. */
export interface McpToolProgressUpdate {
  progress?: number;
  total?: number;
  message?: string;
}

export interface McpClientBridge {
  listTools(server: McpServerConfig): Promise<McpTool[]>;
  callTool(
    server: McpServerConfig,
    toolName: string,
    args: Record<string, unknown>,
    onProgress?: (update: McpToolProgressUpdate) => void,
  ): Promise<unknown>;
  listResources?(server: McpServerConfig): Promise<McpResource[]>;
  listResourceTemplates?(server: McpServerConfig): Promise<McpResourceTemplate[]>;
  listResourcesAndTemplates?(server: McpServerConfig): Promise<{
    resources: McpResource[];
    resourceTemplates: McpResourceTemplate[];
  }>;
  readResource?(server: McpServerConfig, uri: string): Promise<unknown>;
  listPrompts?(server: McpServerConfig): Promise<McpPrompt[]>;
  getPrompt?(server: McpServerConfig, promptName: string, args: Record<string, string>): Promise<unknown>;
  /** Close pooled sessions (stdio children / HTTP connections). */
  dispose?(): Promise<void>;
  getLogs?(serverId: string): McpLogEntry[];
  appendLog?(serverId: string, level: McpLogLevel, message: string): void;
  hasLogs?(serverId: string): boolean;
}
