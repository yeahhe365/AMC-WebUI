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

/**
 * Whether calling `toolName` on `server` must be confirmed by the user first.
 *
 * Approval is the default: a tool has to be named in `autoApproveTools` to run
 * without asking. The previous rule was the inverse — only tools explicitly
 * listed in `disabledAutoApproveTools` asked, so every imported server, every
 * newly added server and every built-in virtual tool ran silently. That made
 * the README's "human-in-the-loop authorization before external MCP tool
 * calls" false for the common case.
 *
 * `disabledAutoApproveTools` is still honoured and wins over the allowlist, so
 * a server configured under the old rule keeps gating exactly what it gated.
 */
export const requiresApproval = (server: McpServerConfig, toolName: string): boolean => {
  if ((server.disabledAutoApproveTools ?? []).includes(toolName)) {
    return true;
  }
  return !(server.autoApproveTools ?? []).includes(toolName);
};

export const isSessionApproved = (key: string): boolean => sessionApproved.has(key);

/**
 * Synchronous "will this call ask the user right now?" check.
 *
 * Callers use it to skip the gate entirely when nothing has to be asked, so an
 * approved tool starts its run in the same tick as the tool call. Awaiting an
 * always-resolved promise instead would defer every ungated call by a microtask
 * and detach the live run card from the run.
 */
export const needsApprovalNow = (server: McpServerConfig, toolName: string): boolean =>
  requiresApproval(server, toolName) && !isSessionApproved(sessionApprovalKey(server.id, toolName));

export const rememberSessionApproval = (key: string): void => {
  sessionApproved.add(key);
};

export const resetSessionApprovals = (): void => {
  sessionApproved.clear();
};
