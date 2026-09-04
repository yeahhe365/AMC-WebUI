import React from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { Check, Copy, Maximize2, ChevronDown, ChevronUp, Download, Sidebar, Play, Loader2 } from 'lucide-react';
import { MESSAGE_BLOCK_BUTTON_CLASS } from '@/constants/buttonClasses';
import { LanguageIcon } from '@/components/message/code/LanguageIcon';
import { interpolate } from '@/i18n/interpolate';

interface CodeHeaderProps {
  language: string;
  showPreview: boolean;
  isOverflowing: boolean;
  isExpanded: boolean;
  isCopied: boolean;
  onToggleExpand: () => void;
  onCopy: () => void;
  onDownload: () => void;
  onOpenSide: () => void;
  onOpenPreview: () => void;
  canRun?: boolean;
  isRunning?: boolean;
  onRun?: () => void;
}

export const CodeHeader: React.FC<CodeHeaderProps> = ({
  language,
  showPreview,
  isOverflowing,
  isExpanded,
  isCopied,
  onToggleExpand,
  onCopy,
  onDownload,
  onOpenSide,
  onOpenPreview,
  canRun,
  isRunning,
  onRun,
}) => {
  const { t } = useI18n();
  const headerButtonClass = `${MESSAGE_BLOCK_BUTTON_CLASS} !min-h-10 !min-w-10 !rounded-md !p-0 !opacity-90 hover:!opacity-100 hover:bg-[var(--theme-bg-tertiary)]/40`;
  const runButtonClass = `${headerButtonClass} ${isRunning ? 'text-[var(--theme-text-link)]' : ''} !bg-transparent`;

  return (
    <div className="sticky top-0 z-10 flex select-none items-center justify-between gap-2 rounded-t-lg border-b border-[var(--theme-border-secondary)] bg-[var(--theme-bg-code-block-header)] px-3 py-0 transition-all">
      <div className="flex min-w-0 items-center gap-1 pl-0.5">
        <LanguageIcon language={language} />
      </div>

      <div data-code-header-toolbar className="flex flex-shrink-0 items-center gap-0.5">
        {canRun && onRun && (
          <button className={runButtonClass} title={t('codeRunPython')} onClick={onRun} disabled={isRunning}>
            {isRunning ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Play size={16} strokeWidth={2.5} fill="currentColor" />
            )}
          </button>
        )}

        {showPreview && (
          <>
            <button className={headerButtonClass} title={t('diagramOpenSidePanel')} onClick={onOpenSide}>
              <Sidebar size={16} strokeWidth={2} />
            </button>
            <button className={headerButtonClass} title={t('codeFullscreenModal')} onClick={onOpenPreview}>
              <Maximize2 size={16} strokeWidth={2} />
            </button>
          </>
        )}
        <button
          className={headerButtonClass}
          title={interpolate(t('codeDownloadLanguage'), { language: language.toUpperCase() })}
          onClick={onDownload}
        >
          <Download size={16} strokeWidth={2} />
        </button>
        <button
          className={headerButtonClass}
          title={isCopied ? t('copiedButtonTitle') : t('copyButtonTitle')}
          onClick={onCopy}
        >
          {isCopied ? (
            <Check size={16} className="text-[var(--theme-text-success)] icon-animate-pop" strokeWidth={2} />
          ) : (
            <Copy size={16} strokeWidth={2} />
          )}
        </button>
        {isOverflowing && (
          <button
            onClick={onToggleExpand}
            className={headerButtonClass}
            aria-expanded={isExpanded}
            title={isExpanded ? t('collapse') : t('expand')}
          >
            {isExpanded ? <ChevronUp size={16} strokeWidth={2} /> : <ChevronDown size={16} strokeWidth={2} />}
          </button>
        )}
      </div>
    </div>
  );
};
