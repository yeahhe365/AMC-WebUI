import { create } from 'zustand';
import {
  type SavedChatSession,
  type ChatGroup,
  type ChatMessage,
  type UploadedFile,
  type ChatSettingsUpdater,
} from '@/types';
import { dbService } from '@/services/db/dbService';
import { DEFAULT_CHAT_SETTINGS } from '@/constants/settingsDefaults';
import { logService } from '@/services/logService';
import { rehydrateSessionFiles } from '@/utils/chat/session';
import { syncActiveSessionRoute, type SessionHistoryMode } from './sessionRouteSync';
import { broadcastSyncMessage } from './chatSyncChannel';
import { TAB_ID } from './tabIdentity';
import { sanitizeSessionModel, sortSessionsInPlace } from './sessionModels';
import {
  updateMessageInSession as updateMessageInSessions,
  updateSessionById as updateSessionByIdInSessions,
} from '@/utils/chat/sessionMutations';
import {
  finishActiveGenerationJob,
  hasActiveGenerationJobForSession,
  holdSessionLoadingForGenerationHandoff,
  unregisterActiveGenerationJob,
} from '@/features/message-sender/activeGenerationJobs';
import { abortServerStreamJob } from '@/features/stream-jobs/streamAbort';
import { clearPendingStreamJob, readPendingStreamJob } from '@/features/stream-jobs/amcStreamJobs';
import { mergeSessionMetadata } from './sessionRefresh';
import {
  createVirtualFullSessions,
  getSessionPersistenceChanges,
  stripStoredSessionMessages,
} from './sessionPersistence';
import { persistSessionChanges } from './sessionPersistenceEffects';
import { setupChatStoreSync } from './chatStoreSync';
import { setupLastActiveSessionSync } from './lastActiveSessionSync';
import { createChatUiSlice, type ChatUiSliceActions, type ChatUiSliceState } from './chatStoreSlices';
import { resolveUpdaterOrValue, type UpdaterOrValue } from './stateUpdaters';

type SessionUpdateOptions = { persist?: boolean };
type MessagePatchOrUpdater = Partial<ChatMessage> | ((message: ChatMessage) => ChatMessage);
export type { SessionHistoryMode };
export interface SetActiveSessionOptions {
  history?: SessionHistoryMode;
}

const _activeJobs: { current: Map<string, AbortController> } = { current: new Map() };
const _userScrolledUp: { current: boolean } = { current: false };
const _fileDrafts: { current: Record<string, UploadedFile[]> } = { current: {} };
const _localLoadingSessionIds = new Set<string>();
const _sessionPersistVersion = new Map<string, number>();
let _fileOperationGeneration = 0;

interface ChatState extends ChatUiSliceState {
  savedSessions: SavedChatSession[];
  savedGroups: ChatGroup[];
  activeSessionId: string | null;
  activeMessages: ChatMessage[];
  pendingLockedApiKey: string | null;

  _activeJobs: { current: Map<string, AbortController> };
  _userScrolledUp: { current: boolean };
  _fileDrafts: { current: Record<string, UploadedFile[]> };
}

interface ChatActions extends ChatUiSliceActions {
  setSavedSessions: (value: UpdaterOrValue<SavedChatSession[]>) => void;
  setSavedGroups: (value: UpdaterOrValue<ChatGroup[]>) => void;
  setActiveSessionId: (id: UpdaterOrValue<string | null>, options?: SetActiveSessionOptions) => void;
  setActiveMessages: (value: UpdaterOrValue<ChatMessage[]>) => void;

  updateAndPersistSessions: (
    updater: (prev: SavedChatSession[]) => SavedChatSession[],
    options?: SessionUpdateOptions,
  ) => void;
  updateSessionById: (
    sessionId: string,
    updater: (session: SavedChatSession) => SavedChatSession,
    options?: SessionUpdateOptions,
  ) => void;
  updateActiveSession: (
    updater: (session: SavedChatSession) => SavedChatSession,
    options?: SessionUpdateOptions,
  ) => void;
  updateMessageInSession: (
    sessionId: string,
    messageId: string,
    updater: MessagePatchOrUpdater,
    options?: SessionUpdateOptions,
  ) => void;
  updateMessageInActiveSession: (
    messageId: string,
    updater: MessagePatchOrUpdater,
    options?: SessionUpdateOptions,
  ) => void;
  appendMessageToSession: (sessionId: string, message: ChatMessage, options?: SessionUpdateOptions) => void;
  appendMessageToActiveSession: (message: ChatMessage, options?: SessionUpdateOptions) => void;
  updateAndPersistGroups: (updater: (prev: ChatGroup[]) => ChatGroup[]) => void;
  refreshSessions: () => Promise<void>;
  refreshGroups: () => Promise<void>;
  setSessionLoading: (sessionId: string, isLoading: boolean) => void;
  markSessionCompleted: (sessionId: string, outcome: 'success' | 'error') => void;
  markSessionViewed: (sessionId: string) => void;
  getFileOperationGeneration: () => number;
  invalidateFileOperations: () => void;

  /** 停止当前会话的生成。纯 store action:读 `_activeJobs`/`activeMessages`/`loadingSessionIds`,不再依赖 hook 闭包。 */
  stopGenerating: (options?: {
    silent?: boolean;
    skipLoadingUpdate?: boolean;
  }) => 'stopped' | 'no_local_job' | 'not_loading';
  /** 取消消息编辑:清空编辑态与文件选择,重置 editMode。 */
  cancelEdit: () => void;

  /** Updates an uploaded file by ID across composer selectedFiles and session messages */
  updateUploadedFile: (fileId: string, patch: Partial<UploadedFile>) => void;

  setCurrentChatSettings: ChatSettingsUpdater;
}

export const useChatStore = create<ChatState & ChatActions>((set, get) => ({
  savedSessions: [],
  savedGroups: [],
  activeSessionId: null,
  activeMessages: [],
  pendingLockedApiKey: null,

  ...createChatUiSlice<ChatState & ChatActions>(set),

  _activeJobs,
  _userScrolledUp,
  _fileDrafts,

  setSavedSessions: (value) =>
    set((state) => ({
      savedSessions: resolveUpdaterOrValue(value, state.savedSessions),
    })),

  setSavedGroups: (value) =>
    set((state) => ({
      savedGroups: resolveUpdaterOrValue(value, state.savedGroups),
    })),

  setActiveSessionId: (value, options) => {
    const nextValue = resolveUpdaterOrValue(value, get().activeSessionId);
    set({
      activeSessionId: nextValue,
      ...(nextValue !== get().activeSessionId ? { pendingLockedApiKey: null } : {}),
    });
    syncActiveSessionRoute(nextValue, options?.history ?? 'auto');
  },

  setActiveMessages: (value) =>
    set((state) => ({
      activeMessages: resolveUpdaterOrValue(value, state.activeMessages),
    })),

  refreshSessions: async () => {
    try {
      const metadataList = await dbService.getAllSessionMetadata();
      const { activeSessionId, loadingSessionIds, setActiveMessages, setSavedSessions } = get();

      if (activeSessionId && !loadingSessionIds.has(activeSessionId)) {
        const fullActiveSession = await dbService.getSession(activeSessionId);
        if (fullActiveSession) {
          const rehydrated = rehydrateSessionFiles(sanitizeSessionModel(fullActiveSession));
          setActiveMessages(rehydrated.messages);
        }
      }

      setSavedSessions((prev) =>
        mergeSessionMetadata(prev, metadataList, {
          activeSessionId,
          loadingSessionIds,
        }),
      );
    } catch (refreshError) {
      logService.error('Failed to refresh sessions from DB', { error: refreshError });
    }
  },

  refreshGroups: async () => {
    try {
      const groups = await dbService.getAllGroups();
      set({ savedGroups: groups });
    } catch (refreshError) {
      logService.error('Failed to refresh groups from DB', { error: refreshError });
    }
  },

  setSessionLoading: (sessionId, isLoading) => {
    if (isLoading) {
      _localLoadingSessionIds.add(sessionId);
    } else {
      _localLoadingSessionIds.delete(sessionId);
    }

    set((state) => {
      const next = new Set(state.loadingSessionIds);
      if (isLoading) next.add(sessionId);
      else next.delete(sessionId);

      const nextSavedSessions =
        !isLoading && sessionId !== state.activeSessionId
          ? state.savedSessions.map((session) =>
              session.id === sessionId && session.messages.length > 0 ? { ...session, messages: [] } : session,
            )
          : state.savedSessions;

      // 新一轮生成使旧的完成标记失效:本地清除即可(不广播,新一轮完成时会
      // 重新广播新的完成状态)。若该会话正好没有旧标记则保持原对象避免重渲染。
      const completedSessions =
        isLoading && sessionId in state.completedSessions
          ? Object.fromEntries(Object.entries(state.completedSessions).filter(([key]) => key !== sessionId))
          : state.completedSessions;

      return {
        loadingSessionIds: next,
        savedSessions: nextSavedSessions,
        completedSessions,
      };
    });

    broadcastSyncMessage({
      type: 'SESSION_LOADING',
      sessionId,
      isLoading,
      originId: TAB_ID,
      ts: Date.now(),
    });
  },

  markSessionCompleted: (sessionId, outcome) => {
    // 广播总是发送,让其他标签页各自判断是否需要显示(他们可能不在该会话页)。
    broadcastSyncMessage({ type: 'SESSION_COMPLETED', sessionId, outcome });
    // 本标签页正在实时观看该会话的生成完成,不需要提醒,跳过本地写入。
    if (get().activeSessionId === sessionId) {
      return;
    }
    set((state) => ({
      completedSessions: { ...state.completedSessions, [sessionId]: outcome },
    }));
  },

  markSessionViewed: (sessionId) => {
    broadcastSyncMessage({ type: 'SESSION_VIEWED', sessionId });
    set((state) => {
      if (!(sessionId in state.completedSessions)) {
        return state;
      }
      const next = { ...state.completedSessions };
      delete next[sessionId];
      return { completedSessions: next };
    });
  },

  getFileOperationGeneration: () => _fileOperationGeneration,

  invalidateFileOperations: () => {
    _fileOperationGeneration += 1;
  },

  stopGenerating: (options = {}) => {
    const { silent = false, skipLoadingUpdate = false } = options;
    const {
      activeSessionId,
      activeMessages,
      _activeJobs: activeJobs,
      setSessionLoading,
      updateAndPersistSessions,
    } = get();
    const isLoading = activeSessionId ? get().loadingSessionIds.has(activeSessionId) : false;

    if (!activeSessionId || !isLoading) return 'not_loading';

    const loadingMessage = activeMessages.find((message) => message.isLoading);
    if (loadingMessage) {
      const generationId = loadingMessage.id;
      const controller = activeJobs.current.get(generationId);

      if (controller) {
        logService.warn(
          `User stopped generation for session ${activeSessionId}, job ${generationId}. Silent: ${silent}`,
        );
        controller.abort();

        // Also ask the api container to abort the upstream Gemini
        // connection (the stream journal keeps the upstream alive across
        // browser disconnects). Fire-and-forget; the local abort drives UI.
        // The job secret must be read before the pending record is cleared.
        void abortServerStreamJob(generationId, {
          jobSecret: readPendingStreamJob(activeSessionId)?.secret,
        });
        clearPendingStreamJob(activeSessionId);

        if (!silent) {
          updateAndPersistSessions((prev) =>
            updateMessageInSessions(prev, activeSessionId, generationId, {
              isLoading: false,
              generationEndTime: new Date(),
              stoppedByUser: true,
            }),
          );
        }

        if (!skipLoadingUpdate) {
          finishActiveGenerationJob({
            activeJobs,
            setSessionLoading,
            sessionId: activeSessionId,
            generationId,
          });
        } else {
          holdSessionLoadingForGenerationHandoff(activeJobs, activeSessionId);
          unregisterActiveGenerationJob(activeJobs, generationId);
        }
        return 'stopped';
      }

      logService.error(
        `Could not find active job to stop for generationId: ${generationId}. Requesting cross-tab abort.`,
      );
      broadcastSyncMessage({ type: 'ABORT_GENERATION', sessionId: activeSessionId, originId: TAB_ID });
      return 'no_local_job';
    }

    logService.warn(
      `stopGenerating called for session ${activeSessionId}, but no loading message was found. Leaving other active jobs untouched.`,
    );

    if (hasActiveGenerationJobForSession(activeJobs, activeSessionId)) {
      return 'stopped';
    }

    // Remote tab is loading (synced isLoading) without a local job.
    // Broadcast the abort request and let the owner tab handle cleanup and
    // broadcast the resulting SESSION_LOADING=false. The stale-check loop
    // (clearStaleRemoteLoading, every 30s) will clean up orphaned entries
    // if the owner tab crashed before it could respond.
    broadcastSyncMessage({ type: 'ABORT_GENERATION', sessionId: activeSessionId, originId: TAB_ID });
    return 'no_local_job';
  },

  cancelEdit: () => {
    logService.info('User cancelled message edit.');
    const { setCommandedInput, setSelectedFiles, setEditingMessageId, setEditMode, setAppFileError } = get();
    setCommandedInput({ text: '', id: Date.now() });
    setSelectedFiles([]);
    setEditingMessageId(null);
    setEditMode('resend'); // Reset to default
    setAppFileError(null);
  },

  updateAndPersistSessions: (updater, options = {}) => {
    const { persist = true } = options;
    const { savedSessions, activeSessionId, activeMessages, loadingSessionIds } = get();

    const virtualFullSessions = createVirtualFullSessions(savedSessions, activeSessionId, activeMessages);

    const newFullSessions = updater(virtualFullSessions);

    sortSessionsInPlace(newFullSessions);

    // The streaming hot path calls updateAndPersistSessions idempotently on
    // every chunk (thinkingSource/resume stamps). When the updater preserved
    // every reference (no field actually changed), bail out before touching
    // state, persistence, or any subscriber — the set() below would otherwise
    // rebuild savedSessions and cascade re-renders through every consumer.
    if (newFullSessions === virtualFullSessions) {
      return;
    }

    if (activeSessionId) {
      const newActiveSession = newFullSessions.find((session) => session.id === activeSessionId);
      if (newActiveSession && newActiveSession.messages !== activeMessages) {
        set({ activeMessages: newActiveSession.messages });
      }
    }

    if (persist) {
      const { modifiedSessions, deletedSessionIds } = getSessionPersistenceChanges(
        virtualFullSessions,
        newFullSessions,
      );

      if (modifiedSessions.length > 0 || deletedSessionIds.length > 0) {
        void persistSessionChanges({
          modifiedSessions,
          deletedSessionIds,
          activeSessionId,
          sessionPersistVersions: _sessionPersistVersion,
          getSession: dbService.getSession.bind(dbService),
          saveSession: dbService.saveSession.bind(dbService),
          deleteSession: dbService.deleteSession.bind(dbService),
          broadcastSyncMessage,
        }).catch((persistenceError) =>
          logService.error('Failed to persist session updates', { error: persistenceError }),
        );
      }
    }

    const metadataOnly = stripStoredSessionMessages(newFullSessions, activeSessionId, loadingSessionIds);

    // 会话被删除后不应残留完成标记(删除通过 updater 里的 filter 完成)。
    // 常见路径(无删除)保持原对象引用,避免无谓重渲染。
    const completedSessionIds = new Set(
      virtualFullSessions
        .map((session) => session.id)
        .filter((sessionId) => !newFullSessions.some((session) => session.id === sessionId)),
    );
    set((state) => ({
      savedSessions: metadataOnly,
      completedSessions:
        completedSessionIds.size > 0
          ? Object.fromEntries(Object.entries(state.completedSessions).filter(([key]) => !completedSessionIds.has(key)))
          : state.completedSessions,
    }));
  },

  updateSessionById: (sessionId, updater, options) => {
    get().updateAndPersistSessions(
      (prevSessions) => updateSessionByIdInSessions(prevSessions, sessionId, updater),
      options,
    );
  },

  updateActiveSession: (updater, options) => {
    const { activeSessionId } = get();
    if (!activeSessionId) return;
    get().updateSessionById(activeSessionId, updater, options);
  },

  updateMessageInSession: (sessionId, messageId, updater, options) => {
    get().updateSessionById(
      sessionId,
      (session) => updateMessageInSessions([session], sessionId, messageId, updater)[0],
      options,
    );
  },

  updateMessageInActiveSession: (messageId, updater, options) => {
    const { activeSessionId } = get();
    if (!activeSessionId) return;
    get().updateMessageInSession(activeSessionId, messageId, updater, options);
  },

  appendMessageToSession: (sessionId, message, options) => {
    get().updateSessionById(
      sessionId,
      (session) => ({
        ...session,
        messages: [...session.messages, message],
        timestamp: Date.now(),
      }),
      options,
    );
  },

  appendMessageToActiveSession: (message, options) => {
    const { activeSessionId } = get();
    if (!activeSessionId) return;
    get().appendMessageToSession(activeSessionId, message, options);
  },

  updateUploadedFile: (fileId, patch) => {
    set((state) => {
      let hasInSelected = false;
      const nextSelected = state.selectedFiles.map((file) => {
        if (file.id === fileId) {
          hasInSelected = true;
          return { ...file, ...patch };
        }
        return file;
      });

      let hasActiveChange = false;
      const nextActiveMessages = state.activeMessages.map((message) => {
        if (message.files && message.files.some((f) => f.id === fileId)) {
          hasActiveChange = true;
          return {
            ...message,
            files: message.files.map((f) => (f.id === fileId ? { ...f, ...patch } : f)),
          };
        }
        return message;
      });

      let hasSessionChange = false;
      const nextSessions = state.savedSessions.map((session) => {
        let hasMsgChange = false;
        const nextMessages = session.messages.map((message) => {
          if (message.files && message.files.some((f) => f.id === fileId)) {
            hasMsgChange = true;
            return {
              ...message,
              files: message.files.map((f) => (f.id === fileId ? { ...f, ...patch } : f)),
            };
          }
          return message;
        });

        if (hasMsgChange) {
          hasSessionChange = true;
          return { ...session, messages: nextMessages };
        }
        return session;
      });

      if (!hasInSelected && !hasActiveChange && !hasSessionChange) {
        return state;
      }

      return {
        selectedFiles: hasInSelected ? nextSelected : state.selectedFiles,
        activeMessages: hasActiveChange ? nextActiveMessages : state.activeMessages,
        savedSessions: hasSessionChange ? nextSessions : state.savedSessions,
      };
    });
  },

  updateAndPersistGroups: (updater) => {
    const { savedGroups } = get();
    const newGroups = updater(savedGroups);
    dbService
      .setAllGroups(newGroups)
      .then(() => broadcastSyncMessage({ type: 'GROUPS_UPDATED' }))
      .catch((persistenceError) => logService.error('Failed to persist group updates', { error: persistenceError }));
    set({ savedGroups: newGroups });
  },

  setCurrentChatSettings: (updater) => {
    const { activeSessionId, pendingLockedApiKey } = get();
    if (!activeSessionId) {
      const nextSettings = updater({
        ...DEFAULT_CHAT_SETTINGS,
        lockedApiKey: pendingLockedApiKey,
      });
      set({ pendingLockedApiKey: nextSettings.lockedApiKey ?? null });
      return;
    }
    get().updateAndPersistSessions((prevSessions) =>
      updateSessionByIdInSessions(prevSessions, activeSessionId, (session) => ({
        ...session,
        settings: updater(session.settings),
      })),
    );
  },
}));

setupChatStoreSync({
  store: useChatStore,
  localLoadingSessionIds: _localLoadingSessionIds,
  activeJobs: _activeJobs,
});
setupLastActiveSessionSync(useChatStore);
