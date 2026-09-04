import type { McpServerCapabilities } from '@/services/api/mcpApi';
import type { McpStatus, McpServerState } from '@/stores/mcpStatusStore';

export type DeriveStatusResult = Pick<McpStatus, 'state' | 'lastError' | 'version'> & {
  lastCheckedAt: number;
};

/**
 * Derives MCP server state from capabilities / error / enabled flag.
 * Priority: disabled > error > connected > connecting
 */
export const deriveStatus = (
  cap: McpServerCapabilities | null,
  error: string | null,
  enabled: boolean,
): DeriveStatusResult => {
  const now = Date.now();
  if (!enabled) {
    return { state: 'disabled' as McpServerState, lastCheckedAt: now };
  }
  if (error) {
    return { state: 'error' as McpServerState, lastError: error, lastCheckedAt: now };
  }
  if (cap) {
    const version = typeof cap.version === 'string' ? cap.version : undefined;
    return {
      state: 'connected' as McpServerState,
      lastCheckedAt: now,
      ...(version ? { version } : {}),
    };
  }
  return { state: 'connecting' as McpServerState, lastCheckedAt: now };
};
