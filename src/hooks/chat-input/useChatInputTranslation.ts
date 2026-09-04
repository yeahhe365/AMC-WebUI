import { logService } from '@/services/logService';
import { getErrorMessage } from '@/utils/errorMessage';
import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { AppSettings, ChatSettings } from '@/types';
import { translateTextApi } from '@/services/api/generation/textApi';
import { formatApiKeyErrorMessage, getGeminiKeyForRequest } from '@/utils/apiKeySelection';
import { useI18n } from '@/contexts/I18nContext';
import { formatI18nErrorMessage } from '@/i18n/interpolate';

interface UseChatInputTranslationParams {
  appSettings: AppSettings;
  currentChatSettings: ChatSettings;
  inputText: string;
  isTranslating: boolean;
  setInputText: Dispatch<SetStateAction<string>>;
  setTranslating: (isTranslating: boolean) => void;
  setAppFileError: (error: string | null) => void;
}

export const useChatInputTranslation = ({
  appSettings,
  currentChatSettings,
  inputText,
  isTranslating,
  setInputText,
  setTranslating,
  setAppFileError,
}: UseChatInputTranslationParams) => {
  const { t } = useI18n();
  const handleTranslate = useCallback(async () => {
    if (!inputText.trim() || isTranslating) {
      return;
    }

    setTranslating(true);
    setAppFileError(null);

    const keyResult = getGeminiKeyForRequest(appSettings, currentChatSettings, { skipIncrement: true });
    if ('error' in keyResult) {
      setAppFileError(formatApiKeyErrorMessage(keyResult.error, t));
      setTranslating(false);
      return;
    }

    try {
      const translatedText = await translateTextApi(
        keyResult.key,
        inputText,
        appSettings.translationTargetLanguage ?? 'English',
        appSettings.inputTranslationModelId,
      );
      setInputText(translatedText);
    } catch (error) {
      logService.error('Input translation failed:', error);
      const message = getErrorMessage(error);
      setAppFileError(formatI18nErrorMessage(t, 'translateFailedWithMessage', message));
    } finally {
      setTranslating(false);
    }
  }, [appSettings, currentChatSettings, inputText, isTranslating, setAppFileError, setInputText, setTranslating, t]);

  return { handleTranslate };
};
