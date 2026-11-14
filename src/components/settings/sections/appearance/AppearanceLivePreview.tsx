import React, { Suspense, useMemo, useState } from 'react';
import { Eye, Code, FileText } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import type { AppSettings } from '@/types';
import { getRegisteredModelName } from '@/constants/modelRegistry';
import { DEFAULT_MODEL_ID } from '@/constants/modelConfiguration';
import { KNOWN_MODELS_CATALOG } from '@/utils/model/knownModelsCatalog';
import { lazyNamedComponent } from '@/utils/lazyNamedComponent';

const PreviewMarkdown = lazyNamedComponent(
  () => import('@/components/message/StandardMarkdownRenderer'),
  'StandardMarkdownRenderer',
);
const ignorePreviewAction = () => {};
const CODE_SAMPLE =
  '```python\ndef fibonacci(n: int):\n    a, b = 0, 1\n    for _ in range(n):\n        yield a\n        a, b = b, a + b\n```';

export interface AppearanceLivePreviewProps {
  settings: AppSettings;
}

export const AppearanceLivePreview: React.FC<AppearanceLivePreviewProps> = ({ settings }) => {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<'code' | 'text'>('code');
  const fontSize = settings.baseFontSize || 16;
  const modelDisplayName = useMemo(() => {
    const modelId = settings.modelId || DEFAULT_MODEL_ID;
    // Registry names carry the labels the picker intentionally uses (e.g. "Nano
    // Banana Pro"); the catalog then keeps retired-but-still-callable ids such as
    // gemini-3.7-flash showing a friendly name instead of their raw slug.
    return getRegisteredModelName(modelId) || KNOWN_MODELS_CATALOG[modelId.replace(/^models\//, '')]?.name || modelId;
  }, [settings.modelId]);
  const content =
    activeTab === 'code'
      ? `${t('settingsLivePreviewAssistantSample')}\n\n${CODE_SAMPLE}`
      : `${t('settingsLivePreviewTextSample')}\n\n> ${t('settingsLivePreviewQuoteSample')}\n\n${t('settingsLivePreviewTableSample')}`;

  return (
    <section
      data-settings-item="interface-live-preview"
      aria-label={t('settingsLivePreviewTitle')}
      className="rounded-2xl border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-secondary)]/30 p-3 sm:p-5 space-y-4 overflow-hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Eye size={16} className="text-[var(--theme-text-secondary)] shrink-0" />
          <h3 className="text-sm font-semibold text-[var(--theme-text-primary)]">{t('settingsLivePreviewTitle')}</h3>
        </div>
        <div
          className="flex flex-wrap gap-1 p-1 bg-[var(--theme-bg-tertiary)] rounded-lg"
          role="group"
          aria-label={t('settingsLivePreviewTitle')}
        >
          {(['code', 'text'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              aria-pressed={activeTab === tab}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-md flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-border-focus)] ${activeTab === tab ? 'bg-[var(--theme-bg-primary)] text-[var(--theme-text-primary)] shadow-xs' : 'text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]'}`}
            >
              {tab === 'code' ? <Code size={14} /> : <FileText size={14} />}
              {t(tab === 'code' ? 'settingsLivePreviewTabCode' : 'settingsLivePreviewTabText')}
            </button>
          ))}
        </div>
      </div>
      <div className="rounded-xl border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-primary)] p-3 sm:p-5 space-y-5">
        <div className="flex justify-end">
          <div
            style={{ fontSize }}
            className="max-w-[90%] rounded-2xl rounded-tr-sm px-3 py-2 bg-[var(--theme-bg-user-message)] text-[var(--theme-bg-user-message-text)] leading-relaxed"
          >
            {t(activeTab === 'code' ? 'settingsLivePreviewUserSample' : 'settingsLivePreviewTextUserSample')}
          </div>
        </div>
        <div className="flex items-start gap-2.5">
          <img
            src="/assets/assistant-avatar.png"
            alt={t('assistantAvatarAlt')}
            className="w-6 h-6 object-contain shrink-0 rounded-md mt-1"
          />
          <div className="min-w-0 flex-1 space-y-2 text-[var(--theme-text-primary)]">
            <p className="text-xs font-semibold text-[var(--theme-text-secondary)] break-words">{modelDisplayName}</p>
            <div
              className="markdown-body break-words"
              style={
                {
                  fontSize,
                  '--app-font-reading':
                    settings.readingFontFamily === 'serif' ? 'var(--app-font-serif)' : 'var(--app-font-sans)',
                } as React.CSSProperties
              }
            >
              <Suspense fallback={<p className="text-sm text-[var(--theme-text-secondary)]">{t('loading')}</p>}>
                <PreviewMarkdown
                  content={content}
                  isLoading={false}
                  onImageClick={ignorePreviewAction}
                  onOpenHtmlPreview={ignorePreviewAction}
                  onOpenSidePanel={ignorePreviewAction}
                  expandCodeBlocksByDefault
                  isMermaidRenderingEnabled={false}
                  isGraphvizRenderingEnabled={false}
                  themeId={settings.themeId}
                  interactiveMode="disabled"
                />
              </Suspense>
            </div>
            {settings.showMessageTokenStats !== false && (
              <p className="text-[10px] text-[var(--theme-text-tertiary)] font-mono">64 tokens · 240ms · 68.2 tok/s</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
