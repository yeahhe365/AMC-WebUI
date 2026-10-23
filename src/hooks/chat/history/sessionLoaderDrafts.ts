import type { ChatMessage, SavedChatSession, UploadedFile } from '@/types';
import { releaseManagedObjectUrlsByOwner } from '@/services/objectUrlManager';

export const DEFAULT_MAX_RETAINED_RUNTIME_SESSIONS = 3;

export const toSessionMetadata = (session: SavedChatSession): SavedChatSession => ({ ...session, messages: [] });

export const touchRecentSessionId = (recentSessionIds: string[], sessionId: string): string[] => {
  if (!sessionId) return recentSessionIds;
  return [sessionId, ...recentSessionIds.filter((id) => id !== sessionId)];
};

export interface RetainRuntimeSessionOptions {
  maxRetained?: number;
  recentSessionIds?: string[];
  protectedSessionIds?: Set<string> | string[];
}

export const retainRuntimeSession = (
  sessions: SavedChatSession[],
  activeSessionId: string,
  runtimeSession: SavedChatSession,
  options?: RetainRuntimeSessionOptions,
): SavedChatSession[] => {
  const exists = sessions.some((session) => session.id === activeSessionId);

  const baseRetained = exists
    ? sessions.map((session) =>
        session.id === activeSessionId ? { ...session, ...runtimeSession, messages: runtimeSession.messages } : session,
      )
    : [runtimeSession, ...sessions];

  const maxRetained = options?.maxRetained ?? DEFAULT_MAX_RETAINED_RUNTIME_SESSIONS;
  const sessionsWithMessages = baseRetained.filter((s) => s.messages && s.messages.length > 0);

  if (sessionsWithMessages.length <= maxRetained) {
    return baseRetained;
  }

  const protectedSet = new Set(options?.protectedSessionIds ? Array.from(options.protectedSessionIds) : []);
  protectedSet.add(activeSessionId);

  const recentOrder = options?.recentSessionIds ?? [];
  const getRecencyScore = (sessionId: string) => {
    const idx = recentOrder.indexOf(sessionId);
    return idx >= 0 ? idx : Number.POSITIVE_INFINITY;
  };

  const candidates = sessionsWithMessages.filter((s) => !protectedSet.has(s.id));
  candidates.sort((a, b) => {
    const scoreA = getRecencyScore(a.id);
    const scoreB = getRecencyScore(b.id);
    if (scoreA !== scoreB) {
      return scoreB - scoreA;
    }
    return (a.timestamp ?? 0) - (b.timestamp ?? 0);
  });

  const excessCount = sessionsWithMessages.length - maxRetained;
  const evictIds = new Set(candidates.slice(0, excessCount).map((s) => s.id));

  if (evictIds.size === 0) {
    return baseRetained;
  }

  return baseRetained.map((session) => {
    if (evictIds.has(session.id)) {
      cleanupSessionFilePreviews(session);
      return { ...session, messages: [] };
    }
    return session;
  });
};

export const storeSessionDraftFiles = (
  fileDrafts: Record<string, UploadedFile[]>,
  sessionId: string,
  selectedFiles: UploadedFile[],
) => {
  fileDrafts[sessionId] = selectedFiles;
};

export const clearSessionDraftFiles = (fileDrafts: Record<string, UploadedFile[]>, sessionId: string) => {
  fileDrafts[sessionId] = [];
};

export const getSessionDraftFiles = (fileDrafts: Record<string, UploadedFile[]>, sessionId: string) =>
  fileDrafts[sessionId] || [];

export const cleanupSessionFilePreviews = (session?: SavedChatSession) => {
  if (!session) return;
  const uploadUrls = new Set<string>();
  const collectUrls = (message: ChatMessage) => {
    message.files?.forEach((file) => {
      if (file.dataUrl) uploadUrls.add(file.dataUrl);
    });
    message.variants?.forEach(collectUrls);
  };
  session.messages.forEach(collectUrls);
  releaseManagedObjectUrlsByOwner(`session:${session.id}`, uploadUrls);
};
