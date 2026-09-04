import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { deferToNextTick } from '@/utils/deferToNextTick';
import type { UploadedFile } from '@/types';
import { useChatStore } from '@/stores/chatStore';
import {
  MAX_QUEUED_SUBMISSIONS,
  areFilesStillProcessing,
  buildQueuedChatInputSubmission,
  getBlockingFileUploadFailure,
  type PendingChatInputSubmission,
  type QueuedChatInputSubmission,
  shouldFlushPendingSubmission,
} from '@/utils/chat-input/pendingSubmission';

type SetSelectedFiles = (files: UploadedFile[] | ((prevFiles: UploadedFile[]) => UploadedFile[])) => void;

/** If a flushed send hasn't started its pipeline within this window, release the flush gate. */
const FLUSH_RELEASE_TIMEOUT_MS = 5000;

interface UseMessageQueueParams {
  activeSessionId: string | null;
  modelId: string;
  inputText: string;
  quotes: string[];
  ttsContext?: string;
  selectedFiles: UploadedFile[];
  isLoading: boolean;
  canQueueMessageBase: boolean;
  clearCurrentDraft: () => void;
  setInputText: (value: string) => void;
  setQuotes: (quotes: string[]) => void;
  setWaitingForUpload: (isWaiting: boolean) => void;
  textareaRef: RefObject<HTMLTextAreaElement>;
  setSelectedFiles: SetSelectedFiles;
  setAppFileError: (error: string | null) => void;
  uploadFailureMessage: string;
  completeEditSubmission: (messageId: string, content: string) => void;
  completeSendSubmission: (
    textToSend: string,
    isFastMode: boolean,
    options?: {
      files?: UploadedFile[];
      preserveComposer?: boolean;
    },
  ) => void;
}

export const useMessageQueue = ({
  activeSessionId,
  modelId,
  inputText,
  quotes,
  ttsContext,
  selectedFiles,
  isLoading,
  canQueueMessageBase,
  clearCurrentDraft,
  setInputText,
  setQuotes,
  setWaitingForUpload,
  textareaRef,
  setSelectedFiles,
  setAppFileError,
  uploadFailureMessage,
  completeEditSubmission,
  completeSendSubmission,
}: UseMessageQueueParams) => {
  const pendingSubmissionRef = useRef<PendingChatInputSubmission | null>(null);
  const [queue, setQueue] = useState<QueuedChatInputSubmission[]>([]);
  // Session id whose queue head we just flushed, while awaiting the send pipeline
  // to flip its isLoading to true. This closes the async gap between the flush
  // (which removes the head and calls completeSendSubmission) and the point where
  // the generation actually starts: without it, a re-render in that window would
  // re-find the next head and double-send. React 18 StrictMode double-invokes the
  // flush effect, so a ref alone is racy — keying on the session + observing the
  // actual isLoading flip below makes the guard self-consistent.
  //
  // The gate self-heals: if the send fails before its pipeline sets isLoading
  // (validation / key / file errors) it is released after a bounded delay so the
  // queue keeps advancing instead of stalling.
  const flushPendingSessionRef = useRef<string | null>(null);
  const flushReleaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeQueuedSubmissions = activeSessionId
    ? queue.filter((submission) => submission.sessionId === activeSessionId)
    : [];
  const queuedCount = activeQueuedSubmissions.length;
  const canQueueMessage = canQueueMessageBase && queuedCount < MAX_QUEUED_SUBMISSIONS;

  const flushPendingSubmission = useCallback(
    (submission = pendingSubmissionRef.current) => {
      if (!submission) {
        return;
      }

      const blockingFileFailure = getBlockingFileUploadFailure(useChatStore.getState().selectedFiles);
      if (blockingFileFailure) {
        pendingSubmissionRef.current = null;
        setWaitingForUpload(false);
        setAppFileError(uploadFailureMessage);
        return;
      }

      pendingSubmissionRef.current = null;
      setWaitingForUpload(false);

      if (submission.kind === 'edit') {
        completeEditSubmission(submission.messageId, submission.content);
        return;
      }

      completeSendSubmission(submission.textToSend, submission.isFastMode);
    },
    [completeEditSubmission, completeSendSubmission, setAppFileError, setWaitingForUpload, uploadFailureMessage],
  );

  const cancelPendingSubmission = useCallback(() => {
    pendingSubmissionRef.current = null;
    setWaitingForUpload(false);
  }, [setWaitingForUpload]);

  const restoreQueuedSubmission = useCallback(
    (id: string) => {
      const submission = queue.find((item) => item.id === id);
      if (!submission) {
        return;
      }

      setQueue((current) => current.filter((item) => item.id !== id));
      setInputText(submission.inputText);
      setQuotes(submission.quotes);
      setSelectedFiles(submission.files);
      deferToNextTick(() => textareaRef.current?.focus());
    },
    [queue, setInputText, setQuotes, setSelectedFiles, textareaRef],
  );

  const removeQueuedSubmission = useCallback((id: string) => {
    setQueue((current) => current.filter((item) => item.id !== id));
  }, []);

  const removeAllQueuedSubmissions = useCallback(() => {
    setQueue((current) => (activeSessionId ? current.filter((item) => item.sessionId !== activeSessionId) : current));
  }, [activeSessionId]);

  const reorderQueuedSubmissions = useCallback((activeId: string, targetIndex: number) => {
    setQueue((current) => {
      const sourceIndex = current.findIndex((item) => item.id === activeId);
      if (sourceIndex === -1) {
        return current;
      }

      const next = [...current];
      const [moved] = next.splice(sourceIndex, 1);
      const clampedIndex = Math.max(0, Math.min(next.length, targetIndex));
      next.splice(clampedIndex, 0, moved);
      return next;
    });
  }, []);

  const queueCurrentSubmission = useCallback(() => {
    if (!canQueueMessage || !activeSessionId) {
      return;
    }

    const submission = buildQueuedChatInputSubmission({
      sessionId: activeSessionId,
      inputText,
      quotes,
      modelId,
      ttsContext,
      files: selectedFiles,
      isFastMode: false,
    });

    setQueue((current) => [...current, submission]);
    clearCurrentDraft();
    setInputText('');
    setQuotes([]);
    setSelectedFiles([]);
  }, [
    activeSessionId,
    canQueueMessage,
    clearCurrentDraft,
    inputText,
    modelId,
    quotes,
    selectedFiles,
    setInputText,
    setQuotes,
    setSelectedFiles,
    ttsContext,
  ]);

  const queuePendingSubmission = useCallback(
    (submission: PendingChatInputSubmission) => {
      pendingSubmissionRef.current = submission;
      setWaitingForUpload(true);

      if (!areFilesStillProcessing(useChatStore.getState().selectedFiles)) {
        flushPendingSubmission(submission);
      }
    },
    [flushPendingSubmission, setWaitingForUpload],
  );

  // Flush pending submissions after the commit, not from the store subscription
  // callback. The zustand subscriber fires synchronously on setState, before
  // React re-renders, so a flush triggered there would run on the previous
  // render's closure chain — handleSendMessage would still see the files as
  // isProcessing and block the send, silently dropping the text. Running from
  // this effect means the closures (incl. handleSendMessage's selectedFiles)
  // are all from the current render, where the files have finished processing.
  const previousSelectedFilesRef = useRef<UploadedFile[]>(selectedFiles);

  useEffect(() => {
    const previousFiles = previousSelectedFilesRef.current;

    if (
      shouldFlushPendingSubmission({
        pendingSubmission: pendingSubmissionRef.current,
        previousFiles,
        currentFiles: selectedFiles,
      })
    ) {
      flushPendingSubmission();
    }

    previousSelectedFilesRef.current = selectedFiles;
  }, [selectedFiles, flushPendingSubmission]);

  useEffect(() => {
    return () => {
      if (flushReleaseTimerRef.current !== null) {
        clearTimeout(flushReleaseTimerRef.current);
        flushReleaseTimerRef.current = null;
      }
    };
  }, []);

  // Auto-flush: when the active session is idle and has a queued head, send it.
  // The send pipeline sets isLoading (via loadingSessionIds) asynchronously — file
  // encoding etc. can delay it past a render — so a bare ref would leave a window
  // where the effect re-runs on the next head and double-sends. Instead we track
  // the flushed session id and only release it once its isLoading actually flips
  // true (generation started). If the send fails before starting (validation /
  // key / file errors), isLoading never flips and we self-heal on the next render.
  useEffect(() => {
    if (isLoading) {
      // The send pipeline started — this is the single reliable signal that a
      // flush landed and the async gap is closed. Release the gate; the queue is
      // now advanced and the head was already removed.
      flushPendingSessionRef.current = null;
      if (flushReleaseTimerRef.current !== null) {
        clearTimeout(flushReleaseTimerRef.current);
        flushReleaseTimerRef.current = null;
      }
      return;
    }

    if (flushPendingSessionRef.current !== null) {
      // Waiting for the flushed send's pipeline to start.
      return;
    }

    const head = queue.find((submission) => submission.sessionId === activeSessionId);
    if (!head) {
      return;
    }

    // Don't flush a session that no longer exists (was deleted while queued) —
    // otherwise the send would write into a ghost session and the message vanish.
    // Only trust a non-empty savedSessions list: an empty list means we have no
    // session data yet, not that the session was deleted.
    const savedSessions = useChatStore.getState().savedSessions;
    if (savedSessions.length > 0 && !savedSessions.some((session) => session.id === head.sessionId)) {
      return;
    }

    flushPendingSessionRef.current = head.sessionId;
    if (flushReleaseTimerRef.current !== null) {
      clearTimeout(flushReleaseTimerRef.current);
    }
    // Bounded self-heal: if the send fails to start (so isLoading never flips),
    // release the gate so the queue keeps advancing instead of stalling.
    flushReleaseTimerRef.current = setTimeout(() => {
      flushPendingSessionRef.current = null;
      flushReleaseTimerRef.current = null;
    }, FLUSH_RELEASE_TIMEOUT_MS);
    setQueue((current) => current.filter((item) => item.id !== head.id));
    completeSendSubmission(head.textToSend, head.isFastMode, {
      files: head.files.length ? head.files : undefined,
      preserveComposer: true,
    });
  }, [queue, isLoading, activeSessionId, completeSendSubmission]);

  return {
    canQueueMessage,
    queuedCount,
    activeQueuedSubmissions,
    queueCurrentSubmission,
    queuePendingSubmission,
    cancelPendingSubmission,
    restoreQueuedSubmission,
    removeQueuedSubmission,
    removeAllQueuedSubmissions,
    reorderQueuedSubmissions,
  };
};
