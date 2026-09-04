import { toMcpFunctionName } from './mcpToolNames';

export interface McpToolDisplayInfo {
  serverId: string;
  serverName: string;
  toolName: string;
}

export interface DiscoveredToolsPayload {
  servers: Array<{
    serverId: string;
    serverName: string;
    tools: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }>;
  }>;
  errors?: Array<{
    serverId: string;
    serverName: string;
    error: string;
  }>;
}

// Wire names are deterministic ((serverId, toolName) -> hashed function
// name), so each discovery response can be replayed into a lookup that turns
// opaque names like mcp_filesystem_read_file_a3f82c10 back into
// "Filesystem : read_file" at render time.
const registry = new Map<string, McpToolDisplayInfo>();

export const rememberDiscoveredTools = (response: DiscoveredToolsPayload): void => {
  for (const server of response.servers) {
    for (const tool of server.tools) {
      registry.set(toMcpFunctionName(server.serverId, tool.name), {
        serverId: server.serverId,
        serverName: server.serverName,
        toolName: tool.name,
      });
    }
  }
};

export const resolveToolDisplay = (wireName: string): McpToolDisplayInfo | undefined => registry.get(wireName);

/** Test seam: keeps suites independent from production discovery traffic. */
export const resetToolDisplayRegistry = (): void => {
  registry.clear();
};
