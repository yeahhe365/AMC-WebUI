import { createManagedObjectUrl, releaseManagedObjectUrl } from '@/services/objectUrlManager';
import { SUPPORTED_AUDIO_MIME_TYPES } from '@/constants/fileTypeSupport';
import { convertAudioBlobToWavFile, float32ToWavFile } from './audioProcessing';
import { audioCompressionWorkerCode } from './audioCompressionWorkerCode';

const BYTES_PER_KIB = 1024;
const MIN_COMPRESSIBLE_AUDIO_BYTES = 50 * BYTES_PER_KIB;
const MIN_COMPRESSIBLE_DURATION_SECONDS = 1.5;
const LOW_BITRATE_AUDIO_BPS = 80_000;
const MP3_TARGET_SAMPLE_RATE = 16_000;
const MP3_TARGET_CHANNELS = 1;
const MP3_TARGET_KBPS = 64;

const normalizeAudioMimeType = (mimeType: string): string => mimeType.trim().toLowerCase().split(';')[0];

const isGeminiSupportedAudioMimeType = (file: File | Blob): boolean =>
  SUPPORTED_AUDIO_MIME_TYPES.includes(normalizeAudioMimeType(file.type || ''));

const canKeepOriginalAudio = (file: File | Blob): file is File =>
  file instanceof File && isGeminiSupportedAudioMimeType(file);

const toNamedFile = (file: File | Blob, fallbackName: string): File => {
  if (file instanceof File) return file;
  return new File([file], fallbackName, { type: file.type || 'application/octet-stream' });
};

const wavFileNameFor = (file: File | Blob): string => {
  const originalName = (file as File).name || `voice-input-${Date.now()}`;
  return originalName.replace(/\.[^/.]+$/, '') + '.wav';
};

interface EncodeMp3WithWorkerOptions {
  pcmData: Float32Array;
  sampleRate: number;
  kbps: number;
  file: File | Blob;
  signal?: AbortSignal;
}

const encodeMp3WithWorker = async ({
  pcmData,
  sampleRate,
  kbps,
  file,
  signal,
}: EncodeMp3WithWorkerOptions): Promise<File> => {
  return new Promise((resolve, reject) => {
    const workerBlob = new Blob([audioCompressionWorkerCode], { type: 'application/javascript' });
    const workerUrl = createManagedObjectUrl(workerBlob);
    const worker = new Worker(workerUrl);

    const cleanup = () => {
      worker.terminate();
      releaseManagedObjectUrl(workerUrl);
    };

    if (signal) {
      if (signal.aborted) {
        cleanup();
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }
      signal.addEventListener(
        'abort',
        () => {
          cleanup();
          reject(new DOMException('Aborted', 'AbortError'));
        },
        { once: true },
      );
    }

    const resolveFallback = () => {
      cleanup();
      // Prefer keeping an already-supported source; otherwise encode the PCM we already decoded.
      if (isGeminiSupportedAudioMimeType(file)) {
        resolve(toNamedFile(file, `recording-${Date.now()}.wav`));
        return;
      }
      resolve(float32ToWavFile(pcmData, sampleRate, wavFileNameFor(file)));
    };

    worker.onmessage = (event) => {
      if (event.data.type === 'success') {
        const mp3Blob = new Blob(event.data.buffers, { type: 'audio/mpeg' });
        const originalName = (file as File).name || `audio-${Date.now()}`;
        const newName = originalName.replace(/\.[^/.]+$/, '') + '.mp3';
        cleanup();
        resolve(new File([mp3Blob], newName, { type: 'audio/mpeg' }));
      } else {
        resolveFallback();
      }
    };

    worker.onerror = () => {
      resolveFallback();
    };

    // Copy before transfer so pcmData remains usable for the WAV fallback path.
    const pcmForWorker = pcmData.slice();
    worker.postMessage({ pcmData: pcmForWorker, sampleRate, kbps }, [pcmForWorker.buffer]);
  });
};

export const compressAudioToMp3 = async (file: File | Blob, signal?: AbortSignal): Promise<File> => {
  const checkAbort = () => {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  };

  if (file.size < MIN_COMPRESSIBLE_AUDIO_BYTES) {
    if (canKeepOriginalAudio(file)) return file;
  }

  try {
    checkAbort();

    const arrayBuffer = await file.arrayBuffer();
    checkAbort();

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const audioCtx = new AudioContextClass();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    checkAbort();

    if (audioBuffer.duration < MIN_COMPRESSIBLE_DURATION_SECONDS) {
      if (canKeepOriginalAudio(file)) return file;
    }

    const duration = audioBuffer.duration;
    const fileSize = file.size;
    const bitrate = duration > 0 ? (fileSize * 8) / duration : 0;

    const isMp3 =
      file.type === 'audio/mpeg' ||
      file.type === 'audio/mp3' ||
      ('name' in file && (file as File).name.toLowerCase().endsWith('.mp3'));

    if (isMp3 && bitrate > 0 && bitrate < LOW_BITRATE_AUDIO_BPS) {
      if (file instanceof File) return file;
      return new File([file], `audio-${Date.now()}.mp3`, { type: 'audio/mpeg' });
    }

    const frameCount = Math.ceil(audioBuffer.duration * MP3_TARGET_SAMPLE_RATE);

    const offlineCtx = new OfflineAudioContext(MP3_TARGET_CHANNELS, frameCount, MP3_TARGET_SAMPLE_RATE);
    const source = offlineCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineCtx.destination);
    source.start();

    const renderedBuffer = await offlineCtx.startRendering();
    checkAbort();
    const pcmData = renderedBuffer.getChannelData(0);

    return encodeMp3WithWorker({
      pcmData,
      sampleRate: MP3_TARGET_SAMPLE_RATE,
      kbps: MP3_TARGET_KBPS,
      file,
      signal,
    });
  } catch (error) {
    if (
      (error instanceof DOMException && error.name === 'AbortError') ||
      (error instanceof Error && error.name === 'AbortError')
    ) {
      throw error;
    }
    // Never hand Gemini-unsupported MIME types (e.g. browser webm) back as "success".
    if (isGeminiSupportedAudioMimeType(file)) {
      return toNamedFile(file, `recording-${Date.now()}.wav`);
    }
    return convertAudioBlobToWavFile(file);
  }
};

/**
 * Ensures browser-recorded audio (often audio/webm;codecs=opus) is converted to a
 * Gemini transcription-supported MIME type. Independent of the "audio compression" setting.
 */
export const prepareAudioForGeminiTranscription = async (file: File | Blob, signal?: AbortSignal): Promise<File> => {
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  if (isGeminiSupportedAudioMimeType(file)) {
    return toNamedFile(file, `voice-input-${Date.now()}.wav`);
  }

  try {
    const compressed = await compressAudioToMp3(file, signal);
    if (isGeminiSupportedAudioMimeType(compressed)) {
      return compressed;
    }
  } catch (error) {
    // Propagate cancellation instead of falling back to a WAV conversion nobody wants.
    if (
      (error instanceof DOMException && error.name === 'AbortError') ||
      (error instanceof Error && error.name === 'AbortError')
    ) {
      throw error;
    }
    // Fall through to WAV conversion.
  }

  const wavFile = await convertAudioBlobToWavFile(file);
  if (!isGeminiSupportedAudioMimeType(wavFile)) {
    throw new Error('Failed to convert recorded audio into a format supported by Gemini transcription.');
  }
  return wavFile;
};
