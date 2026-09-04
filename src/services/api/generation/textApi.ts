import { type ThinkingLevel } from '@google/genai';
import type { SupportedLanguage } from '@/i18n/languageRegistry';
import { executeConfiguredApiRequest } from '@/services/api/apiExecutor';
import { logService } from '@/services/logService';
import { normalizeThinkingLevelForModel } from '@/utils/model/modelCapabilities';
import { DEFAULT_THOUGHT_TRANSLATION_MODEL_ID } from '@/constants/modelConfiguration';

const SCHEMA_TYPE = {
  OBJECT: 'OBJECT',
  ARRAY: 'ARRAY',
  STRING: 'STRING',
} as const;

const SUGGESTION_COUNT = 3;
const TEXT_GENERATION_MODEL_ID = 'gemini-3.5-flash-lite';

// English names of each UI language, used to steer auxiliary-model output
// (titles, suggestions) into the user's language.
const SUGGESTION_LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  en: 'English',
  zh: 'Simplified Chinese',
  ja: 'Japanese',
  ko: 'Korean',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
};

// Auxiliary requests (titles, suggestions) are small, latency-sensitive calls.
// An idle timeout bounds them so a hung request cannot leave a session stuck in
// `generatingTitleSessionIds` (which would skip every later attempt).
const AUX_API_TIMEOUT_MS = 20_000;

// Suggestions derive from the *most recent* exchange — the user's last question
// and the assistant's last reply — so truncation keeps the tail (where the
// conversation currently stands) while also taking the head (overall topic).
// A long message here would otherwise ship tens of thousands of characters to
// the model for a 3-item suggestion list.
const SUGGESTION_MAX_HEAD_CHARS = 3000;
const SUGGESTION_MAX_TAIL_CHARS = 1000;
const clampForSuggestions = (text: string): string => {
  if (text.length <= SUGGESTION_MAX_HEAD_CHARS + SUGGESTION_MAX_TAIL_CHARS) {
    return text;
  }
  return `${text.slice(0, SUGGESTION_MAX_HEAD_CHARS)}\n…\n${text.slice(-SUGGESTION_MAX_TAIL_CHARS)}`;
};

// Gemini 3.x uses thinkingLevel (not the 2.5-era thinkingBudget) to request
// minimal thinking. These auxiliary requests never surface thought summaries.
// The level is normalized per model so a configured translation model that
// rejects MINIMAL (e.g. the gemini-3.1-pro text line) falls back to LOW instead
// of failing the request.
const buildMinimalThinkingConfig = (
  modelId: string,
): { thinkingConfig: { thinkingLevel: ThinkingLevel; includeThoughts: boolean } } => ({
  thinkingConfig: {
    thinkingLevel: normalizeThinkingLevelForModel(modelId, 'MINIMAL') as ThinkingLevel,
    includeThoughts: false,
  },
});

type StructuredTextContent = Array<{
  role: 'user';
  parts: Array<{ text: string }>;
}>;

const stripWrappingQuotes = (text: string) => {
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    return text.substring(1, text.length - 1);
  }

  return text;
};

const parseSuggestionLines = (text: string) =>
  text
    .split('\n')
    .map((suggestion) => suggestion.replace(/^\d+\.\s*/, '').trim())
    .filter(Boolean)
    .slice(0, SUGGESTION_COUNT);

const buildTranslationContents = (text: string, targetLanguage: string): StructuredTextContent => [
  {
    role: 'user',
    parts: [
      {
        text: `Translate the following user text to ${targetLanguage}. Only return the translated text, without any additional explanation or formatting.`,
      },
      { text: 'User text to translate:' },
      { text },
    ],
  },
];

// Non-English UI languages get the English prompt plus an explicit output-
// language directive, so titles/suggestions come back in the user's language
// instead of English. zh keeps its fully native prompt.
const outputLanguageDirective = (language: SupportedLanguage) =>
  language === 'en' ? '' : ` Respond in ${SUGGESTION_LANGUAGE_LABELS[language]}.`;

const buildSuggestionContents = (
  userContent: string,
  modelContent: string,
  language: SupportedLanguage,
  fallback = false,
): StructuredTextContent => {
  const suggestionCountText = String(SUGGESTION_COUNT);
  const instruction =
    language === 'zh'
      ? `作为对话专家，请基于后续独立内容片段中的对话上下文，预测用户接下来最可能发送的 ${suggestionCountText} 条简短回复。

规则：
1. 如果助手最后在提问，建议必须是针对该问题的回答。
2. 建议应简练（20字以内），涵盖不同角度（如：追问细节、请求示例、或提出质疑）。
3. 语气自然，符合人类对话习惯。`
      : `As a conversation expert, predict the ${suggestionCountText} most likely short follow-up messages the USER would send based on the conversation context in the following separate content parts.${outputLanguageDirective(language)}`;

  return [
    {
      role: 'user',
      parts: [
        {
          text: fallback
            ? `${instruction}\n\nReturn exactly ${suggestionCountText} suggestions as a numbered list, one per line. Do not include any other text or formatting.`
            : instruction,
        },
        { text: language === 'zh' ? '用户上一条消息:' : 'USER message:' },
        { text: userContent },
        { text: language === 'zh' ? '助手上一条回复:' : 'ASSISTANT message:' },
        { text: modelContent },
      ],
    },
  ];
};

const buildTitleContents = (
  userContent: string,
  modelContent: string,
  language: SupportedLanguage,
): StructuredTextContent => [
  {
    role: 'user',
    parts: [
      {
        text:
          language === 'zh'
            ? '根据后续独立内容片段中的对话，创建一个非常简短、简洁的标题（最多4-6个词）。不要使用引号或任何其他格式。只返回标题文本。'
            : `Based on the conversation in the following separate content parts, create a very short, concise title (4-6 words max). Do not use quotes or any other formatting. Just return the text of the title.${outputLanguageDirective(language)}`,
      },
      { text: language === 'zh' ? '用户消息:' : 'USER message:' },
      { text: userContent },
      { text: language === 'zh' ? '助手消息:' : 'ASSISTANT message:' },
      { text: modelContent },
    ],
  },
];

export const translateTextApi = async (
  apiKey: string,
  text: string,
  targetLanguage: string = 'English',
  modelId: string = DEFAULT_THOUGHT_TRANSLATION_MODEL_ID,
): Promise<string> => {
  const contents = buildTranslationContents(text, targetLanguage);

  return executeConfiguredApiRequest({
    apiKey,
    label: `Translating text to ${targetLanguage}...`,
    errorLabel: 'Error during text translation:',
    run: async ({ client: ai }) => {
      const response = await ai.models.generateContent({
        model: modelId,
        contents,
        config: {
          temperature: 0.1,
          topP: 0.95,
          ...buildMinimalThinkingConfig(modelId),
        },
      });

      const translatedText = response.text?.trim();
      if (!translatedText) {
        throw new Error('Translation failed. The model returned an empty response.');
      }
      return translatedText;
    },
  });
};

export const generateSuggestionsApi = async (
  apiKey: string,
  userContent: string,
  modelContent: string,
  language: SupportedLanguage,
): Promise<string[]> => {
  const contents = buildSuggestionContents(
    clampForSuggestions(userContent),
    clampForSuggestions(modelContent),
    language,
  );
  const timeoutController = new AbortController();
  const timeoutId = window.setTimeout(() => timeoutController.abort(), AUX_API_TIMEOUT_MS);

  try {
    try {
      return await executeConfiguredApiRequest({
        apiKey,
        label: `Generating suggestions in ${language}...`,
        errorLabel: 'Error during suggestions generation:',
        abortSignal: timeoutController.signal,
        run: async ({ client: ai }) => {
          const response = await ai.models.generateContent({
            model: TEXT_GENERATION_MODEL_ID,
            contents,
            config: {
              ...buildMinimalThinkingConfig(TEXT_GENERATION_MODEL_ID),
              temperature: 0.8,
              topP: 0.95,
              responseMimeType: 'application/json',
              responseSchema: {
                type: SCHEMA_TYPE.OBJECT,
                properties: {
                  suggestions: {
                    type: SCHEMA_TYPE.ARRAY,
                    items: {
                      type: SCHEMA_TYPE.STRING,
                      description: 'A short, relevant suggested reply or follow-up question.',
                    },
                    description: `An array of exactly ${SUGGESTION_COUNT} suggested replies.`,
                  },
                },
              },
            },
          });

          const jsonStr = response.text?.trim();
          if (!jsonStr) {
            throw new Error('Suggestions generation returned an empty response.');
          }
          const parsed = JSON.parse(jsonStr);
          if (
            parsed.suggestions &&
            Array.isArray(parsed.suggestions) &&
            parsed.suggestions.every((suggestion: unknown) => typeof suggestion === 'string')
          ) {
            return parsed.suggestions.slice(0, SUGGESTION_COUNT);
          }
          throw new Error('Suggestions generation returned an invalid format.');
        },
      });
    } catch {
      try {
        const fallbackResponse = await executeConfiguredApiRequest({
          apiKey,
          label: `Generating fallback suggestions in ${language}...`,
          errorLabel: 'Fallback suggestions generation also failed:',
          abortSignal: timeoutController.signal,
          run: async ({ client: ai }) =>
            ai.models.generateContent({
              model: TEXT_GENERATION_MODEL_ID,
              contents: buildSuggestionContents(
                clampForSuggestions(userContent),
                clampForSuggestions(modelContent),
                language,
                true,
              ),
              config: {
                ...buildMinimalThinkingConfig(TEXT_GENERATION_MODEL_ID),
                temperature: 0.8,
                topP: 0.95,
              },
            }),
        });
        const fallbackText = fallbackResponse.text?.trim();
        if (fallbackText) {
          return parseSuggestionLines(fallbackText);
        }
      } catch (fallbackError) {
        logService.debug('Fallback suggestions returned no usable suggestions.', fallbackError);
      }
      return [];
    }
  } finally {
    window.clearTimeout(timeoutId);
  }
};

export const generateTitleApi = async (
  apiKey: string,
  userContent: string,
  modelContent: string,
  language: SupportedLanguage,
): Promise<string> => {
  const contents = buildTitleContents(userContent, modelContent, language);
  const timeoutController = new AbortController();
  const timeoutId = window.setTimeout(() => timeoutController.abort(), AUX_API_TIMEOUT_MS);

  try {
    return await executeConfiguredApiRequest({
      apiKey,
      label: `Generating title in ${language}...`,
      errorLabel: 'Error during title generation:',
      abortSignal: timeoutController.signal,
      run: async ({ client: ai }) => {
        try {
          const response = await ai.models.generateContent({
            model: TEXT_GENERATION_MODEL_ID,
            contents,
            config: {
              ...buildMinimalThinkingConfig(TEXT_GENERATION_MODEL_ID),
              temperature: 0.3,
              topP: 0.9,
            },
          });

          const titleText = response.text?.trim();
          if (!titleText) {
            // Empty is not an exceptional case — the caller falls back to the
            // heuristic title. Log at debug so the console is not spammed when
            // the model occasionally returns no text (quota hiccup, safety, etc.).
            logService.debug('Title generation returned empty response', {
              model: TEXT_GENERATION_MODEL_ID,
              candidates: (response as { candidates?: unknown })?.candidates,
            });
            return '';
          }
          return stripWrappingQuotes(titleText);
        } catch (error) {
          // Abort is intentional (timeout) — let it propagate so the timeout
          // controller can be observed; all other failures just fall back to
          // the heuristic title without spamming error logs.
          if (error instanceof Error && error.name === 'AbortError') {
            throw error;
          }
          logService.debug('Title generation request failed (will use heuristic)', error);
          return '';
        }
      },
    });
  } finally {
    window.clearTimeout(timeoutId);
  }
};
