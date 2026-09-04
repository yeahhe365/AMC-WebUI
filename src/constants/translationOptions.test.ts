import { describe, expect, it } from 'vitest';
import { LIVE_TRANSLATE_TARGET_LANGUAGE_CODES, liveTranslateLanguageLabel } from './translationOptions';

describe('LIVE_TRANSLATE_TARGET_LANGUAGE_CODES', () => {
  it('matches the official supported-language count (78 languages)', () => {
    // 对照官方文档 ai.google.dev/gemini-api/docs/live-api/live-translate#supported-languages
    // 官方表格列出 78 种语言；"no, nb" 折叠为主代码 'no'。
    expect(LIVE_TRANSLATE_TARGET_LANGUAGE_CODES.length).toBe(78);
  });

  it('contains only unique codes', () => {
    expect(new Set(LIVE_TRANSLATE_TARGET_LANGUAGE_CODES).size).toBe(LIVE_TRANSLATE_TARGET_LANGUAGE_CODES.length);
  });

  it('collapses Norwegian "no, nb" to the primary code "no"', () => {
    expect(LIVE_TRANSLATE_TARGET_LANGUAGE_CODES).toContain('no');
    expect(LIVE_TRANSLATE_TARGET_LANGUAGE_CODES).not.toContain('no, nb');
  });

  it('includes representative BCP-47 codes across regions/scripts', () => {
    // 通用语种
    expect(LIVE_TRANSLATE_TARGET_LANGUAGE_CODES).toContain('en');
    expect(LIVE_TRANSLATE_TARGET_LANGUAGE_CODES).toContain('es');
    expect(LIVE_TRANSLATE_TARGET_LANGUAGE_CODES).toContain('fr');
    expect(LIVE_TRANSLATE_TARGET_LANGUAGE_CODES).toContain('de');
    expect(LIVE_TRANSLATE_TARGET_LANGUAGE_CODES).toContain('ja');
    expect(LIVE_TRANSLATE_TARGET_LANGUAGE_CODES).toContain('ko');
    expect(LIVE_TRANSLATE_TARGET_LANGUAGE_CODES).toContain('ar');
    expect(LIVE_TRANSLATE_TARGET_LANGUAGE_CODES).toContain('hi');
    // 中文两种变体
    expect(LIVE_TRANSLATE_TARGET_LANGUAGE_CODES).toContain('zh-Hans');
    expect(LIVE_TRANSLATE_TARGET_LANGUAGE_CODES).toContain('zh-Hant');
    // 葡萄牙语两种变体
    expect(LIVE_TRANSLATE_TARGET_LANGUAGE_CODES).toContain('pt-BR');
    expect(LIVE_TRANSLATE_TARGET_LANGUAGE_CODES).toContain('pt-PT');
    // 文档示例用 pl
    expect(LIVE_TRANSLATE_TARGET_LANGUAGE_CODES).toContain('pl');
  });
});

describe('liveTranslateLanguageLabel', () => {
  it('returns a localized display name for a known code', () => {
    // en locale 下，'ja' 显示为 "Japanese"
    expect(liveTranslateLanguageLabel('ja', 'en')).toBe('Japanese');
  });

  it('follows the requested locale', () => {
    // zh locale 下，'ja' 显示为中文
    expect(liveTranslateLanguageLabel('ja', 'zh')).toBe('日语');
  });

  it('falls back to the code for an unknown language', () => {
    expect(liveTranslateLanguageLabel('xx', 'en')).toBe('xx');
  });
});
