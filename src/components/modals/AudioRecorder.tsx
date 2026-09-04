import { logService } from '@/services/logService';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, X, Loader2, AlertCircle, ChevronRight, Trash2, Radio, Check, Sparkles, RefreshCw } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { toastError } from '@/stores/toastStore';
import { AudioPlayer } from '@/components/shared/AudioPlayer';
import { useAudioRecorder } from '@/features/audio/useAudioRecorder';
import { useAudioAnalyser } from '@/features/audio/useAudioAnalyser';
import { AudioVisualizer } from '@/components/audio/AudioVisualizer';
import { RecorderControls } from '@/components/audio/RecorderControls';
import { Select } from '@/components/shared/Select';
import { MAX_RECORDING_SECONDS, RECORDING_DURATION_WARNING_SECONDS } from '@/hooks/core/useRecorder';
import { FOCUS_VISIBLE_RING_PRIMARY_OFFSET_CLASS } from '@/constants/focusClasses';
import { MODAL_CLOSE_BUTTON_CLASS } from '@/constants/buttonClasses';
import { SETTINGS_SECTION_LABEL_CLASS } from '@/constants/designTokens';
import { formatClockTime } from '@/utils/formatClockTime';
import { useI18n } from '@/contexts/I18nContext';
import { interpolate } from '@/i18n/interpolate';
import { useSettingsStore } from '@/stores/settingsStore';
import { useLiveTranscription } from '@/hooks/live-api/useLiveTranscription';

interface AudioRecorderProps {
  onRecord: (file: File) => Promise<void>;
  onCancel: () => void;
}

const WARNING_BANNER_CLASS =
  'w-full rounded-md border border-[var(--theme-text-warning)]/35 bg-[var(--theme-bg-warning)] px-3 py-2 text-sm text-[var(--theme-text-warning)]';

const padTimePart = (value: number) => value.toString().padStart(2, '0');

const getRecordingExtension = (mimeType: string | null): string => {
  if (!mimeType) return 'webm';
  if (mimeType.includes('mp4')) return 'm4a';
  if (mimeType.includes('ogg')) return 'ogg';
  return 'webm';
};

const buildRecordingFileName = (mimeType: string | null): string => {
  const capturedAt = new Date();
  const month = padTimePart(capturedAt.getMonth() + 1);
  const day = padTimePart(capturedAt.getDate());
  const hours = padTimePart(capturedAt.getHours());
  const minutes = padTimePart(capturedAt.getMinutes());
  const seconds = padTimePart(capturedAt.getSeconds());

  return `rec-${month}${day}-${hours}${minutes}${seconds}.${getRecordingExtension(mimeType)}`;
};

export const AudioRecorder: React.FC<AudioRecorderProps> = ({ onRecord, onCancel }) => {
  const { t } = useI18n();
  const appSettings = useSettingsStore((state) => state.appSettings);
  const [activeTab, setActiveTab] = useState<'standard' | 'live'>('standard');
  const [transcribeMode, setTranscribeMode] = useState<'SMART' | 'VERBATIM'>('SMART');

  const {
    viewState,
    isInitializing,
    isPaused,
    recordingTime,
    audioBlob,
    audioUrl,
    error,
    errorKind,
    recordedMimeType,
    hasHitDurationLimit,
    audioInputDevices,
    selectedDeviceId,
    setSelectedDeviceId,
    stream,
    status,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    discardRecording,
  } = useAudioRecorder();

  const { analyser, isSilent } = useAudioAnalyser(stream);

  const [isSaving, setIsSaving] = useState(false);
  const [isConfirmingDiscard, setIsConfirmingDiscard] = useState(false);

  // Live streaming transcription hook
  const liveTranscribe = useLiveTranscription({
    appSettings,
    options: {
      mode: transcribeMode,
    },
  });

  // Start recording when standard recorder opens
  const hasAutoStarted = useRef(false);
  useEffect(() => {
    if (activeTab === 'standard') {
      if (hasAutoStarted.current) return;
      hasAutoStarted.current = true;
      startRecording();
    }
  }, [activeTab, startRecording]);

  const handleTabSwitch = (nextTab: 'standard' | 'live') => {
    if (nextTab === activeTab) return;
    if (activeTab === 'standard') {
      discardRecording();
    } else {
      liveTranscribe.cancelListening();
    }
    setActiveTab(nextTab);
    if (nextTab === 'standard') {
      startRecording();
    } else {
      void liveTranscribe.startListening();
    }
  };

  const handleSave = async () => {
    if (!audioBlob) return;
    setIsSaving(true);
    try {
      const file = new File([audioBlob], buildRecordingFileName(recordedMimeType), {
        type: audioBlob.type || 'audio/webm',
      });
      await onRecord(file);
    } catch (saveError) {
      logService.error('Failed to save audio recording.', saveError);
      toastError(t('audioRecorderFailedToSave'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveLiveTranscript = async () => {
    const textToSave = (
      liveTranscribe.finalText + (liveTranscribe.interimText ? ` ${liveTranscribe.interimText}` : '')
    ).trim();
    if (!textToSave) return;
    setIsSaving(true);
    try {
      await liveTranscribe.stopListening();
      const file = new File([textToSave], `live-transcribe-${Date.now()}.txt`, {
        type: 'text/plain;charset=utf-8',
      });
      await onRecord(file);
    } catch (liveSaveError) {
      logService.error('Failed to save live transcription:', liveSaveError);
      toastError(t('audioRecorderFailedToSave'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleRerecord = useCallback(() => {
    discardRecording();
    startRecording();
  }, [discardRecording, startRecording]);

  const hasUnsavedAudio = recordingTime > 0 && (status !== 'idle' || Boolean(audioBlob));

  const requestClose = () => {
    if (activeTab === 'live') {
      liveTranscribe.cancelListening();
      onCancel();
      return;
    }
    if (hasUnsavedAudio) {
      setIsConfirmingDiscard(true);
      return;
    }
    onCancel();
  };

  const confirmDiscard = () => {
    setIsConfirmingDiscard(false);
    discardRecording();
    onCancel();
  };

  const shouldShowDevicePicker = viewState === 'idle' && audioInputDevices.length > 1;
  const isApproachingLimit = status === 'recording' && recordingTime >= RECORDING_DURATION_WARNING_SECONDS;

  return (
    <Modal
      isOpen={true}
      onClose={isConfirmingDiscard ? () => setIsConfirmingDiscard(false) : requestClose}
      contentClassName="w-full max-w-md bg-[var(--theme-bg-primary)] rounded-xl shadow-2xl overflow-hidden"
      noPadding
    >
      <div className="flex items-center justify-between px-5 pt-4 pb-3 bg-[var(--theme-bg-primary)] border-b border-[var(--theme-border-subtle)]/40">
        <h2 className="sr-only">{viewState === 'review' ? t('audioRecorderPreviewTitle') : t('audioRecorderTitle')}</h2>
        <div className="flex items-center gap-1.5 p-0.5 rounded-lg bg-[var(--theme-bg-tertiary)]/50">
          <button
            type="button"
            onClick={() => handleTabSwitch('standard')}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'standard'
                ? 'bg-[var(--theme-bg-primary)] text-[var(--theme-text-primary)] shadow-sm'
                : 'text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]'
            }`}
          >
            <Mic size={14} />
            <span>{viewState === 'review' ? t('audioRecorderPreviewTitle') : t('audioRecorderTitle')}</span>
          </button>
          <button
            type="button"
            onClick={() => handleTabSwitch('live')}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'live'
                ? 'bg-[var(--theme-bg-primary)] text-[var(--theme-text-accent)] shadow-sm'
                : 'text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]'
            }`}
          >
            <Radio
              size={14}
              className={liveTranscribe.isListening ? 'animate-pulse text-[var(--theme-text-accent)]' : ''}
            />
            <span>实时流式听写</span>
          </button>
        </div>
        <button onClick={requestClose} aria-label={t('close')} className={MODAL_CLOSE_BUTTON_CLASS}>
          <X size={20} />
        </button>
      </div>

      {activeTab === 'live' ? (
        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className={`inline-block h-2 w-2 rounded-full ${liveTranscribe.isListening ? 'bg-[var(--theme-text-success)] animate-ping' : 'bg-[var(--theme-text-tertiary)]'}`}
              />
              <span className="text-xs font-medium text-[var(--theme-text-secondary)]">
                {liveTranscribe.isListening ? '正在流式识别中...' : '已就绪'}
              </span>
            </div>
            <div className="flex items-center gap-1.5 bg-[var(--theme-bg-tertiary)]/40 p-0.5 rounded-md text-xs">
              <button
                type="button"
                onClick={() => setTranscribeMode('SMART')}
                className={`px-2 py-0.5 rounded flex items-center gap-1 transition-colors ${
                  transcribeMode === 'SMART'
                    ? 'bg-[var(--theme-bg-primary)] text-[var(--theme-text-primary)] font-medium shadow-sm'
                    : 'text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-secondary)]'
                }`}
              >
                <Sparkles size={11} className="text-[var(--theme-text-warning)]" />
                <span>Smart 智能</span>
              </button>
              <button
                type="button"
                onClick={() => setTranscribeMode('VERBATIM')}
                className={`px-2 py-0.5 rounded transition-colors ${
                  transcribeMode === 'VERBATIM'
                    ? 'bg-[var(--theme-bg-primary)] text-[var(--theme-text-primary)] font-medium shadow-sm'
                    : 'text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-secondary)]'
                }`}
              >
                逐字
              </button>
            </div>
          </div>

          <div className="min-h-36 max-h-56 overflow-y-auto rounded-lg border border-[var(--theme-border-subtle)] bg-[var(--theme-bg-tertiary)]/20 p-3.5 text-sm text-[var(--theme-text-primary)]">
            {liveTranscribe.finalText || liveTranscribe.interimText ? (
              <p className="leading-relaxed">
                <span>{liveTranscribe.finalText}</span>
                {liveTranscribe.interimText && (
                  <span className="text-[var(--theme-text-accent)] font-medium opacity-90 ml-1 bg-[var(--theme-bg-accent)]/10 px-1 rounded">
                    {liveTranscribe.interimText}
                  </span>
                )}
              </p>
            ) : (
              <p className="text-[var(--theme-text-tertiary)] text-center pt-8">
                {liveTranscribe.isListening ? '请开始说话，实时文字将呈现在这里…' : '点击开始启动听写'}
              </p>
            )}
          </div>

          {liveTranscribe.error && (
            <div className="text-xs text-[var(--theme-text-danger)] flex items-center gap-1.5">
              <AlertCircle size={14} />
              <span>{liveTranscribe.error}</span>
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-[var(--theme-border-subtle)]/40">
            <button
              type="button"
              onClick={() => {
                liveTranscribe.cancelListening();
                void liveTranscribe.startListening();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] rounded-md hover:bg-[var(--theme-bg-tertiary)]/50 transition-colors"
            >
              <RefreshCw size={13} />
              <span>重新开始</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={requestClose}
                className="px-3.5 py-1.5 text-xs font-medium text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] rounded-md transition-colors"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                disabled={isSaving || (!liveTranscribe.finalText && !liveTranscribe.interimText)}
                onClick={handleSaveLiveTranscript}
                className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-[var(--theme-bg-accent)] hover:brightness-110 disabled:opacity-50 rounded-lg shadow-sm transition-all"
              >
                {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Check size={14} />}
                <span>完成并填入</span>
              </button>
            </div>
          </div>
        </div>
      ) : isConfirmingDiscard ? (
        <div className="px-5 pb-5 pt-2 space-y-4">
          <p className="text-sm font-semibold text-[var(--theme-text-primary)]">
            {t('audioRecorderDiscardConfirmTitle')}
          </p>
          <p className="text-sm text-[var(--theme-text-secondary)]">{t('audioRecorderDiscardConfirmMessage')}</p>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setIsConfirmingDiscard(false)}
              className="px-4 py-2 text-sm font-medium text-[var(--theme-text-primary)] bg-[var(--theme-bg-input)] border border-[var(--theme-border-secondary)] hover:bg-[var(--theme-bg-tertiary)] rounded-lg transition-colors"
            >
              {t('cancel')}
            </button>
            <button
              type="button"
              onClick={confirmDiscard}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[var(--theme-bg-danger)] hover:bg-[var(--theme-bg-danger-hover)] rounded-lg transition-colors"
            >
              <Trash2 size={16} />
              {t('audioRecorderDiscard')}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="px-5 pb-5 pt-2 space-y-4">
            {error && (
              <div className="flex flex-col items-center text-[var(--theme-text-danger)] gap-2 mb-4 text-center">
                <AlertCircle size={32} />
                <p className="text-sm">{error}</p>
                {errorKind === 'permission' && (
                  <p className="text-xs text-[var(--theme-text-secondary)]">{t('audioRecorderPermissionHint')}</p>
                )}
              </div>
            )}

            {isApproachingLimit && !hasHitDurationLimit && (
              <div className={WARNING_BANNER_CLASS}>
                {interpolate(t('audioRecorderDurationLimitWarning'), {
                  limit: formatClockTime(MAX_RECORDING_SECONDS),
                })}
              </div>
            )}

            {hasHitDurationLimit && (
              <div className={WARNING_BANNER_CLASS}>
                {interpolate(t('audioRecorderDurationLimitReached'), {
                  limit: formatClockTime(MAX_RECORDING_SECONDS),
                })}
              </div>
            )}

            {isSilent && status === 'recording' && (
              <div className={WARNING_BANNER_CLASS}>{t('audioRecorderNoInputDetected')}</div>
            )}

            {viewState === 'idle' && (
              <div className="rounded-xl bg-[var(--theme-bg-tertiary)]/35 p-2 space-y-2">
                {shouldShowDevicePicker && (
                  <div className="px-1 pt-1">
                    <Select
                      label={t('audioRecorderRecordingDevice')}
                      value={selectedDeviceId ?? ''}
                      onChange={(event) => setSelectedDeviceId(event.target.value || undefined)}
                      size="compact"
                    >
                      {audioInputDevices.map((device, deviceIndex) => (
                        <option key={device.deviceId} value={device.deviceId}>
                          {device.label || `${t('audioRecorderRecordingDevice')} ${deviceIndex + 1}`}
                        </option>
                      ))}
                    </Select>
                  </div>
                )}

                {isInitializing ? (
                  <div className="px-3 py-2.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <Loader2 size={15} className="shrink-0 animate-spin text-[var(--theme-text-tertiary)]" />
                      <p className="text-sm font-medium text-[var(--theme-text-primary)]">
                        {t('audioRecorderAccessingMicrophone')}
                      </p>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={startRecording}
                    className={`group flex min-h-14 w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-[var(--theme-text-primary)] transition-colors hover:bg-[var(--theme-bg-primary)]/80 ${FOCUS_VISIBLE_RING_PRIMARY_OFFSET_CLASS}`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <Mic size={16} className="shrink-0 text-[var(--theme-text-tertiary)]" />
                      <span className="text-sm font-medium">{t('audioRecorderRecordMicrophone')}</span>
                    </span>
                    <ChevronRight
                      size={16}
                      className="shrink-0 text-[var(--theme-text-tertiary)] opacity-60 transition-transform group-hover:translate-x-0.5 group-hover:opacity-100"
                    />
                  </button>
                )}
              </div>
            )}

            {viewState === 'recording' && (
              <div className="w-full flex flex-col items-center gap-5 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="font-mono text-4xl font-medium text-[var(--theme-text-primary)] tabular-nums tracking-wider">
                  {formatClockTime(recordingTime)}
                </div>

                <AudioVisualizer analyser={analyser} />

                <div className={`flex items-center gap-2 ${SETTINGS_SECTION_LABEL_CLASS}`}>
                  <div
                    className={`h-2 w-2 rounded-full ${
                      isPaused ? 'bg-[var(--theme-text-tertiary)]' : 'bg-[var(--theme-text-danger)]'
                    }`}
                  ></div>
                  {isPaused ? t('audioRecorderPausedStatus') : t('audioRecorderRecordingStatus')}
                </div>
              </div>
            )}

            {viewState === 'review' && audioUrl && (
              <div className="w-full space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="flex flex-col items-center mb-6">
                  <div className={`${SETTINGS_SECTION_LABEL_CLASS} mb-1`}>{t('audioRecorderTotalDuration')}</div>
                  <div className="text-3xl font-mono text-[var(--theme-text-primary)]">
                    {formatClockTime(recordingTime)}
                  </div>
                </div>
                <AudioPlayer src={audioUrl} className="w-full" />
              </div>
            )}
          </div>

          <RecorderControls
            viewState={viewState}
            isSaving={isSaving}
            isPaused={isPaused}
            onStop={stopRecording}
            onCancel={requestClose}
            onDiscard={discardRecording}
            onSave={handleSave}
            onPause={pauseRecording}
            onResume={resumeRecording}
            onRerecord={handleRerecord}
          />
        </>
      )}
    </Modal>
  );
};
