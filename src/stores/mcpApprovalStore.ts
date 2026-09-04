import { create } from 'zustand';
import type { McpApprovalDecision, McpApprovalRequest } from '@/features/mcp/toolApproval';

interface PendingMcpApproval {
  request: McpApprovalRequest;
  resolve: (decision: McpApprovalDecision) => void;
}

interface McpApprovalState {
  pending: PendingMcpApproval | null;
  openApproval: (request: McpApprovalRequest, resolve: (decision: McpApprovalDecision) => void) => void;
  resolveApproval: (decision: McpApprovalDecision) => void;
}

export const useMcpApprovalStore = create<McpApprovalState>((set, get) => ({
  pending: null,
  openApproval: (request, resolve) => set({ pending: { request, resolve } }),
  resolveApproval: (decision) => {
    const pending = get().pending;
    if (pending) {
      pending.resolve(decision);
    }
    set({ pending: null });
  },
}));

/**
 * Chat-path entry point: resolves 'deny' when the turn is aborted while the
 * dialog waits, so a cancelled send never leaves a dangling approval.
 */
export const requestToolApproval = (
  request: McpApprovalRequest,
  abortSignal?: AbortSignal,
): Promise<McpApprovalDecision> =>
  new Promise((resolve) => {
    let settled = false;
    const settle = (decision: McpApprovalDecision) => {
      if (settled) return;
      settled = true;
      abortSignal?.removeEventListener('abort', onAbort);
      resolve(decision);
    };
    const onAbort = () => settle('deny');
    abortSignal?.addEventListener('abort', onAbort, { once: true });
    if (abortSignal?.aborted) {
      settle('deny');
      return;
    }
    useMcpApprovalStore.getState().openApproval(request, settle);
  });
