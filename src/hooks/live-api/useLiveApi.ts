import { useRef, useEffect, useMemo } from 'react';
import type { Session as LiveSession } from '@google/genai';
import type { AppSettings, ChatSettings, LiveClientFunctions, LiveTranscriptHandler, UploadedFile } from '@/types';
import { useLiveAudio } from './useLiveAudio';
import { useLiveVideo } from './useLiveVideo';
import { useLiveConfig } from './useLiveConfig';
import { useLiveMessageProcessing } from './useLiveMessageProcessing';
import { useLiveConnection } from './useLiveConnection';
import { useLiveFrameCapture } from './useLiveFrameCapture';
import { resolveLiveErrorText } from '@/utils/live-api/liveErrorState';
import { useBackgroundKeepAlive } from '@/hooks/core/useBackgroundKeepAlive';
import { useI18n } from '@/contexts/I18nContext';
import { getLiveApiKey } from '@/utils/apiKeySelection';
import { useStateWithRef } from '@/hooks/useStateWithRef';

interface UseLiveApiProps {
  appSettings: AppSettings;
  chatSettings: ChatSettings;
  modelId: string;
  onClose?: () => void;
  onTranscript?: LiveTranscriptHandler;
  onGeneratedFiles?: (files: UploadedFile[]) => void;
  clientFunctions?: LiveClientFunctions;
  liveTranslateConfig?: {
    targetLanguageCode: string;
    echoTargetLanguage: boolean;
  };
  isPushToTalk?: boolean;
  allowBargeIn?: boolean;
}

export const useLiveApi = ({
  appSettings,
  chatSettings,
  modelId,
  onClose,
  onTranscript,
  onGeneratedFiles,
  clientFunctions,
  liveTranslateConfig,
  isPushToTalk,
  allowBargeIn,
}: UseLiveApiProps) => {
  const { t } = useI18n();
  const sessionRef = useRef<Promise<LiveSession> | null>(null);
  const goAwayHandlerRef = useRef<(goAway: { timeLeft?: string }) => void>(() => {});

  const [sessionHandle, setSessionHandle, sessionHandleRef] = useStateWithRef<string | null>(null);

  const { volume, isSpeaking, isMuted, toggleMute, initializeAudio, playAudioChunk, stopAudioPlayback, cleanupAudio } =
    useLiveAudio();

  const { videoStream, videoSource, videoRef, startCamera, startScreenShare, stopVideo, captureFrame } = useLiveVideo();

  const { liveConfig, tools } = useLiveConfig({
    chatSettings,
    sessionHandle,
    clientFunctions,
    liveTranslateConfig,
    isPushToTalk,
    allowBargeIn,
  });
  const liveApiKeyForConnection = useMemo(() => {
    return getLiveApiKey(appSettings, chatSettings);
  }, [appSettings, chatSettings]);

  const { handleMessage, clearBufferedAudio } = useLiveMessageProcessing({
    playAudioChunk,
    stopAudioPlayback,
    onTranscript,
    onGoAway: (goAway) => goAwayHandlerRef.current(goAway),
    onGeneratedFiles,
    clientFunctions,
    sessionRef,
    setSessionHandle,
    sessionHandleRef,
  });

  const {
    isConnected,
    isReconnecting,
    errorState,
    connect,
    handleGoAway,
    disconnect,
    sendText,
    sendContent,
    signalActivityStart,
    signalActivityEnd,
    sendAudioStreamEnd,
  } = useLiveConnection({
    appSettings,
    modelId,
    liveConfig,
    liveApiKeyForConnection,
    tools,
    initializeAudio,
    cleanupAudio,
    clearBufferedAudio,
    stopVideo,
    handleMessage,
    onClose,
    onTranscript,
    setSessionHandle,
    sessionHandleRef,
    sessionRef,
  });
  useEffect(() => {
    goAwayHandlerRef.current = handleGoAway;
  }, [handleGoAway]);

  const error = useMemo(() => resolveLiveErrorText(errorState, t), [errorState, t]);

  useLiveFrameCapture({
    isConnected,
    videoStream,
    videoSource,
    volume,
    isMuted,
    captureFrame,
    sessionRef,
  });

  useBackgroundKeepAlive(isConnected);

  return useMemo(
    () => ({
      isConnected,
      isSpeaking,
      isMuted,
      toggleMute,
      error,
      volume,
      connect,
      disconnect,
      sendText,
      sendContent,
      signalActivityStart,
      signalActivityEnd,
      sendAudioStreamEnd,
      videoStream,
      videoSource,
      startCamera,
      startScreenShare,
      stopVideo,
      videoRef,
      isReconnecting,
    }),
    [
      isConnected,
      isSpeaking,
      isMuted,
      toggleMute,
      error,
      volume,
      connect,
      disconnect,
      sendText,
      sendContent,
      signalActivityStart,
      signalActivityEnd,
      sendAudioStreamEnd,
      videoStream,
      videoSource,
      startCamera,
      startScreenShare,
      stopVideo,
      videoRef,
      isReconnecting,
    ],
  );
};
