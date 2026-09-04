import React from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { Quote, Copy, Check, CornerRightDown, Volume2, MessageCircleQuestion } from 'lucide-react';
import { IconGoogle } from '@/components/icons';

interface StandardActionsViewProps {
  onQuote: (e: React.MouseEvent) => void;
  onInsert?: (e: React.MouseEvent) => void;
  onCopy: (e: React.MouseEvent) => void;
  onSearch: (e: React.MouseEvent) => void;
  onAsk?: (e: React.MouseEvent) => void;
  onTTS?: (e: React.SyntheticEvent) => void;
  isCopied: boolean;
  /** Non-null shows a transient error message attached to the TTS button. */
  ttsError?: string | null;
}

export const StandardActionsView: React.FC<StandardActionsViewProps> = ({
  onQuote,
  onInsert,
  onCopy,
  onSearch,
  onAsk,
  onTTS,
  isCopied,
  ttsError,
}) => {
  const { t } = useI18n();
  const quoteLabel = t('quote');
  const insertLabel = t('fillInput');
  const copyLabel = isCopied ? t('copied') : t('copy');
  const searchLabel = t('search');
  const askLabel = t('ask');
  const actionButtonClass =
    'flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-medium text-[var(--theme-text-primary)] transition-all hover:bg-[var(--theme-bg-tertiary)] sm:px-3';

  return (
    <div className="flex items-center">
      <button onMouseDown={onQuote} className={actionButtonClass} title={quoteLabel} aria-label={quoteLabel}>
        <Quote size={14} className="text-[var(--theme-text-link)]" />
        <span>{quoteLabel}</span>
      </button>

      {onInsert && (
        <>
          <div className="mx-0.5 h-3.5 w-px shrink-0 bg-[var(--theme-border-secondary)]" />
          <button onMouseDown={onInsert} className={actionButtonClass} title={insertLabel} aria-label={insertLabel}>
            <CornerRightDown size={14} className="text-[var(--theme-text-secondary)]" />
            <span>{insertLabel}</span>
          </button>
        </>
      )}

      <div className="mx-0.5 h-3.5 w-px shrink-0 bg-[var(--theme-border-secondary)]" />

      <button onMouseDown={onCopy} className={actionButtonClass} title={copyLabel} aria-label={copyLabel}>
        {isCopied ? (
          <Check size={14} className="text-[var(--theme-text-success)]" />
        ) : (
          <Copy size={14} className="text-[var(--theme-text-tertiary)]" />
        )}
        <span>{copyLabel}</span>
      </button>

      <div className="mx-0.5 h-3.5 w-px shrink-0 bg-[var(--theme-border-secondary)]" />

      <button onMouseDown={onSearch} className={actionButtonClass} title={searchLabel} aria-label={searchLabel}>
        <IconGoogle size={14} />
        <span>{searchLabel}</span>
      </button>

      {onAsk && (
        <>
          <div className="mx-0.5 h-3.5 w-px shrink-0 bg-[var(--theme-border-secondary)]" />
          <button onMouseDown={onAsk} className={actionButtonClass} title={askLabel} aria-label={askLabel}>
            <MessageCircleQuestion size={14} className="text-[var(--theme-text-link)]" />
            <span>{askLabel}</span>
          </button>
        </>
      )}

      {onTTS && (
        <>
          <div className="mx-0.5 h-3.5 w-px shrink-0 bg-[var(--theme-border-secondary)]" />
          <button
            onPointerDown={(event) => {
              if (event.pointerType === 'mouse') return;
              onTTS(event);
            }}
            onMouseDown={onTTS}
            onMouseUp={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            className={`${actionButtonClass} ${ttsError ? 'text-[var(--theme-text-danger)]' : ''}`}
            title={ttsError ?? t('ttsReadAloud')}
            aria-label={ttsError ?? t('ttsReadAloud')}
          >
            <Volume2 size={14} className={ttsError ? 'text-[var(--theme-text-danger)]' : 'text-purple-500'} />
            <span>{ttsError ? t('ttsError') : 'TTS'}</span>
          </button>
        </>
      )}
    </div>
  );
};
