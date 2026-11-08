import { useCallback } from 'react';
import { logService } from '@/services/logService';
import { type SessionsUpdater } from '@/types';
import { updateSessionById } from '@/utils/chat/sessionMutations';
import { invalidateSessionFilesApiReferences } from '@/utils/chat/geminiFilesApi';
import { pruneDanglingInternalToolMessages } from '@/utils/chat/visibility';
import { useI18n } from '@/contexts/I18nContext';
import { formatMessageSenderText } from './i18nFormat';

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

/**
 * 把本轮增量**追加**到已有内容之后，而不是替换它（P0-4）。
 *
 * Continue（续写）模式下这条消息本身就有正文——它被当作 prefill 发给模型
 * （见 `standardChatTurn.ts` 的 `finalParts: [{ text: prefillContent }]`），
 * `streamState.content` 只是"这一轮续写新增的那一段"。旧实现直接赋值覆盖，
 * 于是"点停止"或"上游报错"会把原回复整段吃掉并立刻落库；而续写模式又被
 * 显式排除在 stream journal 之外（`standardChatGemini.ts` 的 `!isContinueMode`），
 * 没有任何服务端兜底可以恢复。这里与 `streamOnComplete` 的无条件追加保持一致。
 */
const appendStreamedText = (base: string | null | undefined, addition: string | undefined): string =>
  `${base || ''}${addition ?? ''}`;

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
        updateAndPersistSessions((previousSessions) =>
          updateSessionById(previousSessions, sessionId, (session) => {
            const cleanedMessages = pruneDanglingInternalToolMessages(session.messages, modelMessageId);
            const updatedMessages = cleanedMessages.map((message) => {
              if (message.id !== modelMessageId) {
                return message;
              }
              return {
                ...message,
                content: appendStreamedText(message.content, partialContent),
                thoughts: appendStreamedText(message.thoughts, partialThoughts),
                isLoading: false,
                generationEndTime: new Date(),
                stoppedByUser: true,
                thinkingTimeMs: fallbackThinkingTimeMs(message),
              };
            });
            return { ...session, messages: updatedMessages };
          }),
        );
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
          const cleanedMessages = pruneDanglingInternalToolMessages(session.messages, modelMessageId);
          const updatedMessages = cleanedMessages.map((message) => {
            if (message.id !== modelMessageId) {
              return message;
            }
            const partial = appendStreamedText(message.content, partialContent).trim();
            const errorBody = quoteAsApiError ? `[${errorMessage}]` : errorMessage;
            const content = quoteAsApiError || partial ? `${partial}\n\n${errorBody}` : errorBody;

            return {
              ...message,
              role: 'error' as const,
              content,
              thoughts: appendStreamedText(message.thoughts, partialThoughts),
              isLoading: false,
              generationEndTime: new Date(),
              thinkingTimeMs: fallbackThinkingTimeMs(message),
            };
          });

          return invalidateSessionFilesApiReferences({ ...session, messages: updatedMessages }, error);
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
