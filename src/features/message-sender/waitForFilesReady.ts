import type { UploadedFile } from '@/types';
import { useChatStore } from '@/stores/chatStore';

export interface WaitForFilesResult {
  ok: boolean;
  failedFile?: UploadedFile;
  error?: string;
}

/**
 * Checks if files with the given IDs are all ready in chat store.
 */
const checkFilesState = (fileIds: string[]): { done: boolean; result: WaitForFilesResult; files: UploadedFile[] } => {
  if (fileIds.length === 0) {
    return { done: true, result: { ok: true }, files: [] };
  }

  const state = useChatStore.getState();
  const filesMap = new Map<string, UploadedFile>();

  // Check selectedFiles in composer
  for (const file of state.selectedFiles) {
    if (fileIds.includes(file.id)) {
      filesMap.set(file.id, file);
    }
  }

  // Check activeMessages
  for (const message of state.activeMessages) {
    if (message.files) {
      for (const file of message.files) {
        if (fileIds.includes(file.id)) {
          filesMap.set(file.id, file);
        }
      }
    }
  }

  // Check savedSessions
  for (const session of state.savedSessions) {
    for (const message of session.messages) {
      if (message.files) {
        for (const file of message.files) {
          if (fileIds.includes(file.id)) {
            filesMap.set(file.id, file);
          }
        }
      }
    }
  }

  const files = Array.from(filesMap.values());
  const failed = files.find(
    (file) => file.uploadState === 'failed' || file.uploadState === 'cancelled' || !!file.error,
  );

  if (failed) {
    return {
      done: true,
      result: { ok: false, failedFile: failed, error: failed.error || 'Upload failed' },
      files,
    };
  }

  const allActive =
    files.length >= fileIds.length && files.every((file) => file.uploadState === 'active' && !file.isProcessing);

  if (allActive) {
    return { done: true, result: { ok: true }, files };
  }

  return { done: false, result: { ok: false }, files };
};

/**
 * Waits asynchronously for uploading files to complete processing.
 * Reacts to Zustand chatStore updates.
 */
export const waitForFilesReady = (
  fileIds: string[],
  abortSignal?: AbortSignal,
  timeoutMs = 600000,
): Promise<WaitForFilesResult> => {
  return new Promise((resolve) => {
    if (abortSignal?.aborted) {
      resolve({ ok: false, error: 'Aborted' });
      return;
    }

    const initial = checkFilesState(fileIds);
    if (initial.done) {
      resolve(initial.result);
      return;
    }

    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      settled = true;
      unsubscribe();
      abortSignal?.removeEventListener('abort', onAbort);
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const onAbort = () => {
      if (settled) return;
      // Abort in-flight file uploads
      const current = checkFilesState(fileIds);
      for (const file of current.files) {
        if (file.abortController && (file.uploadState === 'uploading' || file.isProcessing)) {
          try {
            file.abortController.abort();
          } catch {
            // ignore abort errors
          }
        }
      }
      cleanup();
      resolve({ ok: false, error: 'Aborted' });
    };

    const unsubscribe = useChatStore.subscribe(() => {
      if (settled) return;
      const evaluation = checkFilesState(fileIds);
      if (evaluation.done) {
        cleanup();
        resolve(evaluation.result);
      }
    });

    abortSignal?.addEventListener('abort', onAbort);

    timer = setTimeout(() => {
      if (settled) return;
      cleanup();
      resolve({ ok: false, error: 'File upload timed out' });
    }, timeoutMs);
  });
};
