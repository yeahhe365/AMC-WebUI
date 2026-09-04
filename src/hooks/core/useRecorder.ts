import { logService } from '@/services/logService';
import { useState, useRef, useCallback, useEffect } from 'react';
import { useI18n } from '@/contexts/I18nContext';

export type RecorderStatus = 'idle' | 'recording' | 'paused';

export type RecorderErrorKind = 'permission' | 'device' | 'unsupported' | 'unknown';

interface UseRecorderOptions {
  onStop?: (blob: Blob) => void;
  onError?: (error: string) => void;
  /** Overrides the localized 'permission' message (used by the input-bar voice input). */
  permissionErrorMessage?: string;
  maxDurationSeconds?: number;
  /**
   * Turns on browser echo cancellation / noise suppression / auto gain control.
   * Recordings destined for transcription benefit from it; live capture that
   * needs the raw signal opts out.
   */
  enhanceSpeech?: boolean;
}

const RECORDING_MIME_TYPE_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
const RECORDING_DURATION_TICK_MS = 1000;

/**
 * Emit a chunk once a second instead of buffering the whole session in memory,
 * so a long recording keeps a flat peak heap.
 */
const RECORDER_TIMESLICE_MS = 1000;

/** Hard cap matching the Gemini transcription per-request limit. */
export const MAX_RECORDING_SECONDS = 60 * 60;

/** Point at which the UI starts warning that the cap is approaching. */
export const RECORDING_DURATION_WARNING_SECONDS = 55 * 60;

const getSupportedRecordingMimeType = (): string | undefined => {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return undefined;
  }

  return RECORDING_MIME_TYPE_CANDIDATES.find((mimeType) => MediaRecorder.isTypeSupported(mimeType));
};

const stopStreamTracks = (targetStream: MediaStream | null) => {
  targetStream?.getTracks().forEach((track) => track.stop());
};

const isMediaRecorderAvailable = () => typeof MediaRecorder !== 'undefined';

/**
 * Maps a getUserMedia/MediaRecorder failure onto a kind the UI can explain.
 * Everything used to surface as "permission denied", which sent users to the
 * wrong place when the real cause was a busy device or an unsupported browser.
 */
/** DOMException is not always an Error instance, so read `name` structurally. */
const getErrorName = (error: unknown): string => {
  if (typeof error !== 'object' || error === null) return '';
  const name = (error as { name?: unknown }).name;
  return typeof name === 'string' ? name : '';
};

const classifyRecorderError = (recorderError: unknown): RecorderErrorKind => {
  switch (getErrorName(recorderError)) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'permission';
    case 'NotFoundError':
    case 'OverconstrainedError':
    case 'NotReadableError':
    case 'TrackStartError':
      return 'device';
    case 'NotSupportedError':
      return 'unsupported';
    default:
      return isMediaRecorderAvailable() ? 'unknown' : 'unsupported';
  }
};

export const useRecorder = (options: UseRecorderOptions = {}) => {
  const {
    onStop,
    onError,
    permissionErrorMessage,
    maxDurationSeconds = MAX_RECORDING_SECONDS,
    enhanceSpeech = true,
  } = options;
  const { t } = useI18n();
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [isInitializing, setIsInitializing] = useState(false);
  const [duration, setDuration] = useState(0);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<RecorderErrorKind | null>(null);
  const [recordedMimeType, setRecordedMimeType] = useState<string | null>(null);
  const [hasHitDurationLimit, setHasHitDurationLimit] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mimeTypeRef = useRef<string | null>(null);

  /** Milliseconds banked before the current (re)start — keeps pauses out of the count. */
  const elapsedBeforeResumeRef = useRef(0);
  const startedAtRef = useRef<number | null>(null);
  const startRequestIdRef = useRef(0);

  useEffect(() => {
    streamRef.current = stream;
  }, [stream]);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const cleanup = useCallback(() => {
    if (streamRef.current) {
      stopStreamTracks(streamRef.current);
      setStream(null);
      streamRef.current = null;
    }

    clearTimer();
    startedAtRef.current = null;
    elapsedBeforeResumeRef.current = 0;
    mediaRecorderRef.current = null;
  }, [clearTimer]);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  const resolveErrorMessage = useCallback(
    (kind: RecorderErrorKind): string => {
      if (kind === 'permission' && permissionErrorMessage) return permissionErrorMessage;

      switch (kind) {
        case 'permission':
          return t('audioRecorderErrorPermission');
        case 'device':
          return t('audioRecorderErrorNoDevice');
        case 'unsupported':
          return t('audioRecorderErrorUnsupported');
        default:
          return t('audioRecorderErrorUnknown');
      }
    },
    [permissionErrorMessage, t],
  );

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    clearTimer();
    startedAtRef.current = null;

    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }

    setStatus('idle');
  }, [clearTimer]);

  /**
   * Derives the elapsed time from the wall clock rather than counting ticks:
   * background tabs throttle timers to once a minute, which used to leave the
   * displayed duration minutes behind the audio that was actually captured.
   */
  const startTimer = useCallback(() => {
    clearTimer();

    timerRef.current = window.setInterval(() => {
      if (startedAtRef.current === null) return;

      const elapsedMilliseconds = elapsedBeforeResumeRef.current + (Date.now() - startedAtRef.current);
      const elapsedSeconds = Math.floor(elapsedMilliseconds / 1000);
      setDuration(elapsedSeconds);

      if (elapsedSeconds >= maxDurationSeconds) {
        setHasHitDurationLimit(true);
        stopRecording();
      }
    }, RECORDING_DURATION_TICK_MS);
  }, [clearTimer, maxDurationSeconds, stopRecording]);

  const startRecording = useCallback(
    async (recordingOptions?: { deviceId?: string }) => {
      const requestId = startRequestIdRef.current + 1;
      startRequestIdRef.current = requestId;
      setError(null);
      setErrorKind(null);
      setHasHitDurationLimit(false);
      setIsInitializing(true);
      cleanup();

      try {
        if (!isMediaRecorderAvailable()) {
          throw new DOMException('MediaRecorder is unavailable', 'NotSupportedError');
        }

        const micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            ...(recordingOptions?.deviceId ? { deviceId: { exact: recordingOptions.deviceId } } : {}),
            echoCancellation: enhanceSpeech,
            noiseSuppression: enhanceSpeech,
            autoGainControl: enhanceSpeech,
          },
        });

        if (startRequestIdRef.current !== requestId) {
          stopStreamTracks(micStream);
          return;
        }

        setStream(micStream);
        streamRef.current = micStream;

        const supportedMimeType = getSupportedRecordingMimeType();
        const recorder = supportedMimeType
          ? new MediaRecorder(micStream, { mimeType: supportedMimeType })
          : new MediaRecorder(micStream);
        mediaRecorderRef.current = recorder;
        mimeTypeRef.current = supportedMimeType ?? null;
        chunksRef.current = [];

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) chunksRef.current.push(event.data);
        };

        recorder.onstop = () => {
          const mimeType = recorder.mimeType || mimeTypeRef.current || 'audio/webm';
          const blob = new Blob(chunksRef.current, { type: mimeType });
          setRecordedMimeType(mimeType);
          if (blob.size > 0 && onStop) {
            onStop(blob);
          }
          cleanup();
        };

        recorder.start(RECORDER_TIMESLICE_MS);
        setStatus('recording');
        setDuration(0);
        elapsedBeforeResumeRef.current = 0;
        startedAtRef.current = Date.now();
        startTimer();
      } catch (recorderError) {
        logService.error('Recorder error:', recorderError);
        const kind = classifyRecorderError(recorderError);
        const errorMessage = resolveErrorMessage(kind);
        setError(errorMessage);
        setErrorKind(kind);
        if (onError) onError(errorMessage);
        setStatus('idle');
        cleanup();
      } finally {
        if (startRequestIdRef.current === requestId) {
          setIsInitializing(false);
        }
      }
    },
    [cleanup, enhanceSpeech, onError, onStop, resolveErrorMessage, startTimer],
  );

  const pauseRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== 'recording') return;

    elapsedBeforeResumeRef.current += Date.now() - (startedAtRef.current ?? Date.now());
    startedAtRef.current = null;
    clearTimer();
    recorder.pause();
    setStatus('paused');
  }, [clearTimer]);

  const resumeRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== 'paused') return;

    startedAtRef.current = Date.now();
    recorder.resume();
    setStatus('recording');
    startTimer();
  }, [startTimer]);

  const cancelRecording = useCallback(() => {
    startRequestIdRef.current += 1;
    if (mediaRecorderRef.current) {
      // Prevent canceling from publishing the recorded chunks.
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;

      if (mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    }
    setStatus('idle');
    setIsInitializing(false);
    setDuration(0);
    setHasHitDurationLimit(false);
    cleanup();
  }, [cleanup]);

  return {
    status,
    isInitializing,
    duration,
    error,
    errorKind,
    recordedMimeType,
    hasHitDurationLimit,
    stream,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    cancelRecording,
  };
};
