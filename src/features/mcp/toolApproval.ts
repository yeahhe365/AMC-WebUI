import type { McpServerConfig } from '../../../shared/mcpServerConfig';

export type McpApprovalDecision = 'allow-once' | 'allow-session' | 'deny';

export interface McpApprovalRequest {
  serverId: string;
  serverName: string;
  toolName: string;
  args: Record<string, unknown>;
}

const sessionApproved = new Set<string>();

export const sessionApprovalKey = (serverId: string, toolName: string): string => `${serverId}::${toolName}`;

export const requiresApproval = (server: McpServerConfig, toolName: string): boolean =>
  (server.disabledAutoApproveTools ?? []).includes(toolName);

export const isSessionApproved = (key: string): boolean => sessionApproved.has(key);

export const rememberSessionApproval = (key: string): void => {
  sessionApproved.add(key);
};

export const resetSessionApprovals = (): void => {
  sessionApproved.clear();
};
