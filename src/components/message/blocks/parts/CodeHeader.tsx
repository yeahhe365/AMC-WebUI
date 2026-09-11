import React from 'react';
import { useI18n } from '@/contexts/I18nContext';
import {
  Check,
  Copy,
  Maximize2,
  ChevronDown,
  ChevronUp,
  Download,
  Sidebar,
  Play,
  Loader2,
  WrapText,
} from 'lucide-react';
import { MESSAGE_BLOCK_BUTTON_CLASS } from '@/constants/buttonClasses';
import { LanguageIcon } from '@/components/message/code/LanguageIcon';
import { interpolate } from '@/i18n/interpolate';

interface CodeHeaderProps {
  language: string;
  filename?: string;
  lineCount?: number;
  showPreview: boolean;
  isOverflowing: boolean;
  isExpanded: boolean;
  isCopied: boolean;
  isDownloaded?: boolean;
  isWrapped?: boolean;
  onToggleWrap?: () => void;
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
  filename,
  lineCount,
  showPreview,
  isOverflowing,
  isExpanded,
  isCopied,
  isDownloaded,
  isWrapped = false,
  onToggleWrap,
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
  const headerButtonClass = `${MESSAGE_BLOCK_BUTTON_CLASS} !min-h-10 !min-w-10 sm:!min-h-7 sm:!min-w-7 sm:!h-7 sm:!w-7 !rounded-md !p-0 !opacity-90 hover:!opacity-100 hover:bg-[var(--theme-bg-tertiary)]/70 active:scale-95 transition-all`;
  const runButtonClass = `${headerButtonClass} ${isRunning ? 'text-[var(--theme-text-link)]' : 'hover:text-[var(--theme-text-success)]'} !bg-transparent`;
  const wrapButtonClass = `${headerButtonClass} ${isWrapped ? '!text-[var(--theme-text-link)] !bg-[var(--theme-bg-tertiary)] font-medium' : ''}`;

  return (
    <div
      className={`sticky top-0 z-10 flex h-8 select-none items-center justify-between gap-2 rounded-t-lg border-b border-[var(--theme-border-secondary)]/50 bg-[var(--theme-bg-code-block-header)] px-2.5 py-0 transition-all ${
        isOverflowing ? 'cursor-pointer hover:bg-[var(--theme-bg-tertiary)]/50 group/header' : ''
      }`}
      onClick={isOverflowing ? onToggleExpand : undefined}
      title={isOverflowing ? (isExpanded ? t('codeCollapseBlock') : t('codeShowMore')) : undefined}
      role={isOverflowing ? 'button' : undefined}
      tabIndex={isOverflowing ? 0 : undefined}
      aria-expanded={isOverflowing ? isExpanded : undefined}
      onKeyDown={
        isOverflowing
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onToggleExpand();
              }
            }
          : undefined
      }
    >
      <div className="flex min-w-0 items-center gap-2 pl-0.5 font-mono text-xs font-medium text-[var(--theme-text-secondary)]">
        <LanguageIcon language={language} />
        {filename && (
          <span
            className="text-[11px] font-normal text-[var(--theme-text-tertiary)] truncate max-w-[200px]"
            title={filename}
          >
            {filename}
          </span>
        )}
        {lineCount !== undefined && lineCount > 0 && (
          <span
            data-code-line-count
            className="text-[11px] font-normal text-[var(--theme-text-tertiary)] opacity-70 select-none"
          >
            {interpolate(t('codeLineCount'), { count: lineCount })}
          </span>
        )}
      </div>

      <div
        data-code-header-toolbar
        className="flex flex-shrink-0 items-center gap-0.5 opacity-90 hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
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

        {onToggleWrap && (
          <button
            className={wrapButtonClass}
            title={isWrapped ? t('codeUnwrap') : t('codeWrap')}
            aria-label={isWrapped ? t('codeUnwrap') : t('codeWrap')}
            onClick={onToggleWrap}
            aria-pressed={isWrapped}
          >
            <WrapText size={16} strokeWidth={2} />
          </button>
        )}

        <button
          className={headerButtonClass}
          title={
            isDownloaded
              ? t('downloaded')
              : interpolate(t('codeDownloadLanguage'), { language: language.toUpperCase() })
          }
          onClick={onDownload}
        >
          {isDownloaded ? (
            <Check size={16} className="text-[var(--theme-text-success)] icon-animate-pop" strokeWidth={2} />
          ) : (
            <Download size={16} strokeWidth={2} />
          )}
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
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand();
            }}
            className={`${headerButtonClass} group-hover/header:text-[var(--theme-text-primary)]`}
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
