import { useEffect, useRef, useState } from 'react';

/** Sampling cadence for the silence probe — far cheaper than the draw loop. */
const LEVEL_SAMPLE_INTERVAL_MS = 100;

/** RMS below this counts as silence (roughly -40 dBFS). */
const SILENCE_RMS_THRESHOLD = 0.01;

/** How long the input has to stay quiet before the UI warns about it. */
const SILENCE_GRACE_MS = 3_000;

type WindowWithWebkitAudioContext = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

interface AudioAnalyser {
  analyser: AnalyserNode | null;
  /** True when the selected input has produced no audible signal for a while. */
  isSilent: boolean;
}

/**
 * Owns the single AudioContext/AnalyserNode pair for a recording session so the
 * visualizer and the silence probe share one graph instead of building two.
 */
export const useAudioAnalyser = (stream: MediaStream | null): AudioAnalyser => {
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [isSilent, setIsSilent] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!stream) {
      setAnalyser(null);
      return;
    }

    const AudioContextConstructor = window.AudioContext || (window as WindowWithWebkitAudioContext).webkitAudioContext;
    if (!AudioContextConstructor) return;

    const audioContext = new AudioContextConstructor();
    audioContextRef.current = audioContext;
    // Autoplay policy can hand back a suspended context, which would pin the
    // analyser output at zero and make a working microphone look dead.
    void audioContext.resume().catch(() => undefined);

    const sessionAnalyser = audioContext.createAnalyser();
    sessionAnalyser.fftSize = 2048;
    sessionAnalyser.smoothingTimeConstant = 0.6;

    const source = audioContext.createMediaStreamSource(stream);
    source.connect(sessionAnalyser);
    setAnalyser(sessionAnalyser);

    return () => {
      setAnalyser(null);
      source.disconnect();
      sessionAnalyser.disconnect();
      audioContextRef.current = null;
      void audioContext.close().catch(() => undefined);
    };
  }, [stream]);

  useEffect(() => {
    if (!analyser) {
      setIsSilent(false);
      return;
    }

    const sampleBuffer = new Float32Array(analyser.fftSize);
    let lastAudibleAt = Date.now();

    const intervalId = window.setInterval(() => {
      analyser.getFloatTimeDomainData(sampleBuffer);

      let sumOfSquares = 0;
      for (const sample of sampleBuffer) {
        sumOfSquares += sample * sample;
      }
      const rootMeanSquare = Math.sqrt(sumOfSquares / sampleBuffer.length);

      if (rootMeanSquare >= SILENCE_RMS_THRESHOLD) {
        lastAudibleAt = Date.now();
      }

      setIsSilent(Date.now() - lastAudibleAt >= SILENCE_GRACE_MS);
    }, LEVEL_SAMPLE_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [analyser]);

  return { analyser, isSilent };
};
