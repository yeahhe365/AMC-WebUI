export const DEFAULT_MODEL_ID = 'gemini-3-flash-preview';

const GEMINI_3_REQUIRED_THINKING_MODEL_IDS = [
  'gemini-3.1-pro-preview',
  'models/gemini-3.1-pro-preview',
  'gemini-3-flash',
  'models/gemini-3-flash',
  'gemini-3.5-flash',
  'models/gemini-3.5-flash',
  'gemini-3-flash-preview',
  'models/gemini-3-flash-preview',
  'gemini-3.1-flash-lite',
  'models/gemini-3.1-flash-lite',
] as const;

export const GEMINI_3_RO_MODELS: string[] = [...GEMINI_3_REQUIRED_THINKING_MODEL_IDS];

export const MODELS_MANDATORY_THINKING: string[] = [...GEMINI_3_REQUIRED_THINKING_MODEL_IDS];

export const MODELS_SUPPORTING_RAW_MODE = [
  'gemini-3.5-flash',
  'gemini-3-flash-preview',
  'gemini-3.1-flash-lite',
  'gemini-3.1-pro-preview',
  'gemini-robotics-er-1.6-preview',
];

export const DEFAULT_THINKING_LEVEL = 'HIGH';

const thinkingBudgetRange = (min: number, max: number) => ({ min, max });

const buildThinkingBudgetRanges = (
  entries: Array<{ modelIds: readonly string[]; range: { min: number; max: number } }>,
): { [key: string]: { min: number; max: number } } =>
  Object.fromEntries(entries.flatMap(({ modelIds, range }) => modelIds.map((modelId) => [modelId, range])));

export const THINKING_BUDGET_RANGES: { [key: string]: { min: number; max: number } } = buildThinkingBudgetRanges([
  {
    modelIds: GEMINI_3_REQUIRED_THINKING_MODEL_IDS,
    range: thinkingBudgetRange(128, 32768),
  },
  {
    modelIds: ['gemini-robotics-er-1.6-preview', 'models/gemini-robotics-er-1.6-preview'],
    range: thinkingBudgetRange(128, 24576),
  },
]);

export const DEFAULT_TEMPERATURE = 1.0;
export const DEFAULT_TOP_P = 0.95;
export const DEFAULT_TOP_K = 64; // Recommended by Gemma 4 model card
export const DEFAULT_SHOW_THOUGHTS = true;
export const DEFAULT_THINKING_BUDGET = -1; // -1 for auto/unlimited budget
export const DEFAULT_TTS_VOICE = 'Zephyr';

export const DEFAULT_TRANSCRIPTION_MODEL_ID = 'gemini-3-flash-preview';
export const DEFAULT_TTS_MODEL_ID = 'gemini-3.1-flash-tts-preview';
export const DEFAULT_LIVE_ARTIFACTS_MODEL_ID = 'gemini-3-flash-preview';
export const DEFAULT_THOUGHT_TRANSLATION_MODEL_ID = 'gemini-3.1-flash-lite';
