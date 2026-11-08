import type { File as GeminiFile } from '@google/genai';
import { uploadFileApi, deleteFileApi } from '@/services/api/fileApi';
import { getConfiguredApiClient, getConfiguredApiClientContext } from '@/services/api/apiClient';
import { getServerAuthHeaders } from '@/services/api/apiAuthHeaders';
import { logService } from '@/services/logService';
import { normalizeTranscriptionLanguage } from '@/services/api/generation/audioApi';
import type { WordAnnotation } from './subtitleFormatter';

export type { WordAnnotation };

export interface TranscribeProgressCallback {
  (phase: 'uploading' | 'transcribing', progressPercent?: number): void;
}

/**
 * Splits raw transcript text into natural subtitle segments.
 */
function splitTranscriptIntoSegments(text: string): string[] {
  if (!text || typeof text !== 'string') return [];
  const normalized = text.trim();
  if (!normalized) return [];

  const rawSentences = normalized.split(/(?<=[。！？!?\n])|(?<=\.\s+)/);
  const segments: string[] = [];

  for (const sentence of rawSentences) {
    const trimmedSentence = sentence.trim();
    if (!trimmedSentence) continue;

    // Break up very long clauses for readable subtitles
    if (trimmedSentence.length > 25) {
      const parts = trimmedSentence.split(/(?<=[、,])\s*/);
      let buffer = '';
      for (const part of parts) {
        const trimmedPart = part.trim();
        if (!trimmedPart) continue;
        if ((buffer + trimmedPart).length > 28 && buffer.length > 0) {
          segments.push(buffer.trim());
          buffer = trimmedPart;
        } else {
          buffer = buffer ? `${buffer}${trimmedPart}` : trimmedPart;
        }
      }
      if (buffer.trim()) {
        segments.push(buffer.trim());
      }
    } else {
      segments.push(trimmedSentence);
    }
  }

  return segments;
}

/**
 * Distributes time across text segments proportionally based on segment length and audio duration.
 */
function convertTranscriptTextToAnnotations(text: string, durationSeconds?: number): WordAnnotation[] {
  const segments = splitTranscriptIntoSegments(text);
  if (segments.length === 0) return [];

  const totalChars = segments.reduce((sum, segment) => sum + Math.max(1, segment.length), 0);
  const totalDuration = durationSeconds && durationSeconds > 0 ? durationSeconds : segments.length * 2.5;

  const maxPausePerGap = 0.25;
  const totalGaps = Math.max(1, segments.length - 1);
  const pause = Math.min(maxPausePerGap, Math.max(0.05, (totalDuration * 0.12) / totalGaps));
  const availableSpeechTime = Math.max(0.5 * segments.length, totalDuration - (segments.length - 1) * pause);

  let currentTime = 0;
  const annotations: WordAnnotation[] = [];

  for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex++) {
    const segment = segments[segmentIndex];
    const segmentRatio = Math.max(1, segment.length) / totalChars;
    const segmentDuration = Math.max(0.5, segmentRatio * availableSpeechTime);

    const startTime = currentTime;
    const endTime = Math.min(totalDuration, startTime + segmentDuration);

    annotations.push({
      text: segment,
      start_offset: `${startTime.toFixed(3)}s`,
      end_offset: `${endTime.toFixed(3)}s`,
    });

    currentTime = endTime + pause;
    if (currentTime >= totalDuration && segmentIndex < segments.length - 1) {
      currentTime = Math.max(0, totalDuration - 0.2 * (segments.length - 1 - segmentIndex));
    }
  }

  return annotations;
}

/**
 * Extracts word-level or sentence-level annotations from Gemini transcription response payload.
 * Supports:
 * - Interaction API response with word_info annotations
 * - Gemini generateContent response with parts[].audioTranscription.text or parts[].text
 */
export function extractWordAnnotations(data: any, durationSeconds?: number): WordAnnotation[] {
  if (!data) return [];

  const words: WordAnnotation[] = [];

  // 1. Check Vertex AI / Interactions API format with steps
  const steps = Array.isArray(data?.steps) ? data.steps : [];
  for (const step of steps) {
    const contents = Array.isArray(step?.content) ? step.content : [];
    for (const content of contents) {
      const annotations = Array.isArray(content?.annotations) ? content.annotations : [];
      for (const annotation of annotations) {
        if (annotation && (annotation.type === 'word_info' || annotation.start_offset !== undefined)) {
          words.push({
            text: String(annotation.text || ''),
            start_offset: String(annotation.start_offset || '0s'),
            end_offset: String(annotation.end_offset || '0s'),
            speaker: annotation.speaker ? String(annotation.speaker) : undefined,
          });
        }
      }
    }
  }

  if (words.length > 0) {
    return words;
  }

  // 2. Check direct annotations array if present
  if (Array.isArray(data?.annotations) && data.annotations.length > 0) {
    for (const annotation of data.annotations) {
      if (annotation && (annotation.start_offset !== undefined || annotation.startOffset !== undefined)) {
        words.push({
          text: String(annotation.text || ''),
          start_offset: String(annotation.start_offset || annotation.startOffset || '0s'),
          end_offset: String(annotation.end_offset || annotation.endOffset || '0s'),
          speaker: annotation.speaker ? String(annotation.speaker) : undefined,
        });
      }
    }
    if (words.length > 0) return words;
  }

  // 3. Check generateContent response candidates
  const textPieces: string[] = [];
  const candidates = Array.isArray(data?.candidates) ? data.candidates : [];
  for (const candidate of candidates) {
    const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
    for (const part of parts) {
      const transcription = part?.audioTranscription || part?.audio_transcription;
      const rawWords = Array.isArray(transcription?.words) ? transcription.words : [];

      // Check if word-level timestamps are nested inside audioTranscription
      if (rawWords.length > 0) {
        for (const w of rawWords) {
          const wText = String(w.text || w.word || '').trim();
          if (!wText) continue;
          words.push({
            text: wText,
            start_offset: String(w.start_offset || w.startTime || w.startOffset || '0s'),
            end_offset: String(w.end_offset || w.endTime || w.endOffset || '0s'),
            speaker: w.speaker ? String(w.speaker) : undefined,
          });
        }
      }

      const transcriptionText = transcription?.text || part?.text || '';
      if (typeof transcriptionText === 'string' && transcriptionText.trim()) {
        textPieces.push(transcriptionText.trim());
      }
    }
  }

  if (words.length > 0) {
    return words;
  }

  // 4. Check fallback root text / transcription properties
  let rootText: string | undefined;
  if (typeof data?.text === 'function') {
    try {
      rootText = data.text();
    } catch {
      // ignore
    }
  } else if (typeof data?.text === 'string') {
    rootText = data.text;
  } else if (typeof data?.transcription === 'string') {
    rootText = data.transcription;
  }

  if (rootText && rootText.trim()) {
    textPieces.push(rootText.trim());
  }

  const combinedText = textPieces.join('\n').trim();
  if (combinedText) {
    return convertTranscriptTextToAnnotations(combinedText, durationSeconds);
  }

  return [];
}

export interface TranscribeAudioWithGeminiOptions {
  language?: string;
  prompt?: string;
  systemInstruction?: string;
  customVocabulary?: string;
}

/**
 * Transcribes audio using Gemini 3.5 Transcribe model (`gemini-3.5-transcribe`).
 * Uploads audioBlob to Gemini Files API, calls generateContent,
 * and cleans up the temporary file on completion.
 */
export async function transcribeAudioWithGemini(
  apiKey: string,
  audioBlob: Blob,
  fileName: string,
  signal: AbortSignal,
  onProgress?: TranscribeProgressCallback,
  durationSeconds?: number,
  options?: TranscribeAudioWithGeminiOptions,
): Promise<WordAnnotation[]> {
  if (!apiKey || !apiKey.trim()) {
    throw new Error('API key is required for video subtitle transcription.');
  }

  if (signal?.aborted) {
    throw new DOMException('Transcription was aborted by user.', 'AbortError');
  }

  const audioMimeType = audioBlob.type || 'audio/wav';
  const audioFile = new File([audioBlob], fileName, { type: audioMimeType });

  let uploadedFile: GeminiFile | null = null;

  try {
    // 1. Upload audio to Gemini Files API
    logService.info(`[VideoSubtitles] Uploading extracted audio (${audioFile.size} bytes) for transcription`);
    uploadedFile = await uploadFileApi(apiKey, audioFile, audioMimeType, fileName, signal, (loaded, total) => {
      const percent = total > 0 ? Math.round((loaded / total) * 100) : undefined;
      onProgress?.('uploading', percent);
    });

    if (signal?.aborted) {
      throw new DOMException('Transcription was aborted by user.', 'AbortError');
    }

    onProgress?.('transcribing');
    logService.info(`[VideoSubtitles] Requesting gemini-3.5-transcribe for ${uploadedFile.uri}`);

    let transcriptionResult: any = null;
    const promptInstructions: string[] = ['Transcribe voice input exactly. Include word timestamps in the output.'];

    const normalizedLanguage = normalizeTranscriptionLanguage(options?.language);
    if (normalizedLanguage) {
      promptInstructions.push(`Primary language: ${normalizedLanguage}.`);
    }

    const customVocabList = options?.customVocabulary
      ? options.customVocabulary
          .split(/[,，\n]/)
          .map((word) => word.trim())
          .filter(Boolean)
          .slice(0, 50)
      : [];

    if (customVocabList.length > 0) {
      promptInstructions.push(`Custom vocabulary: ${customVocabList.join(', ')}.`);
    }

    if (options?.prompt && options.prompt.trim()) {
      promptInstructions.push(options.prompt.trim());
    }

    const promptText = promptInstructions.join(' ');

    // Try primary path: SDK ai.models.generateContent
    try {
      const ai = await getConfiguredApiClient(apiKey);
      if (ai?.models && typeof ai.models.generateContent === 'function') {
        const response = await ai.models.generateContent({
          model: 'gemini-3.5-transcribe',
          contents: [
            {
              parts: [
                { text: promptText },
                {
                  fileData: {
                    fileUri: uploadedFile.uri,
                    mimeType: audioMimeType,
                  },
                },
              ],
            },
          ],
          config: {
            audioTranscriptionConfig: {
              wordTimestamp: true,
              ...(normalizedLanguage ? { languageCodes: [normalizedLanguage] } : {}),
            },
            ...(options?.systemInstruction?.trim() ? { systemInstruction: options.systemInstruction.trim() } : {}),
            ...(signal ? { abortSignal: signal } : {}),
          } as any,
        });
        transcriptionResult = response;
      }
    } catch (sdkError: any) {
      if (signal?.aborted) {
        throw new DOMException('Transcription was aborted by user.', 'AbortError');
      }
      logService.warn('[VideoSubtitles] SDK generateContent failed, attempting fallback:', sdkError);
    }

    // Fallback 1: Check interactions.create (for Vertex AI compatibility)
    if (!transcriptionResult) {
      try {
        const ai = await getConfiguredApiClient(apiKey);
        if (ai?.interactions && typeof (ai as any).interactions.create === 'function') {
          transcriptionResult = await (ai as any).interactions.create(
            {
              model: 'gemini-3.5-transcribe',
              input: [
                {
                  type: 'text',
                  text: promptText,
                },
                {
                  type: 'audio',
                  uri: uploadedFile.uri,
                  mime_type: audioMimeType,
                },
              ],
            },
            { fetchOptions: { signal } },
          );
        }
      } catch (interactionsError: any) {
        if (signal?.aborted) {
          throw new DOMException('Transcription was aborted by user.', 'AbortError');
        }
        logService.warn(
          '[VideoSubtitles] Interactions API fallback failed, attempting REST generateContent:',
          interactionsError,
        );
      }
    }

    // Fallback 2: Direct REST call to generateContent
    if (!transcriptionResult) {
      const clientContext = await getConfiguredApiClientContext(apiKey);
      const apiBaseUrl = clientContext?.apiBaseUrl;
      const proxyBaseUrl = clientContext?.proxyBaseUrl;
      const baseUrl = (proxyBaseUrl || apiBaseUrl || 'https://generativelanguage.googleapis.com').replace(/\/+$/, '');
      const url = `${baseUrl}/v1beta/models/gemini-3.5-transcribe:generateContent`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
          // 只有请求真的打到自建 API 容器时才带部署口令;直连 Google 时绝不能把口令发出去。
          ...(proxyBaseUrl ? getServerAuthHeaders() : {}),
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: promptText },
                {
                  file_data: {
                    file_uri: uploadedFile.uri,
                    mime_type: audioMimeType,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            audioTranscriptionConfig: {
              wordTimestamp: true,
              ...(normalizedLanguage ? { languageCodes: [normalizedLanguage] } : {}),
            },
          },
          ...(options?.systemInstruction?.trim()
            ? {
                system_instruction: {
                  parts: [{ text: options.systemInstruction.trim() }],
                },
              }
            : {}),
        }),
        signal,
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`Gemini Transcribe API call failed (${response.status}): ${errText}`);
      }

      transcriptionResult = await response.json();
    }

    const annotations = extractWordAnnotations(transcriptionResult, durationSeconds);
    logService.info(`[VideoSubtitles] Transcription succeeded with ${annotations.length} cues`);
    return annotations;
  } catch (transcriptionError) {
    logService.error('[VideoSubtitles] Transcription failed:', transcriptionError);
    throw transcriptionError;
  } finally {
    // Clean up temporary audio file from Gemini Files storage
    if (uploadedFile?.name) {
      try {
        await deleteFileApi(apiKey, uploadedFile.name);
        logService.info(`[VideoSubtitles] Cleaned up temporary audio file: ${uploadedFile.name}`);
      } catch (cleanupError) {
        logService.warn(`[VideoSubtitles] Failed to clean up temporary audio file: ${uploadedFile.name}`, cleanupError);
      }
    }
  }
}
