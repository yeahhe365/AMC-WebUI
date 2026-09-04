import { useCallback } from 'react';
import type { AppSettings, ChatMessage, ChatSettings as IndividualChatSettings, UploadedFile } from '@/types';
import { DEFAULT_CHAT_SETTINGS } from '@/constants/settingsDefaults';
import { logService } from '@/services/logService';
import { getKeyForRequest } from '@/utils/apiKeySelection';
import type { ChatApiRoute } from '@/utils/chatApiRoute';
import { generateUniqueId } from '@/utils/chat/ids';
import { createMessage, createNewSession } from '@/utils/chat/session';
import { sessionHasGeminiFilesApiReferences, usesGeminiFilesApiReference } from '@/utils/chat/geminiFilesApi';
import type { SessionsUpdater } from './messageSenderTypes';

export interface PreparedModelRequest {
  ok: true;
  keyToUse: string;
  isNewKey: boolean;
  shouldLockKey: boolean;
  generationId: string;
  generationStartTime: Date;
  abortController: AbortController;
}

interface SkippedModelRequest {
  ok: false;
}

type ModelRequestPreparation = PreparedModelRequest | SkippedModelRequest;

interface ModelRequestMessages {
  noModelSelected: string;
  noModelTitle: string;
  apiKeyTitle: string;
}

interface PrepareModelRequestParams {
  activeModelId: string;
  apiRoute?: ChatApiRoute;
  files: UploadedFile[];
  historyMessages?: ChatMessage[];
  messages: ModelRequestMessages;
  keySettings?: IndividualChatSettings;
  keyOptions?: { skipIncrement?: boolean };
  generationId?: string;
  generationStartTime?: Date;
}

interface UseModelRequestRunnerParams {
  appSettings: AppSettings;
  currentChatSettings: IndividualChatSettings;
  updateAndPersistSessions: SessionsUpdater;
  setActiveSessionId: (id: string | null) => void;
  translateApiKeyError: (error: string) => string;
}

const hasLockableActiveFile = (files: UploadedFile[]) =>
  files.some((file) => usesGeminiFilesApiReference(file) && file.fileUri && file.uploadState === 'active');

export const useModelRequestRunner = ({
  appSettings,
  currentChatSettings,
  updateAndPersistSessions,
  setActiveSessionId,
  translateApiKeyError,
}: UseModelRequestRunnerParams) => {
  const createErrorSession = useCallback(
    (content: string, title: string) => {
      const errorMessage = createMessage('error', content);
      const newSession = createNewSession({ ...DEFAULT_CHAT_SETTINGS, ...appSettings }, [errorMessage], title);

      updateAndPersistSessions((prev) => [newSession, ...prev]);
      setActiveSessionId(newSession.id);
    },
    [appSettings, setActiveSessionId, updateAndPersistSessions],
  );

  const prepareModelRequest = useCallback(
    ({
      activeModelId,
      apiRoute,
      files,
      historyMessages,
      messages,
      keySettings = currentChatSettings,
      keyOptions,
      generationId,
      generationStartTime,
    }: PrepareModelRequestParams): ModelRequestPreparation => {
      if (!activeModelId) {
        logService.error('Send message failed: No model selected.');
        createErrorSession(messages.noModelSelected, messages.noModelTitle);
        return { ok: false };
      }

      const keyResult = getKeyForRequest(appSettings, keySettings, {
        ...keyOptions,
        apiMode: apiRoute?.apiMode,
        provider: apiRoute?.provider,
      });
      if ('error' in keyResult) {
        logService.error('Send message failed: API Key not configured.');
        createErrorSession(translateApiKeyError(keyResult.error), messages.apiKeyTitle);
        return { ok: false };
      }

      return {
        ok: true,
        keyToUse: keyResult.key,
        isNewKey: keyResult.isNewKey,
        shouldLockKey:
          keyResult.isNewKey &&
          (hasLockableActiveFile(files) || sessionHasGeminiFilesApiReferences(historyMessages ?? [])),
        generationId: generationId ?? generateUniqueId(),
        generationStartTime: generationStartTime ?? new Date(),
        abortController: new AbortController(),
      };
    },
    [appSettings, createErrorSession, currentChatSettings, translateApiKeyError],
  );

  return {
    createErrorSession,
    prepareModelRequest,
  };
};
