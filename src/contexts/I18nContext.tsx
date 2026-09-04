import React, { createContext, useContext, useEffect, useMemo } from 'react';
import { useSettingsStore } from '@/stores/settingsStore';
import { getTranslator } from '@/i18n/coreTranslations';
import type { SupportedLanguage } from '@/i18n/languageRegistry';

type Translator = ReturnType<typeof getTranslator>;

interface I18nContextValue {
  language: SupportedLanguage;
  t: Translator;
}

const I18nContext = createContext<I18nContextValue | null>(null);

// Keep the document language attribute in sync for screen readers, browser
// auto-translate prompts, and Intl fallback heuristics.
const HTML_LANG_BY_LANGUAGE: Record<SupportedLanguage, string> = {
  en: 'en',
  zh: 'zh-CN',
  ja: 'ja',
  ko: 'ko',
  es: 'es',
  fr: 'fr',
  de: 'de',
};

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const language = useSettingsStore((state) => state.language);
  const t = useMemo(() => getTranslator(language), [language]);
  const value = useMemo(() => ({ language, t }), [language, t]);

  useEffect(() => {
    document.documentElement.lang = HTML_LANG_BY_LANGUAGE[language];
  }, [language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useI18n = () => {
  const value = useContext(I18nContext);
  // 保持 hooks 调用顺序稳定：fallback 订阅必须无条件执行，
  // 否则 Provider 挂载/卸载时会出现 hook 顺序不一致。
  const fallbackLanguage = useSettingsStore((state) => state.language);
  const fallbackT = useMemo(() => getTranslator(fallbackLanguage), [fallbackLanguage]);

  if (!value) {
    if (import.meta.env.MODE === 'test') {
      return { language: fallbackLanguage, t: fallbackT };
    }

    throw new Error('useI18n must be used within I18nProvider');
  }

  return value;
};
