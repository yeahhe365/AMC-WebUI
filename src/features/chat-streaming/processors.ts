import { type ChatMessage, type ChatSettings } from '@/types';
import type { UsageMetadata } from '@google/genai';
import { getTranslator } from '@/i18n/translations';
import { calculateTokenStats } from '@/utils/model/modelUsageStats';
import type { SupportedLanguage } from '@/i18n/languageRegistry';

interface FinalizeMessagesOptions {
  messages: ChatMessage[];
  generationStartTime: Date;
  newModelMessageIds: Set<string>;
  currentChatSettings: ChatSettings;
  language: SupportedLanguage;
  firstContentPartTime: Date | null;
  lastThoughtChunkTimeMs?: number;
  usageMetadata?: UsageMetadata;
  groundingMetadata?: unknown;
  urlContextMetadata?: unknown;
  isAborted?: boolean;
}

export const finalizeMessages = ({
  messages,
  generationStartTime,
  newModelMessageIds,
  currentChatSettings: _currentChatSettings,
  language,
  firstContentPartTime,
  lastThoughtChunkTimeMs,
  usageMetadata,
  groundingMetadata,
  urlContextMetadata,
  isAborted,
}: FinalizeMessagesOptions): {
  updatedMessages: ChatMessage[];
  completedMessageForNotification: ChatMessage | null;
} => {
  const t = getTranslator(language);
  let cumulativeTotal =
    [...messages]
      .reverse()
      .find(
        (message) => message.cumulativeTotalTokens !== undefined && message.generationStartTime !== generationStartTime,
      )?.cumulativeTotalTokens || 0;

  let completedMessageForNotification: ChatMessage | null = null;

  let finalMessages = messages.map((message) => {
    if (
      message.generationStartTime &&
      message.generationStartTime.getTime() === generationStartTime.getTime() &&
      message.isLoading
    ) {
      let thinkingTime = message.thinkingTimeMs;
      if (thinkingTime === undefined) {
        if (lastThoughtChunkTimeMs !== undefined) {
          // Last thought chunk: most accurate for a reply that never produced
          // visible content (interleaved thought after code execution), or for
          // an aborted run that only thought.
          thinkingTime = lastThoughtChunkTimeMs;
        } else if (firstContentPartTime) {
          thinkingTime = firstContentPartTime.getTime() - generationStartTime.getTime();
        } else if (message.thoughts) {
          // Only thoughts, never any content part (e.g. a pure-reasoning turn
          // finished as a live reply): the whole run was thinking time.
          thinkingTime = new Date().getTime() - generationStartTime.getTime();
        }
      }
      const isLastMessageOfRun = message.id === Array.from(newModelMessageIds).pop();

      const { promptTokens, cachedPromptTokens, completionTokens, totalTokens, thoughtTokens, toolUsePromptTokens } =
        calculateTokenStats(isLastMessageOfRun ? usageMetadata : undefined);

      if (isLastMessageOfRun) {
        cumulativeTotal += totalTokens;
      }

      const completedMessage = {
        ...message,
        isLoading: false,
        content: message.content,
        thoughts: message.thoughts,
        generationEndTime: new Date(),
        thinkingTimeMs: message.thoughts ? thinkingTime : undefined,
        thinkingActive: message.thoughts ? message.thinkingActive : undefined,
        groundingMetadata: isLastMessageOfRun ? groundingMetadata : undefined,
        urlContextMetadata: isLastMessageOfRun ? urlContextMetadata : undefined,
        promptTokens: isLastMessageOfRun ? promptTokens : undefined,
        cachedPromptTokens: isLastMessageOfRun ? cachedPromptTokens : undefined,
        completionTokens: isLastMessageOfRun ? completionTokens : undefined,
        toolUsePromptTokens: isLastMessageOfRun ? toolUsePromptTokens : undefined,
        totalTokens: isLastMessageOfRun ? totalTokens : undefined,
        thoughtTokens: isLastMessageOfRun ? thoughtTokens : undefined,
        cumulativeTotalTokens: isLastMessageOfRun ? cumulativeTotal : undefined,
      };

      const isEmpty =
        !completedMessage.content?.trim() &&
        !completedMessage.files?.length &&
        !completedMessage.audioSrc &&
        !completedMessage.thoughts?.trim();

      if (isEmpty && !isAborted) {
        completedMessage.role = 'error';
        completedMessage.content = t('emptyResponseError');
      }

      if (isLastMessageOfRun && !isAborted) {
        completedMessageForNotification = completedMessage;
      }
      return completedMessage;
    }
    return message;
  });

  if (!isAborted) {
    // Prune empty model messages from THIS run only. A global prune would also
    // delete empty internal/historical model messages (e.g. a message stuck in
    // the DB from a crashed resume that never produced output), silently
    // discarding data unrelated to this turn. Scoping to this run's
    // generationStartTime keeps the cleanup to exactly what this finalize owns.
    finalMessages = finalMessages.filter(
      (message) =>
        message.role !== 'model' ||
        message.isInternalToolMessage ||
        message.generationStartTime?.getTime() !== generationStartTime.getTime() ||
        (message.apiParts && message.apiParts.length > 0) ||
        message.content?.trim() !== '' ||
        (message.files && message.files.length > 0) ||
        message.audioSrc ||
        (message.thoughts && message.thoughts.trim() !== ''),
    );
  }

  return { updatedMessages: finalMessages, completedMessageForNotification };
};
