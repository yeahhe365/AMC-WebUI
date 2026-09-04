import { describe, it, expect } from 'vitest';
import { SUPPORTED_LANGUAGES, APP_LANGUAGE_IDS, LANGUAGE_META, BROWSER_LANG_PREFIX_MAP } from './languageRegistry';

describe('languageRegistry', () => {
  it('exposes 7 languages en/zh/ja/ko/es/fr/de', () => {
    expect([...SUPPORTED_LANGUAGES]).toEqual(['en', 'zh', 'ja', 'ko', 'es', 'fr', 'de']);
  });
  it('APP_LANGUAGE_IDS includes system after all languages', () => {
    expect([...APP_LANGUAGE_IDS]).toEqual(['en', 'zh', 'ja', 'ko', 'es', 'fr', 'de', 'system']);
  });
  it('LANGUAGE_META has nativeLabel for each language', () => {
    expect(LANGUAGE_META.ja.nativeLabel).toBe('日本語');
    expect(LANGUAGE_META.zh.nativeLabel).toBe('中文');
    expect(LANGUAGE_META.ko.nativeLabel).toBe('한국어');
    expect(LANGUAGE_META.es.nativeLabel).toBe('Español');
    expect(LANGUAGE_META.fr.nativeLabel).toBe('Français');
    expect(LANGUAGE_META.de.nativeLabel).toBe('Deutsch');
  });
  it('BROWSER_LANG_PREFIX_MAP resolves CJK and European prefixes', () => {
    expect(BROWSER_LANG_PREFIX_MAP['ja']).toBe('ja');
    expect(BROWSER_LANG_PREFIX_MAP['zh']).toBe('zh');
    expect(BROWSER_LANG_PREFIX_MAP['ko']).toBe('ko');
    expect(BROWSER_LANG_PREFIX_MAP['es']).toBe('es');
    expect(BROWSER_LANG_PREFIX_MAP['fr']).toBe('fr');
    expect(BROWSER_LANG_PREFIX_MAP['de']).toBe('de');
  });
});
