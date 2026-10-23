import type { ChatMessage, SavedChatSession } from '@/types';
import { shouldRetainRuntimeMessages } from '@/stores/sessionModels';

interface SessionPersistenceChanges {
  modifiedSessions: SavedChatSession[];
  deletedSessionIds: string[];
}

export function createVirtualFullSessions(
  savedSessions: SavedChatSession[],
  activeSessionId: string | null,
  activeMessages: ChatMessage[],
): SavedChatSession[] {
  return savedSessions.map((session) => {
    if (session.id === activeSessionId) {
      return { ...session, messages: activeMessages };
    }

    return session;
  });
}

export function getSessionPersistenceChanges(
  previousSessions: SavedChatSession[],
  nextSessions: SavedChatSession[],
): SessionPersistenceChanges {
  const previousSessionsById = new Map(previousSessions.map((session) => [session.id, session]));
  const nextSessionsById = new Map(nextSessions.map((session) => [session.id, session]));
  const modifiedSessions = nextSessions.filter((session) => {
    const previousSession = previousSessionsById.get(session.id);
    return previousSession !== session;
  });
  const deletedSessionIds = previousSessions
    .filter((session) => !nextSessionsById.has(session.id))
    .map((session) => session.id);

  return {
    modifiedSessions,
    deletedSessionIds,
  };
}

export function mergePersistedSessionMessages(
  session: SavedChatSession,
  persistedSession: SavedChatSession | null | undefined,
): SavedChatSession {
  if (!persistedSession) {
    return session;
  }

  return {
    ...persistedSession,
    ...session,
    settings: { ...persistedSession.settings, ...session.settings },
    messages: persistedSession.messages,
  };
}

export function stripStoredSessionMessages(
  sessions: SavedChatSession[],
  activeSessionId: string | null,
  loadingSessionIds: Set<string>,
): SavedChatSession[] {
  return sessions.map((session) =>
    session.messages &&
    session.messages.length > 0 &&
    !shouldRetainRuntimeMessages(session.id, activeSessionId, loadingSessionIds)
      ? { ...session, messages: [] }
      : session,
  );
}
