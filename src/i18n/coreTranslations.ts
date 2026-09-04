import { appTranslations } from './translations/app';
import { headerTranslations } from './translations/header';
import { chatInputTranslations } from './translations/chatInput';
import { messagesTranslations } from './translations/messages';
import { historyTranslations } from './translations/history';
import { commonTranslations } from './translations/common';
import { chatTranslations } from './translations/chat';
import { ttsStyleTranslations } from './voiceStyleTranslations';
import type { SupportedLanguage } from './languageRegistry';
import type { TranslationMap } from './translationTypes';
export type { SupportedLanguage } from './languageRegistry';
// Types live in a leaf module so feature packs can import them without
// reaching back into this file (which imports their values) — keeps the
// module graph acyclic.
export type { TranslationMap } from './translationTypes';

/**
 * Shell / always-mounted chrome strings that must work before lazy feature
 * packs (settings, etc.) are registered via `ensureFeatureTranslations`.
 *
 * Keep this list minimal and only for UI that renders on the main shell path
 * (sidebar, chat toolbar, PWA banner). Full settings copy lives under
 * `src/i18n/translations/settings/*` and is loaded on demand.
 *
 * Keys that also appear in lazy packs (e.g. settingsTitle) are intentional:
 * core owns the bootstrap value; the lazy pack may re-register the same
 * strings when the settings modal loads. Prefer editing both places if wording
 * changes, or move the key solely into core if only shell needs it early.
 */
const shellFeatureTranslations: TranslationMap = {
  // Sidebar + settings modal chrome (modal also loads the full settings pack).
  settingsTitle: {
    en: 'Settings',
    zh: '设置',
    ja: '設定',
    ko: '설정',
    es: 'Ajustes',
    fr: 'Paramètres',
    de: 'Einstellungen',
  },
  // Chat toolbar selectors (mounted before settings pack).
  settingsTtsVoice: { en: 'Speech Voice', zh: '语音音色', ja: '音声', ko: '음성', es: 'Voz', fr: 'Voix', de: 'Stimme' },
  settingsMediaResolution: {
    en: 'Input Detail Level',
    zh: '输入细节等级',
    ja: '入力の詳細レベル',
    ko: '입력 세부 수준',
    es: 'Nivel de detalle de entrada',
    fr: "Niveau de détail d'entrée",
    de: 'Detailgrad der Eingabe',
  },
  // CamelCase labels used by MediaResolutionSelector on the chat chrome.
  mediaResolutionUnspecified: {
    en: 'Auto (Default)',
    zh: '自动（默认）',
    ja: '自動（デフォルト）',
    ko: '자동 (기본값)',
    es: 'Automático (predeterminado)',
    fr: 'Auto (par défaut)',
    de: 'Automatisch (Standard)',
  },
  mediaResolutionLow: {
    en: 'Low (Faster)',
    zh: '低（较快）',
    ja: '低（高速）',
    ko: '낮음 (빠름)',
    es: 'Bajo (más rápido)',
    fr: 'Faible (plus rapide)',
    de: 'Niedrig (schneller)',
  },
  mediaResolutionMedium: {
    en: 'Medium (Balanced)',
    zh: '中（平衡）',
    ja: '中（バランス）',
    ko: '중간 (균형)',
    es: 'Medio (equilibrado)',
    fr: 'Moyen (équilibré)',
    de: 'Mittel (ausgewogen)',
  },
  mediaResolutionHigh: {
    en: 'High (Detail)',
    zh: '高（细节）',
    ja: '高（詳細）',
    ko: '높음 (세부 묘사)',
    es: 'Alto (detallado)',
    fr: 'Élevé (détaillé)',
    de: 'Hoch (detailliert)',
  },
  mediaResolutionUltraHigh: {
    en: 'Ultra High (Images only)',
    zh: '超高（仅限图片）',
    ja: '超高（画像のみ）',
    ko: '매우 높음 (이미지만)',
    es: 'Ultra alto (solo imágenes)',
    fr: 'Ultra élevé (images uniquement)',
    de: 'Ultrahoch (nur Bilder)',
  },
  mediaResolutionLiveTokensPerImage: {
    en: '{count} tokens / image',
    zh: '{count} tokens / 张图片',
    ja: '{count} トークン / 枚',
    ko: '{count} 토큰 / 이미지',
    es: '{count} tokens / imagen',
    fr: '{count} tokens / image',
    de: '{count} Tokens / Bild',
  },
  // PWA update banner (always available).
  aboutUpdateReady: {
    en: 'Update ready to refresh',
    zh: '发现可用更新',
    ja: '更新の準備ができました',
    ko: '새로고침하여 업데이트 준비 완료',
    es: 'Actualización lista para recargar',
    fr: 'Mise à jour prête à être installée',
    de: 'Update bereit zum Aktualisieren',
  },
  pwaUpdateRefreshPrompt: {
    en: 'Refresh to update the installed shell and latest assets.',
    zh: '刷新以更新已安装的应用外壳和最新资源。',
    ja: '再読み込みすると、インストール済みのシェルと最新のアセットが更新されます。',
    ko: '새로고침하여 설치된 셸과 최신 리소스를 업데이트하세요.',
    es: 'Actualiza para renovar el shell instalado y los recursos más recientes.',
    fr: 'Actualisez pour mettre à jour le shell installé et les dernières ressources.',
    de: 'Neu laden, um die installierte Shell und die neuesten Ressourcen zu aktualisieren.',
  },
  pwaUpdateLater: { en: 'Later', zh: '稍后', ja: '後で', ko: '나중에', es: 'Más tarde', fr: 'Plus tard', de: 'Später' },
  ...ttsStyleTranslations,
};

export const translations: TranslationMap = {
  ...appTranslations,
  ...headerTranslations,
  ...chatInputTranslations,
  ...messagesTranslations,
  ...historyTranslations,
  ...commonTranslations,
  ...chatTranslations,
  ...shellFeatureTranslations,
};

export const registerTranslations = (translationMap: TranslationMap) => {
  Object.assign(translations, translationMap);
};

export const getTranslator =
  (lang: SupportedLanguage) =>
  (key: keyof typeof translations | string, fallback?: string): string => {
    const translationSet = translations as TranslationMap;
    // 优先级：当前语言 > 英语兜底 > 调用方传入的 fallback > 键名本身。
    // 旧实现把 fallback 放在 en 之前，会掩盖缺译（en 存在时仍返回 fallback）。
    return translationSet[key]?.[lang] ?? translationSet[key]?.en ?? fallback ?? key;
  };
