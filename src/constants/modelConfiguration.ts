/**
 * Gemini 4 Hydrogen leads the built-in lineup. 3.8 Flash is no longer seeded into
 * the picker (see modelRegistry.ts); saved sessions that still point at it keep
 * working, and users can re-add it from Settings when they want it.
 */
export const DEFAULT_MODEL_ID = 'gemini-4-hydrogen';

/**
 * Single source of truth for the Gemini Robotics ER model id.
 * The previous ER generation (preview) shut down 2026-08-31; migrated to ER 2.
 */
export const ROBOTICS_MODEL = 'gemini-robotics-er-2-preview';

export const REQUIRED_THINKING_MODEL_IDS: readonly string[] = [
  'gemini-4-hydrogen',
  'models/gemini-4-hydrogen',
  'gemini-4-carbon',
  'models/gemini-4-carbon',
  'gemini-4-argon',
  'models/gemini-4-argon',
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
  'gemini-4-carbon',
  'gemini-4-argon',
  'gemini-3.6-flash',
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.5-flash-lite',
  'gemini-3-flash-preview',
  'gemini-3.1-pro-preview',
  ROBOTICS_MODEL,
];

/**
 * There is deliberately NO automatic remapping of saved model ids.
 *
 * A previous map rewrote deprecated ids (gemini-2.0-flash → gemini-3.6-flash
 * and friends) during settings hydration. That silently switched the user to a
 * model they never chose — and each target had its own shutdown date, so the
 * rewrite had to be maintained forever just to keep pointing somewhere live.
 * Saved ids are now preserved verbatim: if the model is gone, the request fails
 * with the provider's own error and the user picks a replacement.
 */
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
  // Gemini 2.5 token budgets. All three are still served: 2.5 Pro and 2.5 Flash
  // shut down on December 1, 2026, and 2.5 Flash-Lite has no shutdown date.
  {
    modelIds: ['gemini-2.5-pro', 'models/gemini-2.5-pro'],
    range: thinkingBudgetRange(128, 32768),
  },
  {
    modelIds: ['gemini-2.5-flash', 'models/gemini-2.5-flash'],
    range: thinkingBudgetRange(0, 24576),
  },
  {
    modelIds: ['gemini-2.5-flash-lite', 'models/gemini-2.5-flash-lite'],
    range: thinkingBudgetRange(512, 24576),
  },
]);

export const DEFAULT_TEMPERATURE = 1.0;
export const DEFAULT_TOP_P = 0.95;
export const DEFAULT_TOP_K = 64;
export const DEFAULT_SHOW_THOUGHTS = true;
export const DEFAULT_THINKING_BUDGET = -1; // -1 for auto/unlimited budget
export const DEFAULT_TTS_VOICE = 'Zephyr';

export const DEFAULT_TRANSCRIPTION_MODEL_ID = 'gemini-3.5-transcribe';
export const DEFAULT_TTS_MODEL_ID = 'gemini-3.8-flash-tts';
// Name is historical (the Live Artifacts picker is gone); this now seeds the
// connection-test dropdown, which must default to the model a fresh install chats with.
export const DEFAULT_LIVE_ARTIFACTS_MODEL_ID = 'gemini-4-hydrogen';
export const DEFAULT_THOUGHT_TRANSLATION_MODEL_ID = 'gemini-3.5-flash-lite';
