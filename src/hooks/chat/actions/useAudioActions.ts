import { useCallback } from 'react';
import { type AppSettings, type ChatSettings as IndividualChatSettings, type UploadedFile } from '@/types';
import { logService } from '@/services/logService';
import { formatApiKeyErrorMessage, getGeminiKeyForRequest } from '@/utils/apiKeySelection';
import { transcribeAudioApi } from '@/services/api/generation/audioApi';
import { useI18n } from '@/contexts/I18nContext';
import { isThirdPartyApiRoute } from '@/utils/chatApiRoute';
import { usesRemoteFileReference } from '@/utils/chat/fileTransferStrategy';
import { formatI18nErrorMessage } from '@/i18n/interpolate';
import { getErrorMessage } from '@/utils/errorMessage';
import { DEFAULT_TRANSCRIPTION_MODEL_ID } from '@/constants/modelConfiguration';

interface UseAudioActionsProps {
  appSettings: AppSettings;
  currentChatSettings: IndividualChatSettings;
  setCurrentChatSettings: (updater: (prevSettings: IndividualChatSettings) => IndividualChatSettings) => void;
  setAppFileError: (error: string | null) => void;
  selectedFiles: UploadedFile[];
}

export const useAudioActions = ({
  appSettings,
  currentChatSettings,
  setCurrentChatSettings,
  setAppFileError,
  selectedFiles,
}: UseAudioActionsProps) => {
  const { t } = useI18n();
  const handleTranscribeAudio = useCallback(
    async (audioFile: File): Promise<string | null> => {
      logService.info('Starting transcription process...');
      setAppFileError(null);

      const keyResult = getGeminiKeyForRequest(appSettings, currentChatSettings);
      if ('error' in keyResult) {
        setAppFileError(formatApiKeyErrorMessage(keyResult.error, t));
        logService.error('Transcription failed: API key error.', { error: keyResult.error });
        return null;
      }

      if (keyResult.isNewKey && !isThirdPartyApiRoute(appSettings, currentChatSettings)) {
        const fileRequiresApi = selectedFiles.some(
          (selectedFile) => usesRemoteFileReference(selectedFile) && selectedFile.fileUri,
        );
        if (!fileRequiresApi) {
          logService.info('New API key selected for this session due to transcription.');
          setCurrentChatSettings((prev) => ({ ...prev, lockedApiKey: keyResult.key }));
        }
      }

      try {
        const modelToUse = appSettings.transcriptionModelId || DEFAULT_TRANSCRIPTION_MODEL_ID;
        const transcribedText = await transcribeAudioApi(keyResult.key, audioFile, modelToUse);
        return transcribedText;
      } catch (error) {
        const errorMessage = getErrorMessage(error, t('transcriptionUnknownError'));
        setAppFileError(formatI18nErrorMessage(t, 'transcriptionFailedWithMessage', errorMessage));
        logService.error('Transcription failed in handler', { error });
        return null;
      }
    },
    [appSettings, currentChatSettings, setCurrentChatSettings, setAppFileError, selectedFiles, t],
  );

  return { handleTranscribeAudio };
};
