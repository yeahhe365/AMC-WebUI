// Bounded LRU cache for computed audio waveform amplitude bars
const AUDIO_WAVEFORM_CACHE_LIMIT = 50;
const audioWaveformCache = new Map<string, number[]>();

export const readAudioWaveformCache = (id: string): number[] | undefined => {
  const cached = audioWaveformCache.get(id);
  if (!cached) return undefined;
  audioWaveformCache.delete(id);
  audioWaveformCache.set(id, cached);
  return cached;
};

export const writeAudioWaveformCache = (id: string, peaks: number[]): void => {
  audioWaveformCache.delete(id);
  audioWaveformCache.set(id, peaks);
  while (audioWaveformCache.size > AUDIO_WAVEFORM_CACHE_LIMIT) {
    const oldestKey = audioWaveformCache.keys().next().value;
    if (oldestKey === undefined) break;
    audioWaveformCache.delete(oldestKey);
  }
};

/**
 * Deterministic waveform generator: creates an aesthetic, natural-looking audio envelope from seed string.
 * Used as fallback or instant representation before audio data finishes decoding.
 */
export const generateDeterministicWaveform = (seedStr: string, count = 32): number[] => {
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) {
    hash = ((hash << 5) - hash + seedStr.charCodeAt(i)) | 0;
  }
  const result: number[] = [];
  for (let i = 0; i < count; i++) {
    const x = count > 1 ? i / (count - 1) : 0.5;
    const envelope = Math.sin(Math.PI * x) * 0.45 + 0.35;
    const pseudo = Math.abs(Math.sin((hash + i * 137.5) * 12.9898) * 43758.5453) % 1;
    const val = Math.min(0.95, Math.max(0.14, envelope + (pseudo - 0.5) * 0.4));
    result.push(Number(val.toFixed(3)));
  }
  return result;
};

/**
 * Extract real amplitude peaks from an audio blob via Web Audio API (browser runtime).
 */
export const decodeAudioWaveform = async (blob: Blob, count = 32): Promise<number[] | null> => {
  if (typeof window === 'undefined') return null;
  const AudioContextClass =
    window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return null;

  let audioCtx: AudioContext | null = null;
  try {
    audioCtx = new AudioContextClass();
    const slice = blob.slice(0, 1024 * 1024 * 3); // 3MB slice for thorough peak extraction
    const arrayBuffer = await slice.arrayBuffer();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    const channelData = audioBuffer.getChannelData(0);
    if (!channelData || channelData.length === 0) return null;

    const blockSize = Math.floor(channelData.length / count);
    if (blockSize <= 0) return null;

    const rawPeaks: number[] = [];
    for (let i = 0; i < count; i++) {
      let sum = 0;
      const start = i * blockSize;
      const end = Math.min(start + blockSize, channelData.length);
      for (let j = start; j < end; j++) {
        sum += Math.abs(channelData[j]);
      }
      rawPeaks.push(sum / (end - start));
    }

    const maxPeak = Math.max(...rawPeaks, 0.001);
    return rawPeaks.map((p) => Number(Math.min(1, Math.max(0.14, p / maxPeak)).toFixed(3)));
  } catch {
    return null;
  } finally {
    if (audioCtx && audioCtx.state !== 'closed') {
      void audioCtx.close();
    }
  }
};
