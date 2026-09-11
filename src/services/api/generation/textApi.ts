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

const sanitizeGeneratedTitle = (text: string) => {
  let cleaned = text.trim();

  for (let i = 0; i < 3; i += 1) {
    const prev = cleaned;
    if ((cleaned.startsWith('**') && cleaned.endsWith('**')) || (cleaned.startsWith('__') && cleaned.endsWith('__'))) {
      cleaned = cleaned.substring(2, cleaned.length - 2).trim();
    }
    if (
      (cleaned.startsWith('*') && cleaned.endsWith('*')) ||
      (cleaned.startsWith('_') && cleaned.endsWith('_')) ||
      (cleaned.startsWith('`') && cleaned.endsWith('`'))
    ) {
      cleaned = cleaned.substring(1, cleaned.length - 1).trim();
    }
    if (
      (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
      (cleaned.startsWith("'") && cleaned.endsWith("'")) ||
      (cleaned.startsWith('“') && cleaned.endsWith('”'))
    ) {
      cleaned = cleaned.substring(1, cleaned.length - 1).trim();
    }
    if (cleaned === prev) break;
  }

  return cleaned;
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
): StructuredTextContent => {
  const instruction =
    language === 'zh'
      ? `作为对话标题提炼专家，请基于后续独立内容片段中的对话，创建一个简短精练的会话标题。

规则：
1. 开头必须且仅包含 1 个最贴切的主题 Emoji 表情（如 💻代码、🐛排错、📝写作、💡创意、🌍翻译、📊数据等）。
2. Emoji 与标题文字之间保留 1 个空格。
3. 标题文字简明扼要（6~12 个字），突出核心动作或主题，避免“关于...”、“讨论...”等冗余泛话。
4. 严禁使用引号、括号或 Markdown 格式（如加粗），仅返回单行纯文本标题。`
      : `You are an expert at summarizing conversations into concise titles. Based on the conversation in the following separate content parts, create a short, focused title.

Rules:
1. Start with exactly 1 most relevant emoji reflecting the core topic (e.g. 💻, 🐛, 📝, 💡, 🌍, 📊).
2. Put a single space between the emoji and the title text.
3. Keep the title concise and specific (3-6 words max).
4. Do not use quotes or markdown formatting. Return only the single-line title text.${outputLanguageDirective(language)}`;

  return [
    {
      role: 'user',
      parts: [
        { text: instruction },
        { text: language === 'zh' ? '用户消息:' : 'USER message:' },
        { text: userContent },
        { text: language === 'zh' ? '助手消息:' : 'ASSISTANT message:' },
        { text: modelContent },
      ],
    },
  ];
};

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
          return sanitizeGeneratedTitle(titleText);
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

const FILE_TITLE_SOURCE_MAX_CHARS = 4000;
const clampForFileTitle = (text: string) =>
  text.length > FILE_TITLE_SOURCE_MAX_CHARS ? `${text.slice(0, FILE_TITLE_SOURCE_MAX_CHARS)}…` : text;

const buildFileTitleContents = (documentContent: string, language: SupportedLanguage): StructuredTextContent => {
  const instruction =
    language === 'zh'
      ? `作为文件命名与内容提炼专家，请基于后续提供的文档内容，提炼一个简练、精准的文件名（不含扩展名）。

规则：
1. 提取核心主旨，字数控制在 4~15 个字之间。
2. 严禁包含操作系统非法文件名字符（如 < > : " / \\ | ? *）。
3. 严禁使用引号、书名号、括号、标点符号或 Markdown 格式。
4. 仅返回提炼出的单行文件名文本，严禁包含多余解释说明。`
      : `You are an expert at summarizing document content into a concise, filesystem-safe filename stem (without file extension).

Rules:
1. Extract the core topic in 2 to 6 words (under 40 characters).
2. Do NOT use unsafe filename characters (< > : " / \\ | ? *).
3. Do NOT use quotes, brackets, punctuation, or markdown formatting.
4. Return ONLY the filename text on a single line with no explanation.${outputLanguageDirective(language)}`;

  return [
    {
      role: 'user',
      parts: [
        { text: instruction },
        { text: language === 'zh' ? '文档内容:' : 'Document content:' },
        { text: clampForFileTitle(documentContent) },
      ],
    },
  ];
};

const sanitizeFileTitleStem = (text: string): string => {
  let cleaned = sanitizeGeneratedTitle(text);
  cleaned = cleaned
    .replace(/[<>:"/\\|?*]+/g, '_')
    .replace(/^[-_\s.]+|[-_\s.]+$/g, '')
    .trim();
  return cleaned;
};

export const generateFileTitleApi = async (
  apiKey: string,
  documentContent: string,
  language: SupportedLanguage,
): Promise<string> => {
  const contents = buildFileTitleContents(documentContent, language);
  const timeoutController = new AbortController();
  const timeoutId = window.setTimeout(() => timeoutController.abort(), AUX_API_TIMEOUT_MS);

  try {
    return await executeConfiguredApiRequest({
      apiKey,
      label: `Generating file title in ${language}...`,
      errorLabel: 'Error during file title generation:',
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
            logService.debug('File title generation returned empty response', {
              model: TEXT_GENERATION_MODEL_ID,
              candidates: (response as { candidates?: unknown })?.candidates,
            });
            return '';
          }
          return sanitizeFileTitleStem(titleText);
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') {
            throw error;
          }
          logService.debug('File title generation request failed', error);
          return '';
        }
      },
    });
  } finally {
    window.clearTimeout(timeoutId);
  }
};
