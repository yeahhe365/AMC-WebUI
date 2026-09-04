import { useCallback, type MutableRefObject } from 'react';
import type { ChatMessage } from '@/types';
import { createMessage } from '@/utils/chat/session';
import { logService } from '@/services/logService';
import { finishActiveGenerationJob, startActiveGenerationJob } from './activeGenerationJobs';
import {
  releaseGenerationLease,
  startGenerationLeaseHeartbeat,
  stopGenerationLeaseHeartbeat,
  tryAcquireGenerationLease,
} from './generationLease';
import type { SessionsUpdater } from './messageSenderTypes';
import { useApiErrorHandler } from './useApiErrorHandler';

interface UseMessageLifecycleParams {
  updateAndPersistSessions: SessionsUpdater;
  setSessionLoading: (sessionId: string, isLoading: boolean) => void;
  activeJobs: MutableRefObject<Map<string, AbortController>>;
}

interface LoadingModelMessageParams {
  id: string;
  generationStartTime: Date;
  content?: string;
  excludeFromContext?: boolean;
}

interface RunMessageLifecycleParams<T> {
  sessionId: string;
  generationId: string;
  abortController: AbortController;
  modelMessageId?: string;
  errorPrefix?: string;
  execute: () => Promise<T>;
  onError?: (error: unknown) => void;
}

export const createLoadingModelMessage = ({
  id,
  generationStartTime,
  content = '',
  excludeFromContext,
}: LoadingModelMessageParams): ChatMessage =>
  createMessage('model', content, {
    id,
    isLoading: true,
    generationStartTime,
    ...(excludeFromContext === undefined ? {} : { excludeFromContext }),
  });

export const useMessageLifecycle = ({
  updateAndPersistSessions,
  setSessionLoading,
  activeJobs,
}: UseMessageLifecycleParams) => {
  const { handleApiError } = useApiErrorHandler(updateAndPersistSessions);

  const createLifecycleLoadingModelMessage = useCallback(
    (params: LoadingModelMessageParams) => createLoadingModelMessage(params),
    [],
  );

  const startMessageLifecycle = useCallback(
    (sessionId: string, generationId: string, abortController: AbortController): boolean => {
      if (!tryAcquireGenerationLease(sessionId, generationId)) {
        logService.warn(`Generation lease held by another tab for session ${sessionId}; refusing to start.`);
        return false;
      }
      startGenerationLeaseHeartbeat(sessionId, generationId);
      setSessionLoading(sessionId, true);
      startActiveGenerationJob(activeJobs, sessionId, generationId, abortController);
      return true;
    },
    [activeJobs, setSessionLoading],
  );

  const finishMessageLifecycle = useCallback(
    (sessionId: string, generationId: string) => {
      stopGenerationLeaseHeartbeat(sessionId);
      releaseGenerationLease(sessionId, generationId);
      finishActiveGenerationJob({
        activeJobs,
        setSessionLoading,
        sessionId,
        generationId,
      });
    },
    [activeJobs, setSessionLoading],
  );

  const runMessageLifecycle = useCallback(
    async <T>({
      sessionId,
      generationId,
      abortController,
      modelMessageId = generationId,
      errorPrefix = 'Error',
      execute,
      onError,
    }: RunMessageLifecycleParams<T>): Promise<T | undefined> => {
      const started = startMessageLifecycle(sessionId, generationId, abortController);
      if (!started) {
        const leaseError = new Error(
          'This chat is already generating in another tab. Stop it there first, or wait for it to finish.',
        );
        if (onError) {
          onError(leaseError);
        } else {
          handleApiError(leaseError, sessionId, modelMessageId, errorPrefix);
        }
        return undefined;
      }

      try {
        return await execute();
      } catch (error) {
        if (onError) {
          onError(error);
        } else {
          handleApiError(error, sessionId, modelMessageId, errorPrefix);
        }
        return undefined;
      } finally {
        finishMessageLifecycle(sessionId, generationId);
      }
    },
    [finishMessageLifecycle, handleApiError, startMessageLifecycle],
  );

  return {
    createLoadingModelMessage: createLifecycleLoadingModelMessage,
    startMessageLifecycle,
    finishMessageLifecycle,
    runMessageLifecycle,
  };
};
