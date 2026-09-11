import { logService } from '@/services/logService';
import { useCallback } from 'react';
import {
  type AppSettings,
  type ChatSettings,
  type UploadedFile,
  type MediaResolution,
  type SetSelectedFiles,
} from '@/types';
import { buildContentParts } from '@/utils/chat/builder';
import { useI18n } from '@/contexts/I18nContext';
import { formatApiKeyErrorMessage, getGeminiKeyForRequest } from '@/utils/apiKeySelection';
import { ensureFilesApiReferences, formatFileReferenceErrorMessage } from '@/features/message-sender/fileApiReference';

export interface LiveModeApi {
  isConnected: boolean;
  connect: () => Promise<boolean>;
  sendText: (text: string) => Promise<boolean>;
  sendContent: (parts: Awaited<ReturnType<typeof buildContentParts>>['contentParts']) => Promise<boolean>;
}

interface UseLiveModeHandlerParams {
  isNativeAudioModel: boolean;
  selectedFiles: UploadedFile[];
  setSelectedFiles: SetSelectedFiles;
  setAppFileError: (error: string | null) => void;
  appSettings: AppSettings;
  currentChatSettings: ChatSettings;
  currentModelId: string;
  mediaResolution?: MediaResolution;
  liveApi: LiveModeApi;
  onAddUserMessage?: (text: string, files?: UploadedFile[]) => void;
  onSendMessage: (text: string, options?: { isFastMode?: boolean; files?: UploadedFile[] }) => void;
}

export const useLiveModeHandler = ({
  isNativeAudioModel,
  selectedFiles,
  setSelectedFiles,
  setAppFileError,
  appSettings,
  currentChatSettings,
  currentModelId,
  mediaResolution,
  liveApi,
  onAddUserMessage,
  onSendMessage,
}: UseLiveModeHandlerParams) => {
  const { t } = useI18n();

  const handleSmartSendMessage = useCallback(
    async (text: string, options?: { isFastMode?: boolean; files?: UploadedFile[] }) => {
      if (!isNativeAudioModel) {
        onSendMessage(text, options);
        return;
      }

      const filesToSend = options?.files ?? selectedFiles;
      let didConnect = liveApi.isConnected;
      if (!liveApi.isConnected) {
        try {
          didConnect = await liveApi.connect();
        } catch (error) {
          logService.error('Failed to auto-connect Live API:', error);
          return;
        }
      }

      if (!didConnect) {
        return;
      }

      let filesReadyForSend = filesToSend;
      if (filesToSend.length > 0) {
        const keyResult = getGeminiKeyForRequest(appSettings, currentChatSettings, {
          skipIncrement: true,
          skipUsageLogging: true,
        });

        if ('error' in keyResult) {
          setAppFileError(formatApiKeyErrorMessage(keyResult.error, t));
          return;
        }

        const fileReferenceResult = await ensureFilesApiReferences({
          files: filesToSend,
          apiKey: keyResult.key,
          abortSignal: new AbortController().signal,
          onFileUpdate: (fileId, patch) => {
            if (options?.files !== undefined) {
              return;
            }

            setSelectedFiles((prev) => prev.map((file) => (file.id === fileId ? { ...file, ...patch } : file)));
          },
        });

        if (!fileReferenceResult.ok) {
          setAppFileError(formatFileReferenceErrorMessage(fileReferenceResult, t));
          return;
        }

        filesReadyForSend = fileReferenceResult.files;
      }

      setAppFileError(null);
      let enrichedFiles = filesReadyForSend;
      let didSend: boolean;
      if (filesReadyForSend.length > 0) {
        const builtContent = await buildContentParts(text, filesReadyForSend, currentModelId, mediaResolution);
        enrichedFiles = builtContent.enrichedFiles;
        didSend = await liveApi.sendContent(builtContent.contentParts);
      } else {
        didSend = await liveApi.sendText(text);
      }

      if (!didSend) {
        return;
      }

      onAddUserMessage?.(text, enrichedFiles);
      setSelectedFiles([]);
    },
    [
      appSettings,
      currentChatSettings,
      currentModelId,
      isNativeAudioModel,
      liveApi,
      mediaResolution,
      onAddUserMessage,
      onSendMessage,
      selectedFiles,
      setAppFileError,
      setSelectedFiles,
      t,
    ],
  );

  return { handleSmartSendMessage };
};
