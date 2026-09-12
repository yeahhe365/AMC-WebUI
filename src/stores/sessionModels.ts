import { normalizeProviderId, type ChatSettings, type SavedChatSession } from '@/types';
import { DEFAULT_MODEL_ID } from '@/constants/modelConfiguration';
import { resolveSupportedModelId } from '@/utils/model/modelSorting';

/**
 * 会话显示顺序的唯一权威比较器：pinned 优先 → 桶内手动顺序 → timestamp 倒序。
 * 只应在同一个桶（groupId ?? null）内比较 —— sortOrder 是桶内坐标。
 */
export function compareSessionOrder(
  leftSession: Pick<SavedChatSession, 'isPinned' | 'timestamp' | 'sortOrder'>,
  rightSession: Pick<SavedChatSession, 'isPinned' | 'timestamp' | 'sortOrder'>,
): number {
  if (!!leftSession.isPinned !== !!rightSession.isPinned) {
    return leftSession.isPinned ? -1 : 1;
  }

  const leftOrder = leftSession.sortOrder ?? Number.POSITIVE_INFINITY;
  const rightOrder = rightSession.sortOrder ?? Number.POSITIVE_INFINITY;
  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }

  return rightSession.timestamp - leftSession.timestamp;
}

export function sortSessionsInPlace<T extends Pick<SavedChatSession, 'isPinned' | 'timestamp' | 'sortOrder'>>(
  sessions: T[],
): T[] {
  sessions.sort(compareSessionOrder);
  return sessions;
}

export function shouldRetainRuntimeMessages(
  sessionId: string,
  activeSessionId: string | null,
  loadingSessionIds: Set<string>,
) {
  return sessionId === activeSessionId || loadingSessionIds.has(sessionId);
}

// Fold legacy per-session routing fields into the derived (providerId, modelId)
// composite key. Idempotent: an already-migrated session has no apiMode field,
// so this is a no-op for it. When apiMode was 'third-party', the stored
// thirdPartyModelId becomes the session modelId and thirdPartyProviderId becomes
// providerId; when it was gemini-native (or absent) the session stays gemini.
// The legacy keys are read/dropped via a loose record because the current
// ChatSettings type no longer carries them.
// Legacy per-session routing fields, removed from ChatSettings but still
// present on persisted sessions from before the (providerId, modelId) composite
// key. Casting ChatSettings to this (which merely adds optional fields) needs no
// `unknown` intermediate — the types overlap.
interface LegacySessionRoutingSettings extends ChatSettings {
  apiMode?: string;
  thirdPartyProviderId?: string;
  thirdPartyModelId?: string;
}

const foldLegacySessionRouting = (settings: SavedChatSession['settings'] | undefined): SavedChatSession['settings'] => {
  const legacy = (settings ?? ({} as LegacySessionRoutingSettings)) as LegacySessionRoutingSettings;
  const apiMode = legacy.apiMode;
  const thirdPartyModelId = legacy.thirdPartyModelId;
  const legacyProvider = normalizeProviderId(legacy.thirdPartyProviderId);
  const currentProvider = normalizeProviderId(settings?.providerId);

  const foldedProviderId = apiMode === 'third-party' ? (legacyProvider ?? currentProvider) : currentProvider;
  const currentModelId = settings?.modelId ?? '';
  const foldedModelId = apiMode === 'third-party' && thirdPartyModelId ? thirdPartyModelId : currentModelId;

  // Drop the legacy keys from the persisted shape so a migrated session stops
  // carrying stale routing toggles. Mutate a fresh copy via delete rather than
  // destructure-and-omit, so no unused variables are introduced.
  const folded: LegacySessionRoutingSettings = {
    ...legacy,
    modelId: foldedModelId,
    providerId: foldedProviderId,
  };
  delete folded.apiMode;
  delete folded.thirdPartyProviderId;
  delete folded.thirdPartyModelId;
  return folded;
};

export function sanitizeSessionModel(
  session: SavedChatSession,
  fallbackModelId: string = DEFAULT_MODEL_ID,
): SavedChatSession {
  const foldedSettings = foldLegacySessionRouting(session.settings);
  return {
    ...session,
    settings: {
      ...foldedSettings,
      modelId: resolveSupportedModelId(foldedSettings.modelId, fallbackModelId),
      // Normalize the stored per-session providerId (drops unknown values; a
      // legacy 'openai-compatible' fold resolves to gemini-native).
      providerId: normalizeProviderId(foldedSettings.providerId),
    },
  };
}
