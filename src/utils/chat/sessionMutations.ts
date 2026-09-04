import type { ChatMessage, SavedChatSession, UploadedFile } from '@/types';

type MessagePatchOrUpdater = Partial<ChatMessage> | ((message: ChatMessage) => ChatMessage);
type FilePatchOrUpdater = Partial<UploadedFile> | ((file: UploadedFile) => UploadedFile);

export const updateSessionById = (
  sessions: SavedChatSession[],
  sessionId: string,
  updater: (session: SavedChatSession) => SavedChatSession,
) => {
  let changed = false;
  const next = sessions.map((session) => {
    if (session.id !== sessionId) {
      return session;
    }
    const updated = updater(session);
    if (updated !== session) {
      changed = true;
    }
    return updated;
  });
  // Preserve the array identity when no session actually changed so callers —
  // the streaming hot path updates idempotently on every chunk — can skip the
  // store write and downstream re-renders entirely.
  return changed ? next : sessions;
};

export const updateMessageInSession = (
  sessions: SavedChatSession[],
  sessionId: string,
  messageId: string,
  updater: MessagePatchOrUpdater,
) =>
  updateSessionById(sessions, sessionId, (session) => {
    let messageChanged = false;
    const messages = session.messages.map((message) => {
      if (message.id !== messageId) {
        return message;
      }
      const updated =
        typeof updater === 'function'
          ? updater(message)
          : // Object patch: only rebuild when a provided key's value actually
            // differs, so an idempotent patch (the streaming hot path re-applies
            // the same thinkingSource/resume stamp every chunk) keeps the
            // message reference and lets the outer short-circuit skip the write.
            Object.keys(updater).some((key) => message[key as keyof ChatMessage] !== updater[key as keyof ChatMessage])
            ? { ...message, ...updater }
            : message;
      if (updated !== message) {
        messageChanged = true;
      }
      return updated;
    });
    // Preserve the session reference when no message actually changed so the
    // outer updateSessionById short-circuit can pass the whole array through.
    return messageChanged ? { ...session, messages } : session;
  });

export const updateFileInMessage = (
  sessions: SavedChatSession[],
  sessionId: string,
  messageId: string,
  fileId: string,
  updater: FilePatchOrUpdater,
) =>
  updateMessageInSession(sessions, sessionId, messageId, (message) =>
    message.files
      ? {
          ...message,
          files: message.files.map((file) => {
            if (file.id !== fileId) {
              return file;
            }

            return typeof updater === 'function' ? updater(file) : { ...file, ...updater };
          }),
        }
      : message,
  );

export const insertMessageAfter = (
  sessions: SavedChatSession[],
  sessionId: string,
  sourceMessageId: string,
  message: ChatMessage,
) =>
  updateSessionById(sessions, sessionId, (session) => {
    const sourceIndex = session.messages.findIndex((candidate) => candidate.id === sourceMessageId);
    const insertIndex = sourceIndex !== -1 ? sourceIndex + 1 : session.messages.length;
    const messages = [...session.messages];
    messages.splice(insertIndex, 0, message);

    return {
      ...session,
      messages,
    };
  });
