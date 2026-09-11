import type { ChatMessage } from '@/types';
import type { FunctionCall, Part } from '@google/genai';

const isVisibleChatMessage = (message: ChatMessage): boolean => !message.isInternalToolMessage;

export const getVisibleChatMessages = (messages: ChatMessage[]): ChatMessage[] => messages.filter(isVisibleChatMessage);

export const isMcpInternalMessage = (m: ChatMessage) => !!m.isInternalToolMessage && !!m.toolParentMessageId;

export const getMcpToolPairs = (messages: ChatMessage[]) => {
  const byParent = new Map<string, { calls: FunctionCall[]; responses: Part[] }>();
  for (const m of messages)
    if (isMcpInternalMessage(m)) {
      const pid = m.toolParentMessageId!;
      if (!byParent.has(pid)) byParent.set(pid, { calls: [], responses: [] });
      const bucket = byParent.get(pid)!;
      for (const p of m.apiParts ?? []) {
        if (p.functionCall) bucket.calls.push(p.functionCall);
        if (p.functionResponse) bucket.responses.push(p as Part);
      }
    }
  return Array.from(byParent.entries()).map(([parentId, v]) => ({ parentId, ...v }));
};

/**
 * Filters out incomplete internal tool messages (e.g. from aborted or errored tool runs).
 * An internal model tool-call message must have a corresponding internal user tool-response message.
 * If targetParentId is specified, only prunes dangling messages associated with that parent.
 */
export const pruneDanglingInternalToolMessages = (messages: ChatMessage[], targetParentId?: string): ChatMessage[] => {
  const result: ChatMessage[] = [];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.isInternalToolMessage && (!targetParentId || msg.toolParentMessageId === targetParentId)) {
      if (msg.role === 'model') {
        const nextMsg = messages[i + 1];
        const hasMatchingResponse =
          nextMsg &&
          nextMsg.isInternalToolMessage &&
          nextMsg.toolParentMessageId === msg.toolParentMessageId &&
          nextMsg.role === 'user';
        if (!hasMatchingResponse) {
          // Dangling function call without matching function response - drop it
          continue;
        }
      } else if (msg.role === 'user') {
        const prevMsg = result[result.length - 1];
        const hasMatchingCall =
          prevMsg &&
          prevMsg.isInternalToolMessage &&
          prevMsg.toolParentMessageId === msg.toolParentMessageId &&
          prevMsg.role === 'model';
        if (!hasMatchingCall) {
          // Dangling function response without preceding function call - drop it
          continue;
        }
      }
    }
    result.push(msg);
  }
  return result;
};
