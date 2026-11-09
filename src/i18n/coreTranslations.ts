import { appTranslations } from './translations/app';
import { headerTranslations } from './translations/header';
import { chatInputTranslations } from './translations/chatInput';
import { messagesTranslations } from './translations/messages';
import { historyTranslations } from './translations/history';
import { libraryTranslations } from './translations/library';
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
 * (sidebar, chat toolbar, PWA banner, the `?mcp=` share gate that pops on first
 * paint). Full settings copy lives under `src/i18n/translations/settings/*` and
 * is loaded on demand.
 *
 * A key belongs here when its component can mount before the settings pack has
 * ever been requested — otherwise `getTranslator` falls through to the raw key
 * and the UI renders `settingsMcpShareTitle` instead of a sentence. Any such
 * component must be listed in the shell-surface test in
 * `src/i18n/translationCoverage.test.ts`.
 */
const shellFeatureTranslations: TranslationMap = {
  settingsThinkingMode: {
    en: 'Reasoning Mode',
    zh: '推理模式',
    ja: '推論モード',
    de: 'Reasoning-Modus',
    es: 'Modo de razonamiento',
    ko: '추론 모드',
    fr: 'Mode de raisonnement',
  },
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
  settingsMcpCancel: {
    en: 'Cancel',
    zh: '取消',
    ja: 'キャンセル',
    es: 'Cancelar',
    ko: '취소',
    fr: 'Annuler',
    de: 'Abbrechen',
  },
  settingsMcpShareTitle: {
    en: 'Add shared MCP servers?',
    zh: '是否添加分享的 MCP 服务器？',
    ja: '共有されたMCPサーバーを追加しますか？',
    es: '¿Añadir los servidores MCP compartidos?',
    ko: '공유된 MCP 서버를 추가할까요?',
    fr: 'Ajouter les serveurs MCP partagés ?',
    de: 'Geteilte MCP-Server hinzufügen?',
  },
  settingsMcpShareBody: {
    en: 'They are added disabled. You will be asked to trust each one before it runs.',
    zh: '它们会以停用状态添加。运行前需要你逐一确认信任。',
    ja: '無効な状態で追加されます。実行前にそれぞれ信頼の確認が必要です。',
    es: 'Se añaden desactivados. Se pedirá confirmar confianza en cada uno antes de ejecutarlos.',
    ko: '비활성 상태로 추가됩니다. 실행 전에 각각 신뢰 확인이 필요합니다.',
    fr: 'Ils sont ajoutés désactivés. Chaque serveur demandera une confirmation de confiance avant exécution.',
    de: 'Sie werden deaktiviert hinzugefügt. Vor der Ausführung ist je Server eine Vertrauensbestätigung nötig.',
  },
  settingsMcpShareAction: {
    en: 'Add servers',
    zh: '添加服务器',
    ja: 'サーバーを追加',
    es: 'Añadir servidores',
    ko: '서버 추가',
    fr: 'Ajouter les serveurs',
    de: 'Server hinzufügen',
  },
  settingsGenerateQuadImagesTooltip: {
    en: 'When enabled, image-generation prompts will produce four independent variations at once. This will consume more API credits.',
    zh: '启用后，图片生成提示词将一次性生成四张独立变体。这将消耗更多 API 用量。',
    ja: '有効にすると、画像生成プロンプトで一度に4つの独立したバリエーションが生成されます。APIクレジットを多く消費します。',
    de: 'Wenn aktiviert, erzeugen Bildgenerierungs-Prompts vier unabhängige Variationen auf einmal. Dies verbraucht mehr API-Credits.',
    es: 'Cuando esté habilitado, las solicitudes de generación de imágenes producirán cuatro variaciones independientes a la vez. Esto consumirá más créditos de API.',
    ko: '활성화하면 이미지 생성 프롬프트가 한 번에 네 가지 독립적인 변형을 생성합니다. API 크레딧이 더 많이 소모됩니다.',
    fr: "Lorsqu'ils sont activés, les prompts de génération d'images produiront quatre variations indépendantes à la fois. Cela consommera plus de crédits API.",
  },
  apiRuntimeKeyNotConfigured: {
    en: 'API Key not configured.',
    zh: 'API 密钥未配置。',
    ja: 'APIキーが未設定です。',
    ko: 'API 키가 구성되지 않았습니다.',
    es: 'Clave de API no configurada.',
    fr: 'Clé API non configurée.',
    de: 'API-Schlüssel nicht konfiguriert.',
  },
  ...ttsStyleTranslations,
};

export const translations: TranslationMap = {
  ...appTranslations,
  ...headerTranslations,
  ...chatInputTranslations,
  ...messagesTranslations,
  ...historyTranslations,
  ...libraryTranslations,
  ...commonTranslations,
  ...chatTranslations,
  ...shellFeatureTranslations,
};

export const registerTranslations = (translationMap: TranslationMap) => {
  Object.assign(translations, translationMap);
};

export const getTranslator =
  (lang: SupportedLanguage) =>
  (
    key: keyof typeof translations | string,
    fallbackOrParams?: string | Record<string, string | number>,
    params?: Record<string, string | number>,
  ): string => {
    const translationSet = translations as TranslationMap;
    const fallback = typeof fallbackOrParams === 'string' ? fallbackOrParams : undefined;
    const interpolationParams =
      typeof fallbackOrParams === 'object' && fallbackOrParams !== null ? fallbackOrParams : params;
    let text = translationSet[key]?.[lang] ?? translationSet[key]?.en ?? fallback ?? key;
    if (interpolationParams) {
      for (const [paramKey, paramVal] of Object.entries(interpolationParams)) {
        text = text.replaceAll(`{${paramKey}}`, String(paramVal));
      }
    }
    return text;
  };

export type Translator = ReturnType<typeof getTranslator>;
