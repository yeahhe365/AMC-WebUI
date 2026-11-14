import type { AppSettings, ChatMessage, ChatSettings, UploadedFile } from '@/types';
import { generateOmniVideo } from '@/services/api/generation/omniVideoApi';
import { createManagedObjectUrl } from '@/services/objectUrlManager';
import { getGeminiApiBaseUrlForSettings, getNormalizedUpstreamBaseUrl } from '@/services/api/geminiApiBaseUrl';
import { getApiKeyFingerprint } from '@/utils/chat/geminiFilesApi';
import { generateUniqueId } from '@/utils/chat/ids';
import { runOptimisticMessagePipeline, type MessageLifecycleRunner } from './messagePipeline';
import type { MessageSenderTranslator, SessionsUpdater } from './messageSenderTypes';

interface SendOmniVideoMessageParams {
  keyToUse: string;
  activeSessionId: string | null;
  messages: ChatMessage[];
  generationId: string;
  abortController: AbortController;
  appSettings: AppSettings;
  currentChatSettings: ChatSettings;
  text: string;
  files: UploadedFile[];
  editingMessageId: string | null;
  retryModelMessageId?: string;
  updateAndPersistSessions: SessionsUpdater;
  setActiveSessionId: (id: string | null) => void;
  setActiveMessages: (messages: ChatMessage[]) => void;
  runMessageLifecycle: MessageLifecycleRunner;
  t: MessageSenderTranslator;
}

export const sendOmniVideoMessage = async ({
  keyToUse,
  activeSessionId,
  messages,
  generationId,
  abortController,
  appSettings,
  currentChatSettings,
  text,
  files,
  editingMessageId,
  retryModelMessageId,
  updateAndPersistSessions,
  setActiveSessionId,
  setActiveMessages,
  runMessageLifecycle,
  t,
}: SendOmniVideoMessageParams) => {
  const previous = [...messages]
    .reverse()
    .find((message) => message.role === 'model' && message.omniInteraction)?.omniInteraction;
  const keyFingerprint = getApiKeyFingerprint(keyToUse);
  const apiBase = getNormalizedUpstreamBaseUrl(appSettings) ?? getGeminiApiBaseUrlForSettings(appSettings);
  const placement = retryModelMessageId
    ? ({ type: 'retry-model', targetMessageId: retryModelMessageId } as const)
    : ({ type: 'append-turn' } as const);

  await runOptimisticMessagePipeline({
    activeSessionId,
    appSettings,
    currentChatSettings,
    updateAndPersistSessions,
    setActiveSessionId,
    setActiveMessages,
    text,
    files: files.length ? files : undefined,
    editingMessageId,
    generationId,
    shouldLockKey: true,
    keyToLock: keyToUse,
    placement,
    abortController,
    errorPrefix: t('omniErrorPrefix'),
    runMessageLifecycle,
    execute: async (turn) => {
      if (previous && (previous.keyFingerprint !== keyFingerprint || previous.apiBase !== apiBase)) {
        throw new Error(t('omniCredentialChanged'));
      }
      let result: Awaited<ReturnType<typeof generateOmniVideo>>;
      try {
        result = await generateOmniVideo({
          apiKey: keyToUse,
          appSettings,
          text,
          files,
          previousInteractionId: previous?.id,
          signal: abortController.signal,
        });
      } catch (error) {
        if (previous && typeof error === 'object' && error !== null && 'status' in error && error.status === 404) {
          throw new Error(t('omniHistoryUnavailable'), { cause: error });
        }
        throw error;
      }
      if (abortController.signal.aborted) throw new DOMException('Video generation cancelled', 'AbortError');
      let generatedFiles: UploadedFile[] | undefined;
      if (result.video) {
        const fileId = generateUniqueId();
        const video: UploadedFile = {
          id: fileId,
          name: `generated-video-${fileId}.mp4`,
          type: result.video.type || 'video/mp4',
          size: result.video.size,
          rawFile: result.video,
          dataUrl: createManagedObjectUrl(result.video, {
            key: `session-file:${turn.finalSessionId}:${turn.modelMessageId}:${fileId}`,
            ownerId: `session:${turn.finalSessionId}`,
          }),
          uploadState: 'active',
          transferStrategy: 'inline',
        };
        generatedFiles = [video];
      }
      return {
        patch: {
          isLoading: false,
          ...(result.text ? { content: result.text } : {}),
          ...(generatedFiles ? { files: generatedFiles } : {}),
          omniInteraction: { id: result.interactionId, keyFingerprint, apiBase },
          generationEndTime: new Date(),
        },
      };
    },
  });
};
