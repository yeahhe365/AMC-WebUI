import React, { useMemo, useState } from 'react';
import { Languages, Volume2, Search } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { useSettingsStore } from '@/stores/settingsStore';
import { LIVE_TRANSLATE_TARGET_LANGUAGE_CODES, liveTranslateLanguageLabel } from '@/constants/translationOptions';

/**
 * Live Translate 模式的目标语言选择器（替代普通 Live 模式的 voice 选择器）。
 *
 * 官方 API 中源语言由模型自动检测，故只暴露目标语言（BCP-47 代码）。
 * 附带 echo 开关：输入已是目标语言时是否原声回放。读写 appSettings 顶层字段。
 *
 * 支持 78 种官方语言：显示名通过 Intl.DisplayNames 按当前 UI 语言生成，
 * 下拉提供搜索框（语言较多）。
 */
export const LanguageDirectionSelector: React.FC = () => {
  const { t, language } = useI18n();
  const targetLanguageCode = useSettingsStore((state) => state.appSettings.liveTranslateTargetLanguageCode);
  const echoTargetLanguage = useSettingsStore((state) => state.appSettings.liveTranslateEchoTargetLanguage);
  const setAppSettings = useSettingsStore((state) => state.setAppSettings);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const options = useMemo(
    () =>
      LIVE_TRANSLATE_TARGET_LANGUAGE_CODES.map((code) => ({
        code,
        label: liveTranslateLanguageLabel(code, language),
      })),
    [language],
  );

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(normalizedQuery) || o.code.toLowerCase().includes(normalizedQuery),
    );
  }, [options, query]);

  const currentLabel = liveTranslateLanguageLabel(targetLanguageCode, language);

  return (
    <div className="relative flex items-center gap-2">
      <Languages size={14} className="text-purple-500 flex-shrink-0" />

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium mb-2 bg-[var(--theme-bg-secondary)] text-[var(--theme-text-primary)] border border-[var(--theme-border-secondary)] hover:bg-[var(--theme-bg-secondary)]/70 transition-colors duration-200"
        title={currentLabel}
      >
        <span className="max-w-[120px] truncate">{currentLabel}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full mb-2 left-0 z-50 w-56 max-h-[300px] flex flex-col bg-[var(--theme-bg-primary)] border border-[var(--theme-border-secondary)] rounded-lg shadow-xl overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--theme-border-secondary)]">
              <Search size={14} className="text-[var(--theme-text-tertiary)] flex-shrink-0" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search…"
                className="flex-1 bg-transparent text-xs text-[var(--theme-text-primary)] outline-none placeholder:text-[var(--theme-text-tertiary)]"
                autoFocus
              />
            </div>
            <div className="overflow-y-auto flex-1">
              {filtered.length === 0 && (
                <div className="px-3 py-3 text-xs text-[var(--theme-text-tertiary)]">No matches</div>
              )}
              {filtered.map((o) => (
                <button
                  key={o.code}
                  type="button"
                  onClick={() => {
                    setAppSettings((prev) => ({ ...prev, liveTranslateTargetLanguageCode: o.code }));
                    setOpen(false);
                    setQuery('');
                  }}
                  className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between gap-2 transition-colors duration-100 ${
                    o.code === targetLanguageCode
                      ? 'bg-[var(--theme-bg-accent)] text-[var(--theme-text-accent)]'
                      : 'text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-secondary)]'
                  }`}
                >
                  <span className="truncate">{o.label}</span>
                  <span className="text-[var(--theme-text-tertiary)] text-xs flex-shrink-0">{o.code}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <button
        type="button"
        onClick={() =>
          setAppSettings((prev) => ({
            ...prev,
            liveTranslateEchoTargetLanguage: !prev.liveTranslateEchoTargetLanguage,
          }))
        }
        className={`
          flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors duration-200 mb-2
          ${
            echoTargetLanguage
              ? 'bg-[var(--theme-bg-secondary)] text-[var(--theme-text-primary)] border border-[var(--theme-border-secondary)]'
              : 'text-[var(--theme-text-tertiary)] hover:bg-[var(--theme-bg-secondary)]/50'
          }
        `}
        title={t('liveTranslateEchoTargetLanguageTooltip')}
        aria-pressed={echoTargetLanguage}
      >
        <Volume2 size={14} strokeWidth={2} />
      </button>
    </div>
  );
};
