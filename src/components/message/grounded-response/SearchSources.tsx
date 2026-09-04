import React from 'react';
import { Globe } from 'lucide-react';
import { getDomain, getFavicon } from './groundingSources';
import { useI18n } from '@/contexts/I18nContext';
import { SETTINGS_SECTION_LABEL_CLASS } from '@/constants/designTokens';

interface SearchSourcesProps {
  sources: Array<{ uri: string; title: string }>;
}

export const SearchSources: React.FC<SearchSourcesProps> = ({ sources }) => {
  const { t } = useI18n();

  if (!sources || sources.length === 0) return null;

  return (
    <div className="mt-3 pt-2 border-t border-[var(--theme-border-secondary)]/30 animate-in fade-in slide-in-from-top-1 duration-200">
      <div className="flex items-center gap-2 mb-2">
        <Globe size={11} className="text-[var(--theme-text-tertiary)]" strokeWidth={2} />
        <h4 className={SETTINGS_SECTION_LABEL_CLASS}>{t('searchSourcesTitle')}</h4>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
        {sources.map((source, i) => {
          const favicon = getFavicon(source.uri, source.title);
          return (
            <a
              key={`source-${i}`}
              href={source.uri}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-1.5 rounded-lg bg-[var(--theme-bg-tertiary)]/20 hover:bg-[var(--theme-bg-tertiary)]/60 border border-[var(--theme-border-secondary)]/30 hover:border-[var(--theme-border-secondary)] transition-all group no-underline"
              title={source.title}
            >
              <div className="flex-shrink-0 w-4 h-4 flex items-center justify-center rounded-sm bg-white/90 overflow-hidden shadow-sm ring-1 ring-black/5">
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
                  size={10}
                  className={`fallback-icon text-neutral-400 ${favicon ? 'hidden' : ''}`}
                  strokeWidth={2}
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium text-[var(--theme-text-primary)] truncate leading-tight group-hover:text-[var(--theme-text-link)] transition-colors">
                  {source.title || t('webSourceFallback')}
                </div>
                <div className="text-xs text-[var(--theme-text-tertiary)] truncate opacity-70 leading-none mt-0.5">
                  {getDomain(source.uri)}
                </div>
              </div>
              <div className="text-xs font-mono font-medium text-[var(--theme-text-tertiary)] opacity-40 group-hover:opacity-100 transition-opacity">
                {i + 1}
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
};
