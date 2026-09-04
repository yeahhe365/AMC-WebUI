import type { GenerateContentResponse, Part, UsageMetadata } from '@google/genai';
import { executeConfiguredApiRequest } from '@/services/api/apiExecutor';
import { logService } from '@/services/logService';
import { blobToBase64 } from '@/utils/file/fileEncoding';
import { calculateTokenStats } from '@/utils/model/modelUsageStats';
import { buildExactPricingFromUsageMetadata } from '@/utils/usagePricingTelemetry';
import { AVAILABLE_TTS_VOICES } from '@/constants/voiceOptions';
import { SUPPORTED_AUDIO_MIME_TYPES } from '@/constants/fileTypeSupport';

// TTS responses can hang indefinitely when the upstream proxy/relay stalls, so
// the request gets a hard wall-clock timeout. The SDK's httpOptions.timeout is
// retried by default (worst case far longer than the value), so we abort the
// fetch ourselves and surface a distinct message the UI can show the user.
const TTS_REQUEST_TIMEOUT_MS = 30_000;

const SUPPORTED_TTS_VOICE_NAMES = new Set(AVAILABLE_TTS_VOICES.map((voice) => voice.id));
const SPEAKER_VOICES_HEADER_REGEX = /^#{1,6}\s*SPEAKER VOICES(?:\s*\(.*\))?\s*$/i;
const MARKDOWN_HEADER_REGEX = /^#{1,6}\s+\S/;
const SPEAKER_VOICE_LINE_REGEX = /^(?:[-*]\s*)?([^:]+?)\s*:\s*([A-Za-z][\w-]*)\s*$/;

const normalizeAudioMimeType = (mimeType: string): string => mimeType.trim().toLowerCase().split(';')[0];

const getSupportedTranscriptionMimeType = (audioFile: File): string => {
  const mimeType = normalizeAudioMimeType(audioFile.type);
  if (SUPPORTED_AUDIO_MIME_TYPES.includes(mimeType)) {
    return mimeType;
  }

  throw new Error(`Unsupported audio MIME type for Gemini transcription: ${audioFile.type || 'unknown'}.`);
};

const buildSingleSpeakerSpeechConfig = (voice: string) => ({
  voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
});

const extractMultiSpeakerVoiceConfig = (text: string) => {
  const lines = text.split('\n');
  const speakerVoiceConfigs: Array<{
    speaker: string;
    voiceConfig: { prebuiltVoiceConfig: { voiceName: string } };
  }> = [];
  const seenSpeakers = new Set<string>();

  for (let index = 0; index < lines.length; index++) {
    if (!SPEAKER_VOICES_HEADER_REGEX.test(lines[index].trim())) {
      continue;
    }

    for (let nextIndex = index + 1; nextIndex < lines.length; nextIndex++) {
      const line = lines[nextIndex].trim();

      if (!line) {
        continue;
      }

      if (MARKDOWN_HEADER_REGEX.test(line)) {
        break;
      }

      const match = line.match(SPEAKER_VOICE_LINE_REGEX);
      if (!match) {
        continue;
      }

      const speaker = match[1].trim();
      const voiceName = match[2].trim();

      if (!speaker || seenSpeakers.has(speaker) || !SUPPORTED_TTS_VOICE_NAMES.has(voiceName)) {
        continue;
      }

      speakerVoiceConfigs.push({
        speaker,
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName },
        },
      });
      seenSpeakers.add(speaker);

      if (speakerVoiceConfigs.length > 2) {
        logService.warn('Ignoring multi-speaker TTS config because more than two speakers were declared.');
        return null;
      }
    }

    return speakerVoiceConfigs.length === 2 ? { speakerVoiceConfigs } : null;
  }

  return null;
};

const recordAudioTokenUsage = (modelId: string, usageMetadata: UsageMetadata, modality: 'tts' | 'transcription') => {
  const { promptTokens, cachedPromptTokens, completionTokens, thoughtTokens, toolUsePromptTokens, totalTokens } =
    calculateTokenStats(usageMetadata);
  logService.recordTokenUsage(
    modelId,
    {
      promptTokens,
      cachedPromptTokens,
      completionTokens,
      thoughtTokens,
      toolUsePromptTokens,
      totalTokens,
    },
    buildExactPricingFromUsageMetadata(modality, usageMetadata),
  );
};

export const generateSpeechApi = async (
  apiKey: string,
  modelId: string,
  text: string,
  voice: string,
  abortSignal: AbortSignal,
): Promise<string> => {
  if (!text.trim()) {
    throw new Error('TTS input text cannot be empty.');
  }

  // Hard wall-clock timeout so a stalled upstream cannot leave the selection
  // toolbar stuck on its loading state forever. The race covers the whole
  // request — including getConfiguredApiClient, which reads settings from
  // IndexedDB and can hang independently of the fetch itself — while the
  // abort signal below cancels the in-flight generateContent fetch.
  const timeoutController = new AbortController();
  const timeoutId = window.setTimeout(() => {
    timeoutController.abort();
  }, TTS_REQUEST_TIMEOUT_MS);

  const onCallerAbort = () => timeoutController.abort();
  abortSignal.addEventListener('abort', onCallerAbort, { once: true });

  try {
    const requestPromise = executeConfiguredApiRequest({
      apiKey,
      label: `Generating speech with model ${modelId}`,
      errorLabel: `Failed to generate speech with model ${modelId}:`,
      abortSignal: timeoutController.signal,
      run: async ({ client: ai }) => {
        logService.debug('TTS request payload details', { textLength: text.length, voice });
        const multiSpeakerVoiceConfig = extractMultiSpeakerVoiceConfig(text);
        const response = await ai.models.generateContent({
          model: modelId,
          // TTS models do not support chat history roles, just plain content parts
          contents: [{ parts: [{ text }] }],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: multiSpeakerVoiceConfig ? { multiSpeakerVoiceConfig } : buildSingleSpeakerSpeechConfig(voice),
            abortSignal: timeoutController.signal,
          },
        });

        if (abortSignal.aborted) {
          const abortError = new Error('Speech generation cancelled by user.');
          abortError.name = 'AbortError';
          throw abortError;
        }

        const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

        if (typeof audioData === 'string' && audioData.length > 0) {
          if (response.usageMetadata) {
            recordAudioTokenUsage(modelId, response.usageMetadata, 'tts');
          }
          return audioData;
        }

        const candidate = response.candidates?.[0];
        if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
          throw new Error(`TTS generation failed with reason: ${candidate.finishReason}`);
        }

        logService.error('TTS response did not contain expected audio data structure:', { response });

        const textError = response.text;
        if (textError) {
          throw new Error(`TTS generation failed: ${textError}`);
        }

        throw new Error('No audio data found in TTS response.');
      },
    });

    // Swallow the losing side of the race: when the timeout branch wins, the
    // underlying requestPromise may still reject (e.g. throwIfAborted after the
    // fetch), and that rejection must not surface as an unhandled rejection.
    void requestPromise.catch(() => {});

    return await Promise.race([
      requestPromise,
      new Promise<never>((_resolve, reject) => {
        if (timeoutController.signal.aborted) {
          reject(new Error('Speech generation timed out. Please check the TTS model/key and try again.'));
          return;
        }
        const onTimeout = () =>
          reject(new Error('Speech generation timed out. Please check the TTS model/key and try again.'));
        timeoutController.signal.addEventListener('abort', onTimeout, { once: true });
        // Once the request settles (success or failure), the timeout branch is
        // dead — drop its listener so the signal has no lingering side effects.
        void requestPromise
          .finally(() => {
            timeoutController.signal.removeEventListener('abort', onTimeout);
          })
          .catch(() => {});
      }),
    ]);
  } finally {
    window.clearTimeout(timeoutId);
    abortSignal.removeEventListener('abort', onCallerAbort);
  }
};

const extractTranscriptionText = (response: GenerateContentResponse): string => {
  const candidate = response.candidates?.[0];
  if (!candidate?.content?.parts) {
    return typeof response.text === 'string' ? response.text.trim() : '';
  }

  const extractedSegments: string[] = [];

  for (const part of candidate.content.parts) {
    if (typeof part.text === 'string' && part.text.length > 0) {
      extractedSegments.push(part.text);
    } else if (typeof part.audioTranscription?.text === 'string' && part.audioTranscription.text.length > 0) {
      extractedSegments.push(part.audioTranscription.text);
    }
  }

  if (extractedSegments.length > 0) {
    return extractedSegments.join('').trim();
  }

  return typeof response.text === 'string' ? response.text.trim() : '';
};

export interface AudioTranscriptionOptions {
  prompt?: string;
  systemInstruction?: string;
  language?: string;
  wordTimestamps?: boolean;
  speakerLabels?: boolean;
  smartMode?: boolean;
  customVocabulary?: string;
  abortSignal?: AbortSignal;
}

const MAX_TRANSCRIPTION_VOCABULARY_TERMS = 1000;

/**
 * Maps legacy bare ISO selector values to the BCP-47 codes the transcribe models
 * document (see the model's supported-language table). Canonical codes pass through.
 */
const LEGACY_LANGUAGE_CODE_MAP: Record<string, string> = {
  zh: 'cmn-Hans-CN',
  yue: 'yue-Hant-HK',
  en: 'en-US',
  ja: 'ja-JP',
  ko: 'ko-KR',
  es: 'es-419',
  fr: 'fr-FR',
  de: 'de-DE',
  ru: 'ru-RU',
  pt: 'pt-BR',
  it: 'it-IT',
  ar: 'ar-EG',
  hi: 'hi-IN',
};

const normalizeTranscriptionLanguage = (language?: string): string | undefined => {
  const trimmed = language?.trim();
  if (!trimmed) return undefined;
  return LEGACY_LANGUAGE_CODE_MAP[trimmed.toLowerCase()] ?? trimmed;
};

export const transcribeAudioApi = async (
  apiKey: string,
  audioFile: File,
  modelId: string,
  options?: AudioTranscriptionOptions,
): Promise<string> => {
  return executeConfiguredApiRequest({
    apiKey,
    label: `Transcribing audio with model ${modelId}`,
    errorLabel: 'Error during audio transcription:',
    abortSignal: options?.abortSignal,
    run: async ({ client: ai }) => {
      logService.debug('Audio transcription request file details', { fileName: audioFile.name, size: audioFile.size });
      const mimeType = getSupportedTranscriptionMimeType(audioFile);
      const audioBase64 = await blobToBase64(audioFile);

      const audioPart: Part = {
        inlineData: {
          mimeType,
          data: audioBase64,
        },
      };

      const promptInstructions: string[] = [];
      if (options?.smartMode) {
        promptInstructions.push('Use smart transcription: clean up disfluencies, filler words, and format text.');
      } else {
        promptInstructions.push('Transcribe voice input exactly.');
      }

      const normalizedLanguage = normalizeTranscriptionLanguage(options?.language);
      if (normalizedLanguage) {
        promptInstructions.push(`Primary language: ${normalizedLanguage}.`);
      }

      if (options?.wordTimestamps) {
        promptInstructions.push('Include word timestamps in the output.');
      }

      if (options?.speakerLabels) {
        promptInstructions.push('Identify and label distinct speakers (e.g. Speaker 1, Speaker 2).');
      }

      const customVocabList = options?.customVocabulary
        ? options.customVocabulary
            .split(/[,，\n]/)
            .map((word) => word.trim())
            .filter(Boolean)
            .slice(0, MAX_TRANSCRIPTION_VOCABULARY_TERMS)
        : [];

      if (customVocabList.length > 0) {
        promptInstructions.push(`Custom vocabulary: ${customVocabList.join(', ')}.`);
      }

      if (options?.prompt && options.prompt.trim()) {
        promptInstructions.push(options.prompt.trim());
      }

      const promptText = promptInstructions.join(' ');
      const textPart: Part = {
        text: promptText,
      };

      const audioTranscriptionConfig: Record<string, unknown> = {};
      if (normalizedLanguage) {
        audioTranscriptionConfig.languageCodes = [normalizedLanguage];
      }
      if (options?.wordTimestamps) {
        audioTranscriptionConfig.wordTimestamp = true;
      }
      if (options?.speakerLabels) {
        // The v1beta reference names this field `diarization` (AudioTranscriptionConfig);
        // `speakerLabels` is not part of the documented schema.
        audioTranscriptionConfig.diarization = true;
      }
      if (customVocabList.length > 0) {
        audioTranscriptionConfig.customVocabulary = customVocabList;
      }

      const config: Record<string, unknown> = {};
      if (options?.abortSignal) {
        config.abortSignal = options.abortSignal;
      }
      if (options?.systemInstruction && options.systemInstruction.trim()) {
        config.systemInstruction = options.systemInstruction.trim();
      }
      if (Object.keys(audioTranscriptionConfig).length > 0) {
        config.audioTranscriptionConfig = audioTranscriptionConfig;
      }

      const response = await ai.models.generateContent({
        model: modelId,
        contents: { parts: [textPart, audioPart] },
        config:
          Object.keys(config).length > 0
            ? (config as Parameters<typeof ai.models.generateContent>[0]['config'])
            : undefined,
      });

      if (response.usageMetadata) {
        recordAudioTokenUsage(modelId, response.usageMetadata, 'transcription');
      }

      const transcriptionText = extractTranscriptionText(response);
      if (transcriptionText.length > 0) {
        return transcriptionText;
      }

      const candidate = response.candidates?.[0];

      // Non-STOP finish reasons mean generation ended abnormally — surface the
      // actual reason instead of masking it as an "empty transcript".
      if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
        throw new Error(`Transcription failed (finishReason: ${candidate.finishReason}).`);
      }

      // A missing candidate with a block reason means the request never generated.
      if (!candidate && response.promptFeedback?.blockReason) {
        throw new Error(`Transcription request was blocked (reason: ${response.promptFeedback.blockReason}).`);
      }

      return '';
    },
  });
};
