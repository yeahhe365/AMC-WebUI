import React from 'react';
import { AddFileByIdInput } from './toolbar/AddFileByIdInput';
import { AddUrlInput } from './toolbar/AddUrlInput';
import { AspectRatioSelector } from './toolbar/AspectRatioSelector';
import { ImageSizeSelector } from './toolbar/ImageSizeSelector';
import { ImageOutputModeSelector } from './toolbar/ImageOutputModeSelector';
import { QuadImageToggle } from './toolbar/QuadImageToggle';
import { TtsVoiceSelector } from './toolbar/TtsVoiceSelector';
import { LanguageDirectionSelector } from './toolbar/LanguageDirectionSelector';
import { MediaResolutionSelector } from './toolbar/MediaResolutionSelector';
import { TranscribeCluster } from './toolbar/TranscribeCluster';
import { Clapperboard } from 'lucide-react';
import { useChatStore } from '@/stores/chatStore';
import { useChatInputToolbarContext } from './ChatInputContext';
import { useI18n } from '@/contexts/I18nContext';
import { TOOLBAR_IMAGE_CLUSTER_CLASS } from '@/constants/designTokens';

const ChatInputToolbarComponent: React.FC = () => {
  const { t } = useI18n();
  const {
    appSettings,
    currentChatSettings,
    capabilities,
    isLoading,
    setCurrentChatSettings,
    onToggleQuadImages,
    showAddByIdInput,
    fileIdInput,
    setFileIdInput,
    onAddFileByIdSubmit,
    onCancelAddById,
    isAddingById,
    showAddByUrlInput,
    urlInput,
    setUrlInput,
    onAddUrlSubmit,
    onCancelAddUrl,
    isAddingByUrl,
    ttsContext,
    onEditTtsContext,
    onAttachmentAction,
  } = useChatInputToolbarContext();
  const {
    isImageGenerationModel,
    isGemini3ImageModel,
    isTtsModel,
    isNativeAudioModel,
    isLiveTranslate,
    supportedAspectRatios,
    supportedImageSizes,
  } = capabilities;
  const aspectRatio = useChatStore((state) => state.aspectRatio);
  const setAspectRatio = useChatStore((state) => state.setAspectRatio);
  const imageSize = useChatStore((state) => state.imageSize);
  const setImageSize = useChatStore((state) => state.setImageSize);
  const imageOutputMode = useChatStore((state) => state.imageOutputMode);
  const setImageOutputMode = useChatStore((state) => state.setImageOutputMode);
  const fileError = useChatStore((state) => state.appFileError);
  const ttsVoice = currentChatSettings.ttsVoice;
  const mediaResolution = currentChatSettings.mediaResolution;
  const generateQuadImages = appSettings.generateQuadImages ?? false;
  const setTtsVoice = (voice: string) => setCurrentChatSettings((prev) => ({ ...prev, ttsVoice: voice }));
  const setMediaResolution = (resolution: typeof mediaResolution) =>
    setCurrentChatSettings((prev) => ({ ...prev, mediaResolution: resolution }));
  const showAspectRatio = (isImageGenerationModel || isGemini3ImageModel) && !!aspectRatio;
  // Only show size control when the user has a real choice.
  const showImageSize = !!supportedImageSizes && supportedImageSizes.length > 1 && !!imageSize;
  const showImageOutputMode = isImageGenerationModel && !!imageOutputMode;
  const showQuadToggle = (isImageGenerationModel || isGemini3ImageModel) && generateQuadImages !== undefined;
  const showImageCluster = showAspectRatio || showImageSize || showImageOutputMode || showQuadToggle;

  // Allow voice selection for TTS and Native Audio (Live) models, except Live Translate
  // and Live Transcribe (which output translated speech or text only).
  const canShowTtsVoice =
    (isTtsModel || isNativeAudioModel) && !isLiveTranslate && !capabilities.isLiveTranscribe && Boolean(ttsVoice);

  // Live Translate models show a language-direction selector instead of voice
  const canShowLanguageDirection = isLiveTranslate;

  // Show Media Resolution selector for Native Audio multimodal (Live API) to control stream quality
  const canShowMediaResolution =
    isNativeAudioModel && !isLiveTranslate && !capabilities.isLiveTranscribe && Boolean(mediaResolution);

  // Show Transcribe cluster for Gemini 3.5 Transcribe (batch file transcription)
  const canShowTranscribeCluster = capabilities.isTranscribeModel && !capabilities.isLiveTranscribe;

  const hasVisibleContent =
    showAspectRatio ||
    showImageSize ||
    showImageOutputMode ||
    showQuadToggle ||
    canShowTtsVoice ||
    canShowLanguageDirection ||
    canShowMediaResolution ||
    canShowTranscribeCluster ||
    fileError ||
    showAddByIdInput ||
    showAddByUrlInput;

  return (
    <div
      className={`flex flex-col gap-1 transition-all duration-200 ease-out ${
        hasVisibleContent
          ? 'mb-1.5 opacity-100 translate-y-0'
          : 'opacity-0 -translate-y-1 h-0 overflow-hidden pointer-events-none'
      }`}
    >
      {(showImageCluster ||
        canShowTtsVoice ||
        canShowLanguageDirection ||
        canShowMediaResolution ||
        canShowTranscribeCluster ||
        isTtsModel) && (
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {canShowTranscribeCluster && (
            <TranscribeCluster
              currentChatSettings={currentChatSettings}
              setCurrentChatSettings={setCurrentChatSettings}
              onAttachmentAction={onAttachmentAction}
            />
          )}
          {canShowTtsVoice && <TtsVoiceSelector ttsVoice={ttsVoice} setTtsVoice={setTtsVoice} />}
          {canShowLanguageDirection && <LanguageDirectionSelector />}
          {isTtsModel && (
            <button
              type="button"
              onClick={onEditTtsContext}
              className={`flex items-center gap-2 h-9 px-3 rounded-lg text-xs font-medium transition-colors duration-150 border focus:outline-none focus:ring-2 focus:ring-[var(--theme-border-focus)] ${
                ttsContext && ttsContext.trim()
                  ? 'bg-[var(--theme-bg-accent)]/10 text-[var(--theme-text-link)] border-[var(--theme-border-focus)]'
                  : 'bg-[var(--theme-bg-input)] text-[var(--theme-text-primary)] border-[var(--theme-border-secondary)] hover:border-[var(--theme-border-focus)]'
              }`}
              title={t('ttsDirectorNotesTitle')}
            >
              <div className="flex items-center gap-2">
                <Clapperboard
                  size={14}
                  strokeWidth={1.5}
                  className={
                    ttsContext && ttsContext.trim()
                      ? 'text-[var(--theme-text-link)]'
                      : 'text-[var(--theme-text-tertiary)]'
                  }
                />
                <span>{t('ttsDirectorNotesContext')}</span>
              </div>
              {ttsContext && ttsContext.trim() && (
                <div className="w-1.5 h-1.5 rounded-full bg-[var(--theme-text-link)]" />
              )}
            </button>
          )}
          {canShowMediaResolution && mediaResolution !== undefined && (
            <MediaResolutionSelector mediaResolution={mediaResolution} setMediaResolution={setMediaResolution} />
          )}
          {showImageCluster && (
            <div className={TOOLBAR_IMAGE_CLUSTER_CLASS} data-testid="image-settings-cluster">
              {showAspectRatio && (
                <AspectRatioSelector
                  aspectRatio={aspectRatio!}
                  setAspectRatio={setAspectRatio!}
                  supportedRatios={supportedAspectRatios}
                />
              )}
              {showImageSize && (
                <ImageSizeSelector
                  imageSize={imageSize!}
                  setImageSize={setImageSize!}
                  supportedSizes={supportedImageSizes}
                />
              )}
              {showImageOutputMode && (
                <ImageOutputModeSelector imageOutputMode={imageOutputMode!} setImageOutputMode={setImageOutputMode!} />
              )}
              {showQuadToggle && <QuadImageToggle enabled={generateQuadImages!} onToggle={onToggleQuadImages!} />}
            </div>
          )}
        </div>
      )}
      {fileError && (
        <div className="p-2 text-sm text-[var(--theme-text-danger)] bg-[var(--theme-bg-error-message)] border border-[var(--theme-bg-danger)] rounded-md animate-in fade-in duration-150">
          {fileError}
        </div>
      )}
      {showAddByIdInput && (
        <AddFileByIdInput
          fileIdInput={fileIdInput}
          setFileIdInput={setFileIdInput}
          onAddFileByIdSubmit={onAddFileByIdSubmit}
          onCancel={onCancelAddById}
          isAddingById={isAddingById}
          isLoading={isLoading}
        />
      )}
      {showAddByUrlInput && (
        <AddUrlInput
          urlInput={urlInput}
          setUrlInput={setUrlInput}
          onAddUrlSubmit={onAddUrlSubmit}
          onCancel={onCancelAddUrl}
          isAddingByUrl={isAddingByUrl}
          isLoading={isLoading}
        />
      )}
    </div>
  );
};

export const ChatInputToolbar = React.memo(ChatInputToolbarComponent);
