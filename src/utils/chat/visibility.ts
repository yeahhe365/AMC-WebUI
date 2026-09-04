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
