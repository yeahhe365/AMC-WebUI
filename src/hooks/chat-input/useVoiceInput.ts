import { logService } from '@/services/logService';
import { type Dispatch, type RefObject, type SetStateAction, useState, useCallback } from 'react';
import { prepareAudioForGeminiTranscription } from '@/features/audio/audioCompression';
import { useRecorder } from '@/hooks/core/useRecorder';
import { useTextAreaInsert } from '@/hooks/useTextAreaInsert';
import { useI18n } from '@/contexts/I18nContext';
import { formatI18nErrorMessage } from '@/i18n/interpolate';

interface UseVoiceInputProps {
  onTranscribeAudio: (file: File) => Promise<string | null>;
  setInputText: Dispatch<SetStateAction<string>>;
  setAppFileError?: (error: string | null) => void;
  textareaRef: RefObject<HTMLTextAreaElement>;
}

export const useVoiceInput = ({
  onTranscribeAudio,
  setInputText,
  setAppFileError,
  textareaRef,
}: UseVoiceInputProps) => {
  const { t } = useI18n();
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isFinalizingRecording, setIsFinalizingRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const insertText = useTextAreaInsert(textareaRef, setInputText);

  const reportError = useCallback(
    (message: string | null) => {
      setError(message);
      setAppFileError?.(message);
    },
    [setAppFileError],
  );

  const handleRecordingComplete = useCallback(
    async (audioBlob: Blob) => {
      if (audioBlob.size > 0) {
        setIsTranscribing(true);
        try {
          // Browser MediaRecorder often yields audio/webm;codecs=opus, which Gemini rejects.
          // Always convert first — independent of the user "audio compression" setting.
          const fileToTranscribe = await prepareAudioForGeminiTranscription(audioBlob);
          const transcribedText = await onTranscribeAudio(fileToTranscribe);

          if (transcribedText) {
            insertText(transcribedText.trim(), { ensurePadding: true });
          }
        } catch (error) {
          logService.error('Error processing/transcribing audio:', error);
          const message = error instanceof Error ? error.message : t('voiceInputFailed');
          reportError(formatI18nErrorMessage(t, 'voiceInputFailedWithMessage', message));
        } finally {
          setIsTranscribing(false);
          setIsFinalizingRecording(false);
        }
      } else {
        setIsFinalizingRecording(false);
      }
    },
    [onTranscribeAudio, insertText, reportError, t],
  );

  const { status, isInitializing, startRecording, stopRecording, cancelRecording } = useRecorder({
    onStop: handleRecordingComplete,
    onError: reportError,
    permissionErrorMessage: t('voiceInputPermissionError'),
    // The input-bar path predates the recorder's speech enhancement and its
    // transcription prompts were tuned against the unprocessed signal.
    enhanceSpeech: false,
  });

  const isRecording = status === 'recording';
  const isBusy = isTranscribing || isFinalizingRecording;

  const handleVoiceInputClick = () => {
    if (isRecording) {
      setIsFinalizingRecording(true);
      stopRecording();
    } else {
      reportError(null);
      startRecording();
    }
  };

  const handleCancelRecording = () => {
    setIsFinalizingRecording(false);
    cancelRecording();
  };

  return {
    isRecording,
    isTranscribing: isBusy,
    isMicInitializing: isInitializing,
    error,
    handleVoiceInputClick,
    handleCancelRecording,
  };
};
