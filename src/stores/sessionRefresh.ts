import type { SavedChatSession } from '@/types';
import { sanitizeSessionModel, shouldRetainRuntimeMessages, sortSessionsInPlace } from './sessionModels';

interface MergeSessionMetadataOptions {
  activeSessionId: string | null;
  loadingSessionIds: Set<string>;
}

export function mergeSessionMetadata(
  previousSessions: SavedChatSession[],
  metadataList: SavedChatSession[],
  { activeSessionId, loadingSessionIds }: MergeSessionMetadataOptions,
): SavedChatSession[] {
  const sanitizedMetadata = metadataList.map((session) => sanitizeSessionModel(session));
  sortSessionsInPlace(sanitizedMetadata);

  const previousById = new Map(previousSessions.map((session) => [session.id, session]));
  const merged = sanitizedMetadata.map((session) => {
    const existing = previousById.get(session.id);

    if (!existing) {
      return session;
    }

    previousById.delete(session.id);

    const keepRuntimeMessages = shouldRetainRuntimeMessages(session.id, activeSessionId, loadingSessionIds);

    // The refreshed metadata comes from the DB and is the source of truth for
    // everything except in-flight runtime state. Spreading existing (in-memory)
    // after session (DB) would silently revert remote edits such as group
    // moves, pin toggles, renames and deletes on the other tab.
    return {
      ...existing,
      ...session,
      settings: {
        ...existing.settings,
        ...session.settings,
      },
      messages: keepRuntimeMessages ? existing.messages : [],
    };
  });

  // Sessions absent from the refreshed metadata were deleted on another tab.
  // Only keep those with in-flight runtime work (active / loading); everything
  // else would otherwise resurrect the deleted session in the sidebar.
  const retainedRuntimeSessions = [...previousById.values()].filter((session) =>
    shouldRetainRuntimeMessages(session.id, activeSessionId, loadingSessionIds),
  );
  const nextSessions = [...merged, ...retainedRuntimeSessions];
  sortSessionsInPlace(nextSessions);
  return nextSessions;
}
