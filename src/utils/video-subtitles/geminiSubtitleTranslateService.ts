import { getConfiguredApiClient, getConfiguredApiClientContext } from '@/services/api/apiClient';
import { getServerAuthHeaders } from '@/services/api/apiAuthHeaders';
import { logService } from '@/services/logService';
import { DEFAULT_THOUGHT_TRANSLATION_MODEL_ID } from '@/constants/modelConfiguration';
import type { SubtitleCue } from './subtitleFormatter';

export interface TranslateSubtitlesOptions {
  targetLanguage?: string; // e.g. 'Chinese' | 'English'
  modelId?: string; // default: DEFAULT_THOUGHT_TRANSLATION_MODEL_ID ('gemini-3.5-flash-lite')
  signal?: AbortSignal;
  onProgress?: (progressPercent: number) => void;
}

interface TranslationItem {
  id: number;
  translation: string;
}

/**
 * Strips markdown code fences or surrounding text from JSON text if present.
 */
function cleanJsonText(raw: string): string {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }
  const firstBracket = trimmed.indexOf('[');
  const lastBracket = trimmed.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    return trimmed.substring(firstBracket, lastBracket + 1).trim();
  }
  return trimmed;
}

/**
 * Translates a list of SubtitleCues into the target language using Gemini.
 */
export async function translateSubtitlesWithGemini(
  apiKey: string,
  cues: SubtitleCue[],
  options?: TranslateSubtitlesOptions,
): Promise<SubtitleCue[]> {
  if (!apiKey || !apiKey.trim()) {
    throw new Error('API key is required for subtitle translation.');
  }

  if (!cues || cues.length === 0) {
    return [];
  }

  const targetLanguage = options?.targetLanguage || 'Chinese';
  const modelId = options?.modelId || DEFAULT_THOUGHT_TRANSLATION_MODEL_ID;
  const signal = options?.signal;

  if (signal?.aborted) {
    throw new DOMException('Translation was aborted by user.', 'AbortError');
  }

  // Batch cues into chunks of 80 to prevent output length cutoffs on long transcripts
  const BATCH_SIZE = 80;
  const translationMap = new Map<number, string>();

  for (let batchStartIndex = 0; batchStartIndex < cues.length; batchStartIndex += BATCH_SIZE) {
    if (signal?.aborted) {
      throw new DOMException('Translation was aborted by user.', 'AbortError');
    }

    const batch = cues.slice(batchStartIndex, batchStartIndex + BATCH_SIZE);
    const inputItems = batch.map((cue) => ({ id: cue.id, text: cue.text }));

    const prompt = `You are a professional audiovisual and video subtitle translator.
Translate the following video subtitle cues accurately and naturally into ${targetLanguage}.
Guidelines:
1. Translate line-by-line faithfully and idiomatically for spoken subtitle dialogue.
2. Keep the translation natural and concise so that it fits well on a video screen.
3. Return a JSON array matching each item's id and its translation:
[
  { "id": 1, "translation": "..." }
]

Cues to translate:
${JSON.stringify(inputItems, null, 2)}`;

    let responseText: string | null = null;

    // Try SDK generateContent first
    try {
      const ai = await getConfiguredApiClient(apiKey);
      if (ai?.models?.generateContent) {
        const contentResponse = await ai.models.generateContent({
          model: modelId,
          contents: [
            {
              parts: [{ text: prompt }],
            },
          ],
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'ARRAY' as any,
              items: {
                type: 'OBJECT' as any,
                properties: {
                  id: { type: 'INTEGER' as any },
                  translation: { type: 'STRING' as any },
                },
                required: ['id', 'translation'],
              },
            },
            abortSignal: signal,
          } as any,
        });

        responseText = contentResponse?.text || null;
      }
    } catch (sdkError) {
      if (signal?.aborted) {
        throw new DOMException('Translation was aborted by user.', 'AbortError');
      }
      logService.warn('[VideoSubtitles] SDK translation failed, attempting REST generateContent:', sdkError);
    }

    // Fallback: direct REST call
    if (!responseText) {
      const clientContext = await getConfiguredApiClientContext(apiKey);
      const apiBaseUrl = clientContext?.apiBaseUrl;
      const proxyBaseUrl = clientContext?.proxyBaseUrl;
      const baseUrl = (proxyBaseUrl || apiBaseUrl || 'https://generativelanguage.googleapis.com').replace(/\/+$/, '');
      const url = `${baseUrl}/v1beta/models/${modelId}:generateContent`;

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
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
          },
        }),
        signal,
      });

      if (!response.ok) {
        const errorResponseText = await response.text().catch(() => '');
        throw new Error(`Gemini translation API call failed (${response.status}): ${errorResponseText}`);
      }

      const responseData = await response.json();
      responseText = responseData?.candidates?.[0]?.content?.parts?.[0]?.text || null;
    }

    if (responseText) {
      try {
        const cleaned = cleanJsonText(responseText);
        const parsedItems: TranslationItem[] = JSON.parse(cleaned);
        if (Array.isArray(parsedItems)) {
          for (const item of parsedItems) {
            if (typeof item.id === 'number' && typeof item.translation === 'string') {
              translationMap.set(item.id, item.translation.trim());
            }
          }
        }
      } catch (parseError) {
        logService.warn('[VideoSubtitles] Failed to parse translation JSON batch:', {
          error: parseError,
          responseText,
        });
      }
    }

    if (options?.onProgress) {
      const currentDone = Math.min(cues.length, batchStartIndex + BATCH_SIZE);
      options.onProgress(Math.round((currentDone / cues.length) * 100));
    }
  }

  // Attach translations to cues
  return cues.map((cue) => {
    const translatedText = translationMap.get(cue.id);
    return {
      ...cue,
      translation: translatedText || cue.translation,
    };
  });
}
