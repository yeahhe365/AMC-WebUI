import type { TranslationTargetLanguage } from '@/types';

export const DEFAULT_TRANSLATION_TARGET_LANGUAGE: TranslationTargetLanguage = 'English';
export const DEFAULT_THOUGHT_TRANSLATION_TARGET_LANGUAGE: TranslationTargetLanguage = 'Simplified Chinese';

export const TRANSLATION_TARGET_LANGUAGE_OPTIONS: Array<{
  value: TranslationTargetLanguage;
  labelKey: string;
}> = [
  { value: 'English', labelKey: 'translationTargetLanguageEnglish' },
  { value: 'Simplified Chinese', labelKey: 'translationTargetLanguageSimplifiedChinese' },
  { value: 'Traditional Chinese', labelKey: 'translationTargetLanguageTraditionalChinese' },
  { value: 'Japanese', labelKey: 'translationTargetLanguageJapanese' },
  { value: 'Korean', labelKey: 'translationTargetLanguageKorean' },
  { value: 'Spanish', labelKey: 'translationTargetLanguageSpanish' },
  { value: 'French', labelKey: 'translationTargetLanguageFrench' },
  { value: 'German', labelKey: 'translationTargetLanguageGerman' },
];

/**
 * Live Translate 目标语言选项。
 *
 * 对照官方文档（ai.google.dev/gemini-api/docs/live-api/live-translate#supported-languages）：
 * 完整列出官方支持的全部 78 种语言，value 为 BCP-47 代码（translationConfig.targetLanguageCode 要求的格式）。
 * 源语言由模型自动检测，故此处不提供源语言列表。
 *
 * 显示名通过 Intl.DisplayNames 按当前 UI 语言生成（见 liveTranslateLanguageLabel），
 * 因此无需为每种语言维护 i18n 文案。
 *
 * 注：官方表中 Norwegian 的代码写作 "no, nb"（两者均接受），此处取主代码 'no'。
 */
export const LIVE_TRANSLATE_TARGET_LANGUAGE_CODES: string[] = [
  'af',
  'ak',
  'am',
  'ar',
  'az',
  'be',
  'bg',
  'bn',
  'ca',
  'cs',
  'da',
  'de',
  'el',
  'en',
  'es',
  'et',
  'eu',
  'fa',
  'fi',
  'fil',
  'fr',
  'gl',
  'gu',
  'ha',
  'he',
  'hi',
  'hr',
  'hu',
  'hy',
  'id',
  'is',
  'it',
  'ja',
  'jv',
  'ka',
  'kk',
  'km',
  'kn',
  'ko',
  'lo',
  'lt',
  'lv',
  'mk',
  'ml',
  'mn',
  'mr',
  'ms',
  'my',
  'ne',
  'nl',
  'no',
  'pa',
  'pl',
  'pt-BR',
  'pt-PT',
  'ro',
  'ru',
  'rw',
  'sd',
  'si',
  'sk',
  'sl',
  'sq',
  'sr',
  'su',
  'sv',
  'sw',
  'ta',
  'te',
  'th',
  'tr',
  'uk',
  'ur',
  'uz',
  'vi',
  'zh-Hans',
  'zh-Hant',
  'zu',
];

/**
 * 将 BCP-47 语言代码转为本地化显示名。
 * 使用浏览器原生 Intl.DisplayNames，跟随 UI 语言，无需维护翻译表。
 */
const _displayNamesCache = new Map<string, Intl.DisplayNames>();
export const liveTranslateLanguageLabel = (code: string, locale: string = 'en'): string => {
  try {
    let dn = _displayNamesCache.get(locale);
    if (!dn) {
      dn = new Intl.DisplayNames([locale], { type: 'language', fallback: 'code' });
      _displayNamesCache.set(locale, dn);
    }
    return dn.of(code) ?? code;
  } catch {
    return code;
  }
};
