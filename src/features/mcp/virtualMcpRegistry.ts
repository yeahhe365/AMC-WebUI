import type { McpToolDefinition, McpToolProgressEvent } from '@/services/api/mcpApi';

export interface VirtualMcpServer {
  id: string;
  name: string;
  description: string;
  listTools: () => Promise<McpToolDefinition[]>;
  callTool: (
    toolName: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
    onProgress?: (event: McpToolProgressEvent) => void,
  ) => Promise<unknown>;
}

const virtualServersMap = new Map<string, VirtualMcpServer>();

export function registerVirtualMcpServer(server: VirtualMcpServer): () => void {
  virtualServersMap.set(server.id, server);
  return () => {
    if (virtualServersMap.get(server.id) === server) {
      virtualServersMap.delete(server.id);
    }
  };
}

export function getVirtualMcpServers(): VirtualMcpServer[] {
  return Array.from(virtualServersMap.values());
}

export function findVirtualMcpServer(id: string): VirtualMcpServer | undefined {
  return virtualServersMap.get(id);
}

export function clearVirtualMcpServers(): void {
  virtualServersMap.clear();
}
