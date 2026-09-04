import React from 'react';
import { PhoneOff, AudioWaveform, Mic, MicOff, MonitorUp, Video, VideoOff } from 'lucide-react';
import { CHAT_INPUT_BUTTON_CLASS } from '@/constants/buttonClasses';
import { useChatInputActionsContext } from '@/components/chat/input/ChatInputContext';
import { useI18n } from '@/contexts/I18nContext';

export const LiveControls: React.FC = () => {
  const {
    isLiveConnected,
    isLiveMuted,
    isLiveTranslate,
    isLiveTranscribe,
    onStartLiveSession,
    onDisconnectLiveSession,
    onToggleLiveMute,
    onStartLiveCamera,
    onStartLiveScreenShare,
    onStopLiveVideo,
    liveVideoSource,
    disabled,
    isRecording,
    isTranscribing,
  } = useChatInputActionsContext();
  const { t } = useI18n();
  const micIconSize = 20;
  const handleSessionClick = isLiveConnected ? onDisconnectLiveSession : onStartLiveSession;
  const cameraLabel = t('liveStartCamera');
  const screenShareLabel = t('liveStartScreenShare');
  const stopVideoLabel = t('liveStopVideo');
  const muteLabel = isLiveMuted ? t('liveUnmuteMicrophone') : t('liveMuteMicrophone');
  const sessionLabel = isLiveConnected ? t('liveEndSession') : t('liveStartSession');
  const idleButtonClass = `${CHAT_INPUT_BUTTON_CLASS} bg-transparent text-[var(--theme-icon-settings)] hover:bg-[var(--theme-bg-tertiary)]`;
  const activeSourceClass = `${CHAT_INPUT_BUTTON_CLASS} bg-[var(--theme-bg-accent)]/10 text-[var(--theme-text-primary)]`;
  const dangerButtonClass = `${CHAT_INPUT_BUTTON_CLASS} bg-[var(--theme-bg-danger)]/10 text-[var(--theme-text-danger)] hover:bg-[var(--theme-bg-danger)]/20`;

  const supportsLiveVideo = !isLiveTranslate && !isLiveTranscribe;

  return (
    <>
      {supportsLiveVideo && onStartLiveCamera && (
        <button
          type="button"
          onClick={onStartLiveCamera}
          disabled={disabled || liveVideoSource === 'camera'}
          className={liveVideoSource === 'camera' ? activeSourceClass : idleButtonClass}
          aria-label={cameraLabel}
          title={cameraLabel}
        >
          <Video size={micIconSize} strokeWidth={2} />
        </button>
      )}

      {supportsLiveVideo && onStartLiveScreenShare && (
        <button
          type="button"
          onClick={onStartLiveScreenShare}
          disabled={disabled || liveVideoSource === 'screen'}
          className={liveVideoSource === 'screen' ? activeSourceClass : idleButtonClass}
          aria-label={screenShareLabel}
          title={screenShareLabel}
        >
          <MonitorUp size={micIconSize} strokeWidth={2} />
        </button>
      )}

      {liveVideoSource && onStopLiveVideo && (
        <button
          type="button"
          onClick={onStopLiveVideo}
          disabled={disabled}
          className={dangerButtonClass}
          aria-label={stopVideoLabel}
          title={stopVideoLabel}
        >
          <VideoOff size={micIconSize} strokeWidth={2} />
        </button>
      )}

      {isLiveConnected && onToggleLiveMute && (
        <button
          type="button"
          onClick={onToggleLiveMute}
          disabled={disabled}
          className={isLiveMuted ? dangerButtonClass : idleButtonClass}
          aria-label={muteLabel}
          title={muteLabel}
        >
          {isLiveMuted ? <MicOff size={micIconSize} strokeWidth={2} /> : <Mic size={micIconSize} strokeWidth={2} />}
        </button>
      )}

      {!isRecording && !isTranscribing && (
        <button
          type="button"
          onClick={handleSessionClick}
          disabled={disabled}
          className={isLiveConnected ? dangerButtonClass : idleButtonClass}
          aria-label={sessionLabel}
          title={sessionLabel}
        >
          {isLiveConnected ? (
            <PhoneOff size={micIconSize} strokeWidth={2} />
          ) : (
            <AudioWaveform size={micIconSize} strokeWidth={2} />
          )}
        </button>
      )}
    </>
  );
};
