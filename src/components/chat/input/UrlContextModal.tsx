import React, { useState, useMemo } from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { Modal } from '@/components/shared/Modal';
import { Link, X, AlertTriangle, CheckCircle, Info, Globe } from 'lucide-react';
import { parseAndValidateUrlList, formatUrlDisplay, type ParsedUrlItem } from '@/utils/urlContext';
import { getFavicon } from '@/components/message/grounded-response/groundingSources';
import { interpolate } from '@/i18n/interpolate';
import { useChatStore } from '@/stores/chatStore';

export interface UrlContextModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertUrls?: (urls: string[]) => void;
  onEnableTool?: () => void;
  isToolEnabled?: boolean;
}

export const UrlContextModal: React.FC<UrlContextModalProps> = ({
  isOpen,
  onClose,
  onInsertUrls,
  onEnableTool,
  isToolEnabled = true,
}) => {
  const { t } = useI18n();
  const [rawInput, setRawInput] = useState('');

  const { items, validUrls, hasLimitWarning } = useMemo(() => parseAndValidateUrlList(rawInput), [rawInput]);

  const handleRemoveItem = (itemToRemove: ParsedUrlItem) => {
    // Reconstruct input without this candidate
    const remaining = items
      .filter((it) => it !== itemToRemove)
      .map((it) => it.raw)
      .join('\n');
    setRawInput(remaining);
  };

  const handleClear = () => {
    setRawInput('');
  };

  const handleInsert = () => {
    if (validUrls.length === 0) return;

    if (onInsertUrls) {
      onInsertUrls(validUrls);
    } else {
      // Append URLs to composer via store commandedInput
      const urlsText = validUrls.join('\n');
      useChatStore.getState().setCommandedInput({
        text: urlsText,
        id: Date.now(),
        mode: 'append',
      });
    }

    // Auto-enable tool if currently off
    if (!isToolEnabled && onEnableTool) {
      onEnableTool();
    }

    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} contentClassName="max-w-lg w-full">
      <div className="flex flex-col max-h-[85vh] p-6 text-[var(--theme-text-primary)]">
        <div className="flex items-start justify-between pb-4 border-b border-[var(--theme-border-secondary)]">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--theme-bg-accent)]/10 text-[var(--theme-text-link)]">
              <Link size={18} strokeWidth={2} />
            </div>
            <div>
              <h3 className="text-base font-semibold text-[var(--theme-text-primary)]">{t('urlContextModalTitle')}</h3>
              <p className="text-xs text-[var(--theme-text-secondary)] mt-0.5 max-w-sm">
                {t('urlContextModalSubtitle')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('close')}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="py-4 space-y-4 overflow-y-auto custom-scrollbar flex-1 pr-1">
          <div>
            <textarea
              rows={4}
              value={rawInput}
              onChange={(e) => setRawInput(e.target.value)}
              placeholder={t('urlContextInputPlaceholder')}
              className="w-full text-xs font-mono rounded-xl border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-secondary)] p-3 text-[var(--theme-text-primary)] placeholder:text-[var(--theme-text-tertiary)] focus:border-[var(--theme-border-focus)] focus:outline-none transition-colors resize-y min-h-[90px]"
            />
          </div>

          {hasLimitWarning && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-600 dark:text-amber-400">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>{t('urlContextLimitWarn')}</span>
            </div>
          )}

          {items.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-[var(--theme-text-secondary)] font-medium">
                <span>{interpolate(t('urlContextValidCount'), { count: validUrls.length })}</span>
                {items.length !== validUrls.length && (
                  <span className="text-[var(--theme-text-danger)] text-[11px]">
                    {items.length - validUrls.length} invalid
                  </span>
                )}
              </div>

              <div className="space-y-1.5 max-h-40 overflow-y-auto custom-scrollbar pr-0.5">
                {items.map((item, idx) => {
                  const favicon = item.normalizedUrl ? getFavicon(item.normalizedUrl) : null;
                  const display = formatUrlDisplay(item.normalizedUrl || item.raw);

                  let warningLabel: string | null = null;
                  if (item.warningType === 'localhost') {
                    warningLabel = t('urlContextLocalhostWarn');
                  } else if (item.warningType === 'youtube') {
                    warningLabel = t('urlContextYoutubeWarn');
                  } else if (item.warningType === 'invalid_protocol') {
                    warningLabel = t('urlContextInvalidProtocol');
                  }

                  return (
                    <div
                      key={`url-item-${idx}`}
                      className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border text-xs transition-colors ${
                        item.isValid
                          ? 'bg-[var(--theme-bg-tertiary)]/20 border-[var(--theme-border-secondary)]/30'
                          : 'bg-[var(--theme-bg-danger)]/5 border-[var(--theme-border-danger)]/20'
                      }`}
                      title={warningLabel || item.normalizedUrl || item.raw}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className="w-3.5 h-3.5 shrink-0 flex items-center justify-center rounded-xs overflow-hidden bg-white/90 ring-1 ring-black/5">
                          {favicon ? (
                            <img src={favicon} alt="" className="w-full h-full object-contain" />
                          ) : (
                            <Globe size={10} className="text-neutral-400" />
                          )}
                        </div>
                        <span
                          className={`font-mono truncate ${
                            item.isValid ? 'text-[var(--theme-text-primary)]' : 'text-[var(--theme-text-danger)]'
                          }`}
                        >
                          {display}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {item.isValid ? (
                          <CheckCircle size={13} className="text-[var(--theme-text-success)]" />
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[var(--theme-text-danger)]">
                            <AlertTriangle size={12} />
                            {item.warningType === 'localhost' && 'Localhost'}
                            {item.warningType === 'youtube' && 'YouTube'}
                            {item.warningType === 'invalid_protocol' && 'Protocol'}
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={() => handleRemoveItem(item)}
                          className="text-[var(--theme-text-tertiary)] hover:text-[var(--theme-icon-error)] p-0.5 rounded transition-colors"
                          aria-label={`Remove ${display}`}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="rounded-xl border border-[var(--theme-border-secondary)]/40 bg-[var(--theme-bg-secondary)]/40 p-3 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--theme-text-secondary)]">
              <Info size={13} className="text-[var(--theme-text-tertiary)] shrink-0" />
              <span>{t('urlContextTipsTitle')}</span>
            </div>
            <ul className="text-[11px] text-[var(--theme-text-tertiary)] space-y-1 pl-4 list-disc marker:text-[var(--theme-text-secondary)]/60">
              <li>{t('urlContextTipMaxUrls')}</li>
              <li>{t('urlContextTipMaxSize')}</li>
              <li>{t('urlContextTipSupportedTypes')}</li>
              <li>{t('urlContextTipUnsupportedTypes')}</li>
            </ul>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between pt-4 border-t border-[var(--theme-border-secondary)]">
          <button
            type="button"
            onClick={handleClear}
            disabled={!rawInput.trim()}
            className="text-xs text-[var(--theme-text-secondary)] hover:text-[var(--theme-icon-error)] transition-colors disabled:opacity-40 disabled:hover:text-[var(--theme-text-secondary)] cursor-pointer"
          >
            {t('urlContextClearBtn')}
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs rounded-lg font-medium text-[var(--theme-text-secondary)] hover:bg-[var(--theme-bg-tertiary)] transition-colors cursor-pointer"
            >
              {t('cancel')}
            </button>
            <button
              type="button"
              onClick={handleInsert}
              disabled={validUrls.length === 0}
              className="px-4 py-1.5 text-xs rounded-lg font-medium bg-[var(--theme-bg-accent)] text-[var(--theme-text-accent)] hover:opacity-90 transition-opacity disabled:opacity-40 cursor-pointer"
            >
              {t('urlContextInsertBtn')}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
