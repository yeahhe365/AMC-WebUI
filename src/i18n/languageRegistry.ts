export const SUPPORTED_LANGUAGES = ['en', 'zh', 'ja', 'ko', 'es', 'fr', 'de'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const APP_LANGUAGE_IDS = [...SUPPORTED_LANGUAGES, 'system'] as const;
export type AppLanguage = (typeof APP_LANGUAGE_IDS)[number];

export const LANGUAGE_META: Record<SupportedLanguage, { label: string; nativeLabel: string; flag: string }> = {
  en: { label: 'English', nativeLabel: 'English', flag: '🇺🇸' },
  zh: { label: 'Chinese', nativeLabel: '中文', flag: '🇨🇳' },
  ja: { label: 'Japanese', nativeLabel: '日本語', flag: '🇯🇵' },
  ko: { label: 'Korean', nativeLabel: '한국어', flag: '🇰🇷' },
  es: { label: 'Spanish', nativeLabel: 'Español', flag: '🇪🇸' },
  fr: { label: 'French', nativeLabel: 'Français', flag: '🇫🇷' },
  de: { label: 'German', nativeLabel: 'Deutsch', flag: '🇩🇪' },
};

export const BROWSER_LANG_PREFIX_MAP: Record<string, SupportedLanguage> = {
  zh: 'zh',
  ja: 'ja',
  ko: 'ko',
  es: 'es',
  fr: 'fr',
  de: 'de',
};

/**
 * 将任意 AppLanguage / 浏览器语言解析为受支持的界面语言。
 * 统一所有散落的 `navigator.language.startsWith('zh') ? 'zh' : 'en'` 分支，
 * 避免 ErrorBoundary / 流式处理器等旁路只认中文的 bug。
 */
export const resolveAppLanguage = (
  appLanguage: AppLanguage | string,
  navigatorLanguage?: string,
): SupportedLanguage => {
  const normalizedApp = (appLanguage || 'system').toString().toLowerCase();
  if (normalizedApp !== 'system' && (SUPPORTED_LANGUAGES as readonly string[]).includes(normalizedApp)) {
    return normalizedApp as SupportedLanguage;
  }
  if (normalizedApp !== 'system') {
    // 非 system 但非法值，兜底 en
    return 'en';
  }
  const raw = navigatorLanguage ?? (typeof navigator !== 'undefined' ? navigator.language : 'en');
  const prefix = raw.toLowerCase().split('-')[0];
  return BROWSER_LANG_PREFIX_MAP[prefix] ?? 'en';
};

/**
 * 专用于 ErrorBoundary 等无 AppLanguage 上下文的场景，
 * 仅根据浏览器语言解析。
 */
export const resolveBrowserLanguage = (navigatorLanguage?: string): SupportedLanguage =>
  resolveAppLanguage('system', navigatorLanguage);
