import { arrayBufferToBase64, decodeBase64ToArrayBuffer } from '@/utils/file/fileEncoding';
import { createManagedObjectUrl } from '@/services/objectUrlManager';

export { decodeBase64ToArrayBuffer };

/**
 * Decodes a raw PCM byte array into an AudioBuffer using the provided AudioContext.
 */
export const decodeAudioData = async (
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number = 24000,
  numChannels: number = 1,
): Promise<AudioBuffer> => {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
};

/**
 * Encodes Float32 audio data (from AudioWorklet) into a PCM16 Base64 string.
 */
export const float32ToPCM16Base64 = (data: Float32Array): string => {
  const sampleCount = data.length;
  const int16 = new Int16Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    // 0x7fff (not 32768) so a full-scale +1.0 sample stays 32767 instead of
    // wrapping Int16 to -32768. Matches float32ToPcm16Bytes below.
    int16[i] = Math.max(-1, Math.min(1, data[i])) * 0x7fff;
  }
  return arrayBufferToBase64(int16);
};

const createWavBuffer = (pcmData: Uint8Array, sampleRate: number, numChannels: number): ArrayBuffer => {
  const bytesPerSample = 2; // 16-bit
  const blockAlign = numChannels * bytesPerSample;
  const wav = new ArrayBuffer(44 + pcmData.length);
  const wavView = new DataView(wav);

  let writeOffset = 0;
  const writeString = (value: string) => {
    [...value].forEach((character) => wavView.setUint8(writeOffset++, character.charCodeAt(0)));
  };

  writeString('RIFF');
  wavView.setUint32(writeOffset, 36 + pcmData.length, true);
  writeOffset += 4;
  writeString('WAVEfmt ');
  wavView.setUint32(writeOffset, 16, true);
  writeOffset += 4;
  wavView.setUint16(writeOffset, 1, true);
  writeOffset += 2;
  wavView.setUint16(writeOffset, numChannels, true);
  writeOffset += 2;
  wavView.setUint32(writeOffset, sampleRate, true);
  writeOffset += 4;
  wavView.setUint32(writeOffset, sampleRate * blockAlign, true);
  writeOffset += 4;
  wavView.setUint16(writeOffset, blockAlign, true);
  writeOffset += 2;
  wavView.setUint16(writeOffset, bytesPerSample * 8, true);
  writeOffset += 2;
  writeString('data');
  wavView.setUint32(writeOffset, pcmData.length, true);
  writeOffset += 4;

  new Uint8Array(wav, 44).set(pcmData);
  return wav;
};

const float32ToPcm16Bytes = (data: Float32Array): Uint8Array => {
  const int16 = new Int16Array(data.length);
  for (let i = 0; i < data.length; i++) {
    int16[i] = Math.max(-1, Math.min(1, data[i])) * 0x7fff;
  }
  return new Uint8Array(int16.buffer);
};

/** Encode mono Float32 PCM into a Gemini-supported WAV File. */
export const float32ToWavFile = (
  pcmData: Float32Array,
  sampleRate: number,
  fileName = `voice-input-${Date.now()}.wav`,
): File => {
  const wavBuffer = createWavBuffer(float32ToPcm16Bytes(pcmData), sampleRate, 1);
  return new File([wavBuffer], fileName, { type: 'audio/wav' });
};

/** Decode any browser-decodable audio blob to a mono WAV File for Gemini transcription. */
export const convertAudioBlobToWavFile = async (file: File | Blob): Promise<File> => {
  const arrayBuffer = await file.arrayBuffer();
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const audioCtx = new AudioContextClass();

  try {
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
    const frameCount = audioBuffer.length;
    const mono = new Float32Array(frameCount);

    if (audioBuffer.numberOfChannels === 1) {
      mono.set(audioBuffer.getChannelData(0));
    } else {
      const channelCount = audioBuffer.numberOfChannels;
      for (let channel = 0; channel < channelCount; channel++) {
        const channelData = audioBuffer.getChannelData(channel);
        for (let i = 0; i < frameCount; i++) {
          mono[i] += channelData[i] / channelCount;
        }
      }
    }

    const originalName = (file as File).name || `voice-input-${Date.now()}`;
    const wavName = originalName.replace(/\.[^/.]+$/, '') + '.wav';
    return float32ToWavFile(mono, audioBuffer.sampleRate, wavName);
  } finally {
    await audioCtx.close().catch(() => undefined);
  }
};

/**
 * Converts a base64 encoded PCM16 string to a WAV Blob URL.
 */
export function pcmBase64ToWavUrl(base64: string, sampleRate = 24_000, numChannels = 1): string {
  const pcm = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const wavBuffer = createWavBuffer(pcm, sampleRate, numChannels);
  return createManagedObjectUrl(new Blob([wavBuffer], { type: 'audio/wav' }));
}

/**
 * Combines multiple Base64 PCM16 chunks into a single WAV Blob URL.
 */
export const createWavBlobFromPCMChunks = (chunks: string[], sampleRate = 24000): string | null => {
  if (chunks.length === 0) return null;

  let totalLen = 0;
  const decodedChunks: Uint8Array[] = [];

  for (const chunk of chunks) {
    const decoded = decodeBase64ToArrayBuffer(chunk);
    decodedChunks.push(decoded);
    totalLen += decoded.length;
  }

  const merged = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of decodedChunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  const wavBuffer = createWavBuffer(merged, sampleRate, 1);
  const blob = new Blob([wavBuffer], { type: 'audio/wav' });
  return createManagedObjectUrl(blob);
};

/**
 * Extracts the audio subtype/format from a MIME type (e.g. 'audio/wav' -> 'wav', 'audio/mp3' -> 'mp3').
 * Defaults to 'wav' if no valid subtype is found.
 */
export const getInlineAudioFormat = (mimeType: string): string => {
  const subtype = mimeType.split('/')[1]?.split(';')[0]?.trim();
  return subtype || 'wav';
};
