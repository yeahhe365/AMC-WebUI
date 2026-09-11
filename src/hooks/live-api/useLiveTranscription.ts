import { useState, useRef, useCallback, useEffect } from 'react';
import type { Session as LiveSession, LiveServerMessage } from '@google/genai';
import { getLiveApiClient } from '@/services/api/liveApiAuth';
import { getLiveApiKey } from '@/utils/apiKeySelection';
import { audioWorkletCode } from '@/features/audio/audioWorklet';
import { float32ToPCM16Base64 } from '@/features/audio/audioProcessing';
import { createManagedObjectUrl, releaseManagedObjectUrl } from '@/services/objectUrlManager';
import { logService } from '@/services/logService';
import type { AppSettings } from '@/types';
import { toError } from '@/utils/errorMessage';
import { useStateWithRef } from '@/hooks/useStateWithRef';

export interface LiveTranscriptionOptions {
  modelId?: string;
  mode?: 'SMART' | 'VERBATIM';
  languageCodes?: string[];
  customVocabulary?: string[];
  onInterimTranscript?: (text: string) => void;
  onFinalTranscript?: (text: string) => void;
  onError?: (error: Error) => void;
}

export interface UseLiveTranscriptionProps {
  appSettings: AppSettings;
  apiKey?: string | null;
  options?: LiveTranscriptionOptions;
}

export const useLiveTranscription = ({ appSettings, apiKey, options }: UseLiveTranscriptionProps) => {
  const [isListening, setIsListening, isListeningRef] = useStateWithRef(false);
  const [interimText, setInterimText] = useState('');
  const [finalText, setFinalText] = useState('');
  const [volume, setVolume] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const sessionRef = useRef<Promise<LiveSession> | null>(null);
  const inputContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<AudioWorkletNode | null>(null);
  const inputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const accumulatedFinalRef = useRef('');

  const cleanupAudio = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (processorRef.current) {
      try {
        processorRef.current.port.onmessage = null;
        processorRef.current.port.close();
      } catch {
        // Ignore
      }
      processorRef.current.disconnect();
      processorRef.current = null;
    }

    if (inputSourceRef.current) {
      try {
        inputSourceRef.current.disconnect();
      } catch {
        // Ignore
      }
      inputSourceRef.current = null;
    }

    if (inputContextRef.current) {
      inputContextRef.current.close().catch(() => {});
      inputContextRef.current = null;
    }

    setVolume(0);
  }, []);

  const handleServerMessage = useCallback(
    (message: LiveServerMessage) => {
      const content = message.serverContent;
      if (!content) return;

      const extendedContent = content as typeof content & {
        interimInputTranscription?: { text?: string };
        inputTranscription?: { text?: string; finished?: boolean };
      };

      if (extendedContent.interimInputTranscription?.text) {
        const partial = extendedContent.interimInputTranscription.text;
        setInterimText(partial);
        options?.onInterimTranscript?.(partial);
      }

      if (extendedContent.inputTranscription?.text) {
        const text = extendedContent.inputTranscription.text;
        const finished = extendedContent.inputTranscription.finished;
        // When finished is explicitly false, treat as interim update (newer genai types use finished flag).
        if (finished === false) {
          setInterimText(text);
          options?.onInterimTranscript?.(text);
          return;
        }
        const committed = text;
        accumulatedFinalRef.current = accumulatedFinalRef.current
          ? `${accumulatedFinalRef.current} ${committed}`
          : committed;
        setFinalText(accumulatedFinalRef.current);
        setInterimText('');
        options?.onFinalTranscript?.(committed);
      }
    },
    [options],
  );

  const stopListening = useCallback(async (): Promise<string> => {
    setIsListening(false);

    if (sessionRef.current) {
      try {
        const session = await sessionRef.current;
        session.sendRealtimeInput({ audioStreamEnd: true });
        session.close();
      } catch {
        // Ignore close race
      }
      sessionRef.current = null;
    }

    cleanupAudio();
    return accumulatedFinalRef.current;
  }, [cleanupAudio, setIsListening]);

  const cancelListening = useCallback(() => {
    setIsListening(false);
    setInterimText('');
    setFinalText('');
    accumulatedFinalRef.current = '';

    if (sessionRef.current) {
      sessionRef.current.then((session) => session.close()).catch(() => {});
      sessionRef.current = null;
    }

    cleanupAudio();
  }, [cleanupAudio, setIsListening]);

  const startListening = useCallback(async (): Promise<boolean> => {
    cancelListening();
    setError(null);
    accumulatedFinalRef.current = '';

    try {
      const model = options?.modelId || 'gemini-3.5-transcribe-live';
      const effectiveApiKey = apiKey || getLiveApiKey(appSettings, { modelId: model } as never);
      const ai = await getLiveApiClient(appSettings, undefined, effectiveApiKey);

      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const inputAudioContext = new AudioContextClass({ sampleRate: 16000 });
      inputContextRef.current = inputAudioContext;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      if (inputAudioContext.state === 'suspended') {
        await inputAudioContext.resume();
      }

      const microphoneSource = inputAudioContext.createMediaStreamSource(stream);
      inputSourceRef.current = microphoneSource;

      const blob = new Blob([audioWorkletCode], { type: 'application/javascript' });
      const blobUrl = createManagedObjectUrl(blob);

      try {
        await inputAudioContext.audioWorklet.addModule(blobUrl);
      } finally {
        releaseManagedObjectUrl(blobUrl);
      }

      const workletNode = new AudioWorkletNode(inputAudioContext, 'pcm-processor');
      processorRef.current = workletNode;

      workletNode.port.onmessage = (event) => {
        if (!isListeningRef.current) return;

        const inputSamples = event.data as Float32Array;
        let sum = 0;
        const sampleCount = inputSamples.length;
        const step = Math.ceil(sampleCount / 100);
        for (let i = 0; i < sampleCount; i += step) {
          sum += inputSamples[i] * inputSamples[i];
        }
        const rms = Math.sqrt(sum / (sampleCount / step));
        setVolume(rms);

        const base64Data = float32ToPCM16Base64(inputSamples);
        if (sessionRef.current) {
          sessionRef.current.then((session) => {
            try {
              session.sendRealtimeInput({
                audio: {
                  mimeType: 'audio/pcm;rate=16000',
                  data: base64Data,
                },
              });
            } catch (audioSendError) {
              logService.warn('Failed to stream transcribe chunk:', audioSendError);
            }
          });
        }
      };

      microphoneSource.connect(workletNode);
      workletNode.connect(inputAudioContext.destination);

      const liveConfig = {
        responseModalities: ['TEXT'],
        inputAudioTranscription: {
          mode: options?.mode || 'SMART',
          languageCodes: options?.languageCodes || [],
          customVocabulary:
            options?.customVocabulary && options.customVocabulary.length > 0 ? options.customVocabulary : undefined,
        },
      };

      const sessionPromise = ai.live.connect({
        model,
        config: liveConfig as Parameters<typeof ai.live.connect>[0]['config'],
        callbacks: {
          onopen: () => {
            logService.info('Live Transcription connected', { model });
            setIsListening(true);
          },
          onmessage: (msg) => {
            handleServerMessage(msg);
          },
          onclose: () => {
            setIsListening(false);
            cleanupAudio();
          },
          onerror: (liveError) => {
            const errObj = toError(liveError);
            setError(errObj.message);
            options?.onError?.(errObj);
            setIsListening(false);
            cleanupAudio();
          },
        },
      });

      sessionRef.current = sessionPromise;
      return true;
    } catch (startError) {
      const errObj = toError(startError);
      setError(errObj.message);
      options?.onError?.(errObj);
      cleanupAudio();
      return false;
    }
  }, [
    apiKey,
    appSettings,
    cancelListening,
    cleanupAudio,
    handleServerMessage,
    isListeningRef,
    options,
    setIsListening,
  ]);

  useEffect(() => {
    return () => {
      cancelListening();
    };
  }, [cancelListening]);

  return {
    isListening,
    interimText,
    finalText,
    volume,
    error,
    startListening,
    stopListening,
    cancelListening,
  };
};
