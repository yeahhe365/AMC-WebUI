import { useCallback } from 'react';
import { logService } from '@/services/logService';
import { type SavedChatSession } from '@/types';
import { updateMessageInSession, updateSessionById } from '@/utils/chat/sessionMutations';
import { invalidateSessionFilesApiReferences } from '@/utils/chat/geminiFilesApi';
import { useI18n } from '@/contexts/I18nContext';
import { formatMessageSenderText } from './i18nFormat';

type SessionsUpdater = (updater: (prev: SavedChatSession[]) => SavedChatSession[]) => void;

// An aborted/errored reply with thoughts but no settled thinking time gets a
// fallback duration so the header still shows how long reasoning ran, matching
// the abort path (finalizeMessages) which computes it on stream completion.
const fallbackThinkingTimeMs = (message: {
  thoughts?: string;
  thinkingTimeMs?: number;
  generationStartTime?: Date;
}): number | undefined => {
  if (!message.thoughts?.trim() || message.thinkingTimeMs !== undefined || !message.generationStartTime) {
    return undefined;
  }
  return new Date().getTime() - message.generationStartTime.getTime();
};

export const useApiErrorHandler = (updateAndPersistSessions: SessionsUpdater) => {
  const { t } = useI18n();

  const handleApiError = useCallback(
    (
      error: unknown,
      sessionId: string,
      modelMessageId: string,
      errorPrefix?: string,
      partialContent?: string,
      partialThoughts?: string,
      recordCompletion?: boolean,
    ) => {
      const resolvedErrorPrefix =
        !errorPrefix || errorPrefix === 'Error' ? t('messageSenderApiErrorPrefix') : errorPrefix;
      const isAborted = error instanceof Error && (error.name === 'AbortError' || error.message === 'aborted');
      logService.error(`API Error (${resolvedErrorPrefix}) for message ${modelMessageId} in session ${sessionId}`, {
        error,
        isAborted,
      });

      if (isAborted) {
        if (partialContent !== undefined || partialThoughts !== undefined) {
          updateAndPersistSessions((previousSessions) =>
            updateMessageInSession(previousSessions, sessionId, modelMessageId, (message) => ({
              ...message,
              content: partialContent !== undefined ? partialContent : message.content,
              thoughts: partialThoughts !== undefined ? partialThoughts : message.thoughts,
              isLoading: false,
              generationEndTime: new Date(),
              stoppedByUser: true,
              thinkingTimeMs: fallbackThinkingTimeMs(message),
            })),
          );
        }
        return;
      }

      let errorMessage = t('messageSenderUnknownError');
      const quoteAsApiError = !(error instanceof Error && error.name === 'EmptyReplyError');
      if (error instanceof Error) {
        if (error.name === 'SilentError') {
          errorMessage = t('messageSenderApiKeyNotConfigured');
        } else if (error.name === 'EmptyReplyError') {
          errorMessage = error.message;
        } else {
          errorMessage = formatMessageSenderText(t('messageSenderErrorWithPrefix'), {
            prefix: resolvedErrorPrefix,
            message: error.message,
          });
        }
      } else {
        errorMessage = formatMessageSenderText(t('messageSenderErrorWithPrefix'), {
          prefix: resolvedErrorPrefix,
          message: String(error),
        });
      }

      updateAndPersistSessions((previousSessions) =>
        updateSessionById(previousSessions, sessionId, (session) => {
          const sessionsWithMessageUpdated = updateMessageInSession([session], sessionId, modelMessageId, (message) => {
            const partial = (partialContent !== undefined ? partialContent : message.content || '').trim();
            const errorBody = quoteAsApiError ? `[${errorMessage}]` : errorMessage;
            const content = quoteAsApiError || partial ? `${partial}\n\n${errorBody}` : errorBody;

            return {
              ...message,
              role: 'error',
              content,
              thoughts: partialThoughts !== undefined ? partialThoughts : message.thoughts,
              isLoading: false,
              generationEndTime: new Date(),
              thinkingTimeMs: fallbackThinkingTimeMs(message),
            };
          });

          const updatedSession = sessionsWithMessageUpdated[0] ?? session;
          return invalidateSessionFilesApiReferences(updatedSession, error);
        }),
      );

      // 仅标准聊天流的错误写入完成标记(TTS/图片编辑等乐观 pipeline 的调用
      // 方不传该参数,保持 out-of-scope)。AbortError 已在上面提前返回。
      // 动态导入避免把 chatStore 的全依赖链(含 rehydrateSessionFiles 等)拉到
      // 本模块的静态依赖,使按模块 mock 的测试无需为此补齐导出。
      if (recordCompletion) {
        void import('@/stores/chatStore').then(({ useChatStore }) => {
          useChatStore.getState().markSessionCompleted(sessionId, 'error');
        });
      }
    },
    [t, updateAndPersistSessions],
  );

  return { handleApiError };
};
