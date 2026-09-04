import React, { useEffect, useMemo, useRef } from 'react';
import { ChevronRight } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { SETTINGS_SECTION_CARD_CLASS } from '@/constants/designTokens';
import { SETTINGS_TAB_LABEL_KEYS } from '@/constants/settingsTabs';
import { SETTINGS_SEARCH_RESULTS_ID, settingsSearchOptionId } from '@/constants/settingsSearchCatalog';
import { groupSettingsSearchResults, type SettingsSearchResult } from '@/utils/settingsSearch';
import { HighlightedText } from './HighlightedText';

interface SettingsSearchResultsProps {
  results: SettingsSearchResult[];
  onSelect: (result: SettingsSearchResult) => void;
  selectedIndex?: number;
  /** Raw query used to highlight the matching terms in label / description. */
  query: string;
}

export const SettingsSearchResults: React.FC<SettingsSearchResultsProps> = ({
  results,
  onSelect,
  selectedIndex = 0,
  query,
}) => {
  const { t } = useI18n();
  const rootRef = useRef<HTMLDivElement>(null);
  const groups = useMemo(() => groupSettingsSearchResults(results), [results]);
  const isGrouped = groups.length > 0;

  // Keep the keyboard-selected item in view as the selection moves, including
  // across group boundaries. Offset per item is computed from the flat index.
  useEffect(() => {
    const selected = rootRef.current?.querySelector('[data-selected="true"]');
    if (selected instanceof HTMLElement) {
      selected.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex, results]);

  if (results.length === 0) {
    return (
      <div className={`${SETTINGS_SECTION_CARD_CLASS} text-sm text-[var(--theme-text-secondary)]`}>
        {t('settingsSearchNoResults')}
      </div>
    );
  }

  const renderItem = (result: SettingsSearchResult, index: number, showTabInBreadcrumb: boolean) => {
    const isSelected = selectedIndex === index;

    return (
      <li
        key={result.id}
        id={settingsSearchOptionId(index)}
        role="option"
        aria-selected={isSelected}
        data-selected={isSelected}
        onClick={() => onSelect(result)}
        className={`flex w-full cursor-pointer items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--theme-bg-tertiary)]/50 ${
          isSelected ? 'bg-[var(--theme-bg-tertiary)]/75 ring-2 ring-inset ring-[var(--theme-border-focus)]' : ''
        }`}
      >
        <div className="min-w-0 flex-1">
          {(showTabInBreadcrumb || result.groupLabel) && (
            <span className="mb-0.5 flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-[var(--theme-text-secondary)]">
              {showTabInBreadcrumb && <span>{result.tabLabel}</span>}
              {showTabInBreadcrumb && result.groupLabel && <ChevronRight size={10} strokeWidth={1.75} aria-hidden />}
              {result.groupLabel && <span>{result.groupLabel}</span>}
            </span>
          )}
          <span className="block text-sm font-medium text-[var(--theme-text-primary)]">
            <HighlightedText text={result.label} query={query} />
          </span>
          {result.description && (
            <span className="mt-0.5 line-clamp-2 block text-xs leading-relaxed text-[var(--theme-text-secondary)]">
              <HighlightedText text={result.description} query={query} />
            </span>
          )}
        </div>
        <ChevronRight
          size={16}
          strokeWidth={1.75}
          className="mt-0.5 flex-shrink-0 text-[var(--theme-text-secondary)]"
          aria-hidden
        />
      </li>
    );
  };

  return (
    <div className="space-y-3" ref={rootRef} id={SETTINGS_SEARCH_RESULTS_ID}>
      {isGrouped ? (
        groups.map((group, groupIndex) => {
          const offset = groups.slice(0, groupIndex).reduce((sum, g) => sum + g.results.length, 0);
          const headingId = `settings-search-group-${group.tab}`;
          return (
            <section key={group.tab} aria-labelledby={headingId}>
              <h3
                id={headingId}
                className="px-1 pb-1 text-xs font-semibold uppercase tracking-wider text-[var(--theme-text-secondary)]"
              >
                {t(SETTINGS_TAB_LABEL_KEYS[group.tab])} ({group.results.length})
              </h3>
              <ul
                role="listbox"
                aria-labelledby={headingId}
                className={`${SETTINGS_SECTION_CARD_CLASS} divide-y divide-[var(--theme-border-secondary)]/40 p-0`}
              >
                {group.results.map((result, itemIndex) => renderItem(result, offset + itemIndex, false))}
              </ul>
            </section>
          );
        })
      ) : (
        <ul
          role="listbox"
          aria-label={t('settingsSearchResultsTitle')}
          className={`${SETTINGS_SECTION_CARD_CLASS} divide-y divide-[var(--theme-border-secondary)]/40 p-0`}
        >
          {results.map((result, index) => renderItem(result, index, true))}
        </ul>
      )}
    </div>
  );
};
