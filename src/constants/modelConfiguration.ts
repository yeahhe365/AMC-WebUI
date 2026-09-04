export const DEFAULT_MODEL_ID = 'gemini-3.8-flash';

/**
 * Single source of truth for the Gemini Robotics ER model id.
 * The previous ER generation (preview) shut down 2026-08-31; migrated to ER 2.
 */
export const ROBOTICS_MODEL = 'gemini-robotics-er-2-preview';

export const REQUIRED_THINKING_MODEL_IDS: readonly string[] = [
  'gemini-3.1-pro-preview',
  'models/gemini-3.1-pro-preview',
  'gemini-3-flash-preview',
  'models/gemini-3-flash-preview',
  'gemini-3.6-flash',
  'models/gemini-3.6-flash',
  'gemini-3.8-flash',
  'models/gemini-3.8-flash',
  'gemini-3.7-flash',
  'models/gemini-3.7-flash',
  'gemini-3.5-flash-lite',
  'models/gemini-3.5-flash-lite',
];

export const MODELS_SUPPORTING_RAW_MODE = [
  'gemini-3.6-flash',
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.5-flash-lite',
  'gemini-3-flash-preview',
  'gemini-3.1-pro-preview',
  ROBOTICS_MODEL,
];

/** Built-in model IDs removed from the app; remap saved settings to a supported replacement. */
const REMOVED_MODEL_ID_MIGRATIONS: Readonly<Record<string, string>> = {
  'gemini-3.1-flash-lite': 'gemini-3.5-flash-lite',
  'models/gemini-3.1-flash-lite': 'gemini-3.5-flash-lite',
  // Exact IDs only — must not match gemini-3.5-flash-lite.
  'gemini-3.5-flash': 'gemini-3.7-flash',
  'models/gemini-3.5-flash': 'gemini-3.7-flash',
};

export const migrateRemovedModelId = (modelId: string | null | undefined): string | undefined => {
  if (!modelId) {
    return modelId ?? undefined;
  }
  return REMOVED_MODEL_ID_MIGRATIONS[modelId] ?? modelId;
};

export const DEFAULT_THINKING_LEVEL = 'HIGH';

const thinkingBudgetRange = (min: number, max: number) => ({ min, max });

const buildThinkingBudgetRanges = (
  entries: Array<{ modelIds: readonly string[]; range: { min: number; max: number } }>,
): { [key: string]: { min: number; max: number } } =>
  Object.fromEntries(entries.flatMap(({ modelIds, range }) => modelIds.map((modelId) => [modelId, range])));

export const THINKING_BUDGET_RANGES: { [key: string]: { min: number; max: number } } = buildThinkingBudgetRanges([
  {
    modelIds: REQUIRED_THINKING_MODEL_IDS,
    range: thinkingBudgetRange(128, 32768),
  },
  {
    modelIds: [ROBOTICS_MODEL, `models/${ROBOTICS_MODEL}`],
    range: thinkingBudgetRange(128, 24576),
  },
]);

export const DEFAULT_TEMPERATURE = 1.0;
export const DEFAULT_TOP_P = 0.95;
export const DEFAULT_TOP_K = 64;
export const DEFAULT_SHOW_THOUGHTS = true;
export const DEFAULT_THINKING_BUDGET = -1; // -1 for auto/unlimited budget
export const DEFAULT_TTS_VOICE = 'Zephyr';

export const DEFAULT_TRANSCRIPTION_MODEL_ID = 'gemini-3.5-transcribe';
export const DEFAULT_TTS_MODEL_ID = 'gemini-3.1-flash-tts-preview';
export const DEFAULT_LIVE_ARTIFACTS_MODEL_ID = 'gemini-3.8-flash';
export const DEFAULT_THOUGHT_TRANSLATION_MODEL_ID = 'gemini-3.5-flash-lite';
