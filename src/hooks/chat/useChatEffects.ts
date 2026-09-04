import { useEffect, useRef, useState } from 'react';
import { deferToNextTick } from '@/utils/deferToNextTick';
import { type UploadedFile, type SavedChatSession, type ChatSettings } from '@/types';
import { logService } from '@/services/logService';
import { cleanupFilePreviewUrls } from '@/utils/file/filePreviewUrls';
import {
  getModelCapabilities,
  normalizeAspectRatioForModel,
  normalizeImageSizeForModel,
} from '@/utils/model/modelCapabilities';
import { getTranslator } from '@/i18n/translations';
import { readPendingStreamJob } from '@/features/stream-jobs/amcStreamJobs';
import { isGenerationLeaseHeldByTab } from '@/features/message-sender/generationLease';
import { hasActiveGenerationJobForSession } from '@/features/message-sender/activeGenerationJobs';
import { useChatStore } from '@/stores/chatStore';

interface UseChatEffectsProps {
  activeSessionId: string | null;
  savedSessions: SavedChatSession[];
  selectedFiles: UploadedFile[];
  appFileError: string | null;
  setAppFileError: React.Dispatch<React.SetStateAction<string | null>>;
  isSwitchingModel: boolean;
  setIsSwitchingModel: (value: boolean) => void;
  currentChatSettings: ChatSettings;
  aspectRatio: string;
  setAspectRatio: (value: string) => void;
  imageSize: string;
  setImageSize: (value: string) => void;
  /** Wait for persisted app settings before creating sessions so new chats inherit systemInstruction (e.g. Live Artifacts). */
  isSettingsLoaded: boolean;
  loadInitialData: () => Promise<void>;
  loadChatSession: (id: string) => void;
  startNewChat: () => void;
  /** Resume a buffered upstream stream after a refresh (no-op when not on the Docker api container). */
  resumePendingStream?: (target: {
    sessionId: string;
    generationId: string;
    modelId: string;
    startedAt: number;
    sessionSettings?: ChatSettings;
  }) => Promise<void>;
}

export const useChatEffects = ({
  activeSessionId,
  savedSessions,
  selectedFiles,
  appFileError,
  setAppFileError,
  isSwitchingModel,
  setIsSwitchingModel,
  currentChatSettings,
  aspectRatio,
  setAspectRatio,
  imageSize,
  setImageSize,
  isSettingsLoaded,
  loadInitialData,
  loadChatSession,
  startNewChat,
  resumePendingStream,
}: UseChatEffectsProps) => {
  const [hasLoadedInitialData, setHasLoadedInitialData] = useState(false);
  // Guard against re-running initial load when loadInitialData/startNewChat identities
  // change after the first session write (those callbacks depend on savedSessions).
  const initialLoadStartedRef = useRef(false);
  const loadInitialDataRef = useRef(loadInitialData);
  const loadChatSessionRef = useRef(loadChatSession);
  const startNewChatRef = useRef(startNewChat);
  const recoveringMissingSessionRef = useRef(false);

  loadInitialDataRef.current = loadInitialData;
  loadChatSessionRef.current = loadChatSession;
  startNewChatRef.current = startNewChat;

  useEffect(() => {
    if (!isSettingsLoaded || initialLoadStartedRef.current) {
      return;
    }

    initialLoadStartedRef.current = true;
    void (async () => {
      try {
        await loadInitialDataRef.current();
      } finally {
        setHasLoadedInitialData(true);
      }
    })();
  }, [isSettingsLoaded]);

  useEffect(() => {
    if (!hasLoadedInitialData || !activeSessionId) {
      return;
    }

    // If the metadata list is still empty, initial load has not yet populated
    // it (e.g. the DB read for the active session just failed and we kept the
    // restored session). Do not conclude the active session is gone — that
    // would switch away and blank the user's conversation on a refresh.
    if (savedSessions.length === 0) {
      return;
    }

    if (savedSessions.some((session) => session.id === activeSessionId)) {
      recoveringMissingSessionRef.current = false;
      return;
    }

    if (recoveringMissingSessionRef.current) {
      return;
    }

    recoveringMissingSessionRef.current = true;
    logService.warn(`Active session ${activeSessionId} is no longer available. Switching sessions.`);
    const sortedSessions = [...savedSessions].sort(
      (leftSession, rightSession) => rightSession.timestamp - leftSession.timestamp,
    );
    const nextSession = sortedSessions[0];
    if (nextSession) {
      loadChatSessionRef.current(nextSession.id);
    } else {
      startNewChatRef.current();
    }
  }, [savedSessions, activeSessionId, hasLoadedInitialData]);

  useEffect(() => {
    const handleOnline = () => {
      setAppFileError((currentError) => {
        if (
          currentError &&
          (currentError.toLowerCase().includes('network') || currentError.toLowerCase().includes('fetch'))
        ) {
          logService.info('Network restored, clearing file processing error.');
          return null;
        }
        return currentError;
      });
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [setAppFileError]);

  useEffect(() => {
    const isFileProcessing = selectedFiles.some((file) => file.isProcessing);
    const waitForFilesMessages = [
      getTranslator('en')('messageSenderWaitForFiles'),
      getTranslator('zh')('messageSenderWaitForFiles'),
    ];
    if (appFileError && waitForFilesMessages.includes(appFileError) && !isFileProcessing) {
      setAppFileError(null);
    }
  }, [selectedFiles, appFileError, setAppFileError]);

  const savedSessionsRef = useRef(savedSessions);
  useEffect(() => {
    savedSessionsRef.current = savedSessions;
  }, [savedSessions]);

  useEffect(
    () => () => {
      savedSessionsRef.current.forEach((session) => {
        session.messages.forEach((message) => {
          cleanupFilePreviewUrls(message.files);
        });
      });
    },
    [],
  );

  useEffect(() => {
    if (isSwitchingModel) {
      const timer = deferToNextTick(() => setIsSwitchingModel(false));
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [isSwitchingModel, setIsSwitchingModel]);

  const prevModelIdRef = useRef(currentChatSettings.modelId);
  useEffect(() => {
    if (prevModelIdRef.current !== currentChatSettings.modelId) {
      const modelId = currentChatSettings.modelId;
      const capabilities = getModelCapabilities(modelId);
      const isBananaModel = capabilities.isGemini3ImageModel;

      if (capabilities.supportedAspectRatios?.length) {
        const preferredAspectRatio = isBananaModel ? 'Auto' : aspectRatio;
        const normalizedAspectRatio = normalizeAspectRatioForModel(modelId, preferredAspectRatio);

        if (normalizedAspectRatio && normalizedAspectRatio !== aspectRatio) {
          setAspectRatio(normalizedAspectRatio);
        }
      } else if (aspectRatio === 'Auto') {
        setAspectRatio('1:1');
      }

      const normalizedImageSize = normalizeImageSizeForModel(modelId, imageSize);
      if (normalizedImageSize && normalizedImageSize !== imageSize) {
        setImageSize(normalizedImageSize);
      }

      prevModelIdRef.current = modelId;
    }
  }, [currentChatSettings.modelId, aspectRatio, imageSize, setAspectRatio, setImageSize]);

  // Resume an in-flight stream after a page refresh: if the api container is
  // still buffering the upstream under a pending job, reattach the stream
  // handlers and replay from the last seq. Runs once per active session load.
  const resumedSessionsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!hasLoadedInitialData || !activeSessionId || !resumePendingStream) {
      return;
    }
    if (resumedSessionsRef.current.has(activeSessionId)) {
      return;
    }

    const pending = readPendingStreamJob(activeSessionId);
    if (!pending) {
      return;
    }

    // If THIS tab still holds the generation lease AND has a live in-memory
    // generation job, the send is still running in this tab
    // (runMessageLifecycle holds the lease for the whole turn). Resuming would
    // attach a second stream handler to the same job and the buffered events
    // would be delivered to both, doubling the output. The live send already
    // re-attaches on its own after transient disconnects, so skipping the
    // resume here is safe.
    //
    // The in-memory check is what distinguishes a live send from a page
    // refresh: after a refresh the lease is stale (belongs to the old page)
    // but the memory Map is empty, so resume proceeds and reacquires the lease.
    // A lease alone must NOT block resume — it survives a refresh (sessionStorage
    // TAB_ID is stable, localStorage is not cleared) for up to the TTL.
    const activeJobs = useChatStore.getState()._activeJobs;
    if (isGenerationLeaseHeldByTab(activeSessionId) && hasActiveGenerationJobForSession(activeJobs, activeSessionId)) {
      return;
    }

    // Only resume when the loaded session still shows the generation as in
    // flight; otherwise the job already completed (or was persisted done) and
    // resuming would replay a finished stream.
    //
    // Look in chatStore.activeMessages, not savedSessions[id].messages: the
    // latter is metadata-only after a fresh load (getAllSessionMetadata and
    // toSessionMetadata both strip messages to []), so the isLoading lookup
    // would never match and resume would be permanently skipped.
    const activeMessages = useChatStore.getState().activeMessages;
    const loadingMessage = activeMessages.find((message) => message.id === pending.generationId && message.isLoading);
    if (!loadingMessage) {
      resumedSessionsRef.current.add(activeSessionId);
      return;
    }

    const session = savedSessions.find((candidate) => candidate.id === activeSessionId);

    resumedSessionsRef.current.add(activeSessionId);
    logService.info('Resuming buffered stream after page load.', {
      sessionId: activeSessionId,
      generationId: pending.generationId,
      lastSeq: pending.lastSeq,
    });

    void resumePendingStream({
      sessionId: activeSessionId,
      generationId: pending.generationId,
      modelId: session?.settings.modelId ?? currentChatSettings.modelId,
      startedAt: pending.startedAt,
      sessionSettings: session?.settings ?? currentChatSettings,
    });
    // currentChatSettings is read via sessionSettings fallback; listing it
    // whole (not just .modelId) satisfies exhaustive-deps and keeps the resume
    // re-evaluating when the active settings object changes.
  }, [hasLoadedInitialData, activeSessionId, savedSessions, currentChatSettings, resumePendingStream]);
};
