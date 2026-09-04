import { type MutableRefObject, useEffect, useRef, useCallback } from 'react';
import type { SupportedLanguage } from '@/i18n/languageRegistry';
import { type AppSettings, type SavedChatSession, type ChatSettings as IndividualChatSettings } from '@/types';
import { logService } from '@/services/logService';
import { getGeminiKeyForRequest } from '@/utils/apiKeySelection';
import { getModelCapabilities } from '@/utils/model/modelCapabilities';
import { generateSuggestionsApi } from '@/services/api/generation/textApi';
import { getVisibleChatMessages } from '@/utils/chat/visibility';
import { isThirdPartyApiRoute } from '@/utils/chatApiRoute';

type MessageUpdater = (
  sessionId: string,
  messageId: string,
  updates: Partial<SavedChatSession['messages'][number]>,
) => void;

interface SuggestionsProps {
  appSettings: AppSettings;
  activeChat: SavedChatSession | undefined;
  isLoading: boolean;
  updateMessageInSession: MessageUpdater;
  language: SupportedLanguage;
  sessionKeyMapRef?: MutableRefObject<Map<string, string>>;
}

export const useSuggestions = ({
  appSettings,
  activeChat,
  isLoading,
  updateMessageInSession,
  language,
  sessionKeyMapRef,
}: SuggestionsProps) => {
  const prevIsLoadingRef = useRef(isLoading);

  const generateAndAttachSuggestions = useCallback(
    async (
      sessionId: string,
      messageId: string,
      userContent: string,
      modelContent: string,
      sessionSettings: IndividualChatSettings,
    ) => {
      updateMessageInSession(sessionId, messageId, { isGeneratingSuggestions: true });

      const stickyKey = isThirdPartyApiRoute(appSettings, sessionSettings)
        ? undefined
        : sessionKeyMapRef?.current?.get(sessionId);
      let keyToUse: string;

      if (stickyKey) {
        keyToUse = stickyKey;
      } else {
        const keyResult = getGeminiKeyForRequest(appSettings, sessionSettings, { skipIncrement: true });
        if ('error' in keyResult) {
          logService.error('Cannot generate suggestions: API key not configured.');
          updateMessageInSession(sessionId, messageId, { isGeneratingSuggestions: false });
          return;
        }
        keyToUse = keyResult.key;
      }

      try {
        const suggestions = await generateSuggestionsApi(keyToUse, userContent, modelContent, language);
        if (suggestions && suggestions.length > 0) {
          updateMessageInSession(sessionId, messageId, { suggestions, isGeneratingSuggestions: false });
        } else {
          updateMessageInSession(sessionId, messageId, { isGeneratingSuggestions: false });
        }
      } catch (error) {
        logService.error('Suggestion generation failed in handler', { error });
        updateMessageInSession(sessionId, messageId, { isGeneratingSuggestions: false });
      }
    },
    [appSettings, language, updateMessageInSession, sessionKeyMapRef],
  );

  useEffect(() => {
    if (prevIsLoadingRef.current && !isLoading && appSettings.isSuggestionsEnabled && activeChat) {
      const { id: sessionId, settings } = activeChat;
      const messages = getVisibleChatMessages(activeChat.messages);

      const capabilities = getModelCapabilities(settings.modelId);

      if (!capabilities.permissions.canGenerateSuggestions) {
        prevIsLoadingRef.current = isLoading;
        return;
      }

      if (messages.length < 2) return;

      const lastMessage = messages[messages.length - 1];
      const secondLastMessage = messages[messages.length - 2];

      if (
        lastMessage.role === 'model' &&
        !lastMessage.isLoading &&
        !lastMessage.stoppedByUser &&
        secondLastMessage.role === 'user' &&
        !lastMessage.suggestions &&
        lastMessage.isGeneratingSuggestions === undefined
      ) {
        generateAndAttachSuggestions(
          sessionId,
          lastMessage.id,
          secondLastMessage.content.slice(0, 4000),
          lastMessage.content.slice(0, 4000),
          settings,
        );
      }
    }
    prevIsLoadingRef.current = isLoading;
  }, [isLoading, activeChat, appSettings.isSuggestionsEnabled, generateAndAttachSuggestions]);
};
