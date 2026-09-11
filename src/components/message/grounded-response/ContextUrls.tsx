import React, { useMemo } from 'react';
import { Link as LinkIcon, CheckCircle, Lock, ShieldAlert, AlertCircle, Globe } from 'lucide-react';
import { formatUrlPath, getFavicon } from './groundingSources';
import { useI18n } from '@/contexts/I18nContext';
import { interpolate } from '@/i18n/interpolate';
import { SETTINGS_SECTION_LABEL_CLASS } from '@/constants/designTokens';
import type { UrlContextItem } from '@/types';

interface ContextUrlsProps {
  metadata: unknown;
}

type StatusKind = 'success' | 'paywall' | 'unsafe' | 'error' | 'unspecified';

const resolveStatusInfo = (rawStatus?: string): { kind: StatusKind; labelKey: string } => {
  const normalizedStatus = rawStatus?.toUpperCase();
  if (normalizedStatus === 'URL_RETRIEVAL_STATUS_SUCCESS' || normalizedStatus === 'SUCCESS') {
    return { kind: 'success', labelKey: 'urlContextStatusSuccess' };
  }
  if (normalizedStatus === 'URL_RETRIEVAL_STATUS_PAYWALL' || normalizedStatus === 'PAYWALL') {
    return { kind: 'paywall', labelKey: 'urlContextStatusPaywall' };
  }
  if (normalizedStatus === 'URL_RETRIEVAL_STATUS_UNSAFE' || normalizedStatus === 'UNSAFE') {
    return { kind: 'unsafe', labelKey: 'urlContextStatusUnsafe' };
  }
  if (
    normalizedStatus === 'URL_RETRIEVAL_STATUS_ERROR' ||
    normalizedStatus === 'ERROR' ||
    normalizedStatus === 'URL_RETRIEVAL_STATUS_FAILED' ||
    normalizedStatus === 'FAILED'
  ) {
    return { kind: 'error', labelKey: 'urlContextStatusError' };
  }
  return { kind: 'unspecified', labelKey: 'unknown' };
};

const renderStatusIcon = (kind: StatusKind) => {
  switch (kind) {
    case 'success':
      return <CheckCircle size={12} className="text-[var(--theme-text-success)]" />;
    case 'paywall':
      return <Lock size={12} className="text-amber-500 dark:text-amber-400" />;
    case 'unsafe':
      return <ShieldAlert size={12} className="text-[var(--theme-text-danger)]" />;
    case 'error':
      return <AlertCircle size={12} className="text-[var(--theme-text-danger)]" />;
    default:
      return <Globe size={12} className="text-[var(--theme-text-tertiary)]" />;
  }
};

const getUrlContextItems = (metadata: unknown): UrlContextItem[] => {
  if (!metadata) return [];

  const resolvedMetadata = metadata as { urlMetadata?: UrlContextItem[]; url_metadata?: UrlContextItem[] };
  return resolvedMetadata.urlMetadata || resolvedMetadata.url_metadata || [];
};

export const ContextUrls: React.FC<ContextUrlsProps> = ({ metadata }) => {
  const { t } = useI18n();
  const items = useMemo<UrlContextItem[]>(() => getUrlContextItems(metadata), [metadata]);

  if (items.length === 0) return null;

  return (
    <div className="mt-3 pt-2 border-t border-[var(--theme-border-secondary)]/30 animate-in fade-in slide-in-from-top-1 duration-200">
      <div className="flex items-center gap-2 mb-2">
        <LinkIcon size={11} className="text-[var(--theme-text-tertiary)]" strokeWidth={2} />
        <h4 className={SETTINGS_SECTION_LABEL_CLASS}>{t('contextUrlsTitle')}</h4>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((item, itemIndex) => {
          const url = item.retrievedUrl || item.retrieved_url || '';
          const rawStatus = item.urlRetrievalStatus || item.url_retrieval_status;
          if (!url) return null;

          const { kind: statusKind, labelKey } = resolveStatusInfo(rawStatus);
          const statusLabel = t(labelKey);
          const favicon = getFavicon(url);
          const statusIcon = renderStatusIcon(statusKind);

          return (
            <a
              key={`context-${itemIndex}`}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[var(--theme-bg-tertiary)]/20 hover:bg-[var(--theme-bg-tertiary)]/60 border border-[var(--theme-border-secondary)]/30 hover:border-[var(--theme-border-secondary)] transition-all no-underline group max-w-full"
              title={`${url} (${interpolate(t('contextUrlsStatus'), { status: statusLabel })})`}
            >
              <div className="flex-shrink-0 w-3.5 h-3.5 flex items-center justify-center rounded-xs overflow-hidden bg-white/90 shadow-xs ring-1 ring-black/5">
                {favicon ? (
                  <img
                    src={favicon}
                    alt=""
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      e.currentTarget.parentElement?.querySelector('.fallback-icon')?.classList.remove('hidden');
                    }}
                  />
                ) : null}
                <Globe
                  size={9}
                  className={`fallback-icon text-neutral-400 ${favicon ? 'hidden' : ''}`}
                  strokeWidth={2}
                />
              </div>

              <span className="text-xs font-mono text-[var(--theme-text-secondary)] truncate group-hover:text-[var(--theme-text-primary)]">
                {formatUrlPath(url)}
              </span>

              {statusKind === 'success' ? (
                <div className="flex-shrink-0 pt-0.5">{statusIcon}</div>
              ) : (
                <span
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium leading-none shrink-0 ${
                    statusKind === 'paywall'
                      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                      : statusKind === 'unsafe' || statusKind === 'error'
                        ? 'bg-[var(--theme-bg-danger)]/10 text-[var(--theme-text-danger)] border border-[var(--theme-border-danger)]/20'
                        : 'bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-tertiary)]'
                  }`}
                >
                  {statusIcon}
                  <span>{statusLabel}</span>
                </span>
              )}
            </a>
          );
        })}
      </div>
    </div>
  );
};
