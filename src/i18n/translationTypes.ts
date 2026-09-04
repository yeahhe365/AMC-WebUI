import type { SupportedLanguage } from './languageRegistry';

/** One translation entry: at least one language, optionally more. */
export type TranslationEntry = Partial<Record<SupportedLanguage, string>>;

/** Flat key → per-language string map used by every translation pack. */
export type TranslationMap = Record<string, TranslationEntry>;
