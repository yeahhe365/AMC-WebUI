import { useState, useCallback, useEffect, useRef } from 'react';
import { useRecorder } from '@/hooks/core/useRecorder';
import { createManagedObjectUrl, releaseManagedObjectUrl } from '@/services/objectUrlManager';
import { logService } from '@/services/logService';

export type RecorderState = 'idle' | 'recording' | 'review';

/**
 * Device labels stay empty until a stream has been granted, so the list is
 * refreshed once a microphone is live and again when the OS device set changes.
 */
const listAudioInputDevices = async (): Promise<MediaDeviceInfo[]> => {
  if (!navigator.mediaDevices?.enumerateDevices) return [];

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((device) => device.kind === 'audioinput');
  } catch (error) {
    logService.warn('Could not enumerate audio input devices:', error);
    return [];
  }
};

export const useAudioRecorder = () => {
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioInputDevices, setAudioInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | undefined>(undefined);
  const audioUrlRef = useRef<string | null>(null);

  const replaceAudioUrl = useCallback((nextAudioUrl: string | null) => {
    const previousAudioUrl = audioUrlRef.current;

    if (previousAudioUrl && previousAudioUrl !== nextAudioUrl) {
      releaseManagedObjectUrl(previousAudioUrl);
    }

    audioUrlRef.current = nextAudioUrl;
    setAudioUrl(nextAudioUrl);
  }, []);

  useEffect(
    () => () => {
      releaseManagedObjectUrl(audioUrlRef.current);
      audioUrlRef.current = null;
    },
    [],
  );

  const activeStreamRef = useRef<MediaStream | null>(null);

  /**
   * Defaults the picker to the device actually in use rather than to whatever
   * happens to be first in the list, so re-recording keeps the same microphone.
   */
  const refreshAudioInputDevices = useCallback(async () => {
    const devices = await listAudioInputDevices();
    setAudioInputDevices(devices);

    setSelectedDeviceId((currentDeviceId) => {
      if (currentDeviceId && devices.some((device) => device.deviceId === currentDeviceId)) {
        return currentDeviceId;
      }

      const activeDeviceId = activeStreamRef.current?.getAudioTracks()[0]?.getSettings().deviceId;
      if (activeDeviceId && devices.some((device) => device.deviceId === activeDeviceId)) {
        return activeDeviceId;
      }

      return devices[0]?.deviceId;
    });
  }, []);

  const resetPreview = useCallback(() => {
    setAudioBlob(null);
    replaceAudioUrl(null);
  }, [replaceAudioUrl]);

  const handleRecordingComplete = useCallback(
    (blob: Blob) => {
      const nextAudioUrl = createManagedObjectUrl(blob);
      setAudioBlob(blob);
      replaceAudioUrl(nextAudioUrl);
    },
    [replaceAudioUrl],
  );

  const {
    status,
    isInitializing,
    duration,
    error,
    errorKind,
    recordedMimeType,
    hasHitDurationLimit,
    stream,
    startRecording: startCore,
    stopRecording,
    pauseRecording,
    resumeRecording,
    cancelRecording: cancelCore,
  } = useRecorder({
    onStop: handleRecordingComplete,
    onError: resetPreview,
  });

  useEffect(() => {
    if (!stream) return;

    activeStreamRef.current = stream;
    void refreshAudioInputDevices();
  }, [refreshAudioInputDevices, stream]);

  useEffect(() => {
    if (!navigator.mediaDevices?.addEventListener) return;

    navigator.mediaDevices.addEventListener('devicechange', refreshAudioInputDevices);
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', refreshAudioInputDevices);
    };
  }, [refreshAudioInputDevices]);

  const startRecording = useCallback(() => {
    startCore(selectedDeviceId ? { deviceId: selectedDeviceId } : undefined);
  }, [selectedDeviceId, startCore]);

  const discardRecording = useCallback(() => {
    resetPreview();
    cancelCore(); // Ensures stream is closed if in weird state
  }, [cancelCore, resetPreview]);

  const isCapturing = status === 'recording' || status === 'paused';
  const viewState: RecorderState = audioBlob ? 'review' : isCapturing ? 'recording' : 'idle';

  return {
    viewState,
    isInitializing,
    isPaused: status === 'paused',
    recordingTime: duration,
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
  };
};
