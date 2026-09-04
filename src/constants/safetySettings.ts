import { HarmBlockThreshold, HarmCategory, type SafetySetting } from '@/types';

/**
 * Matches the documented default for Gemini 2.5 and 3 models: the docs state
 * the block threshold is `Off` when unset, and `OFF` is the most permissive
 * step the API accepts — it disables the four adjustable filters entirely, so
 * no `safetyRatings` are reported for them. `BLOCK_NONE` (the next step) blocks
 * nothing either but keeps classification on for visibility.
 *
 * Two caveats that no threshold can change: the API always blocks core harms
 * such as child safety content regardless of these settings, and the docs warn
 * that applications using less restrictive settings may be subject to review.
 */
export const DEFAULT_SAFETY_SETTINGS: SafetySetting[] = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.OFF },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.OFF },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.OFF },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.OFF },
];

/**
 * Categories the Gemini API still accepts. HARM_CATEGORY_CIVIC_INTEGRITY is
 * deprecated upstream (use enableEnhancedCivicAnswers instead), so legacy
 * persisted settings containing it are dropped before requests are sent.
 */
const API_SUPPORTED_CATEGORIES: ReadonlySet<HarmCategory> = new Set([
  HarmCategory.HARM_CATEGORY_HARASSMENT,
  HarmCategory.HARM_CATEGORY_HATE_SPEECH,
  HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
  HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
]);

export const toApiSafetySettings = (settings?: SafetySetting[]): SafetySetting[] | undefined =>
  settings?.filter((setting) => API_SUPPORTED_CATEGORIES.has(setting.category));
