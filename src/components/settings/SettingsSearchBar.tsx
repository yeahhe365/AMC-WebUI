import React from 'react';
import { Search, X } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { SETTINGS_KBD_KEY_CLASS } from '@/constants/designTokens';

interface SettingsSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  inputRef?: React.Ref<HTMLInputElement>;
  /** Slightly denser control for the settings sidebar. */
  compact?: boolean;
  /** Combobox wiring for the results listbox (aria-expanded/controls/activedescendant). */
  ariaExpanded?: boolean;
  ariaControlsId?: string;
  ariaActiveDescendantId?: string | null;
}

/**
 * Global settings search input (matches every tab's catalog). Same visual
 * language as nav rows: no card surface, no shadow, rounded-lg.
 */
export const SettingsSearchBar: React.FC<SettingsSearchBarProps> = ({
  value,
  onChange,
  inputRef,
  compact = false,
  ariaExpanded,
  ariaControlsId,
  ariaActiveDescendantId,
}) => {
  const { t } = useI18n();
  const hasValue = value.length > 0;
  const sizeClass = compact ? 'h-9 text-sm' : 'h-10 text-sm';
  const iconLeftClass = compact ? 'left-2.5' : 'left-3';
  const iconSize = compact ? 16 : 18;

  return (
    <div className="group relative w-full">
      <Search
        size={iconSize}
        strokeWidth={1.5}
        className={`pointer-events-none absolute ${iconLeftClass} top-1/2 z-[1] -translate-y-1/2 text-[var(--theme-text-secondary)] transition-colors group-hover:text-[var(--theme-text-secondary)] group-focus-within:text-[var(--theme-text-primary)]`}
        aria-hidden
      />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && value) {
            event.preventDefault();
            event.stopPropagation();
            onChange('');
          }
        }}
        placeholder={t('settingsSearchPlaceholder')}
        aria-label={t('settingsSearchAria')}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={ariaExpanded}
        aria-controls={ariaExpanded ? ariaControlsId : undefined}
        aria-activedescendant={ariaExpanded && ariaActiveDescendantId ? ariaActiveDescendantId : undefined}
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
        className={[
          'settings-search-input w-full rounded-lg border border-transparent',
          'bg-[var(--theme-bg-tertiary)]/45 text-[var(--theme-text-primary)]',
          'placeholder:text-[var(--theme-text-tertiary)]',
          'hover:bg-[var(--theme-bg-tertiary)]/70',
          'focus:outline-none focus:bg-[var(--theme-bg-tertiary)]',
          'focus:ring-2 focus:ring-inset focus:ring-[var(--theme-border-focus)]/35',
          'transition-colors',
          sizeClass,
          // Right padding always reserves room for the clear button / kbd hint.
          compact ? 'pl-8 pr-8' : 'pl-9 pr-9',
        ].join(' ')}
      />
      {!hasValue && (
        <kbd
          aria-hidden
          className={`absolute right-2.5 top-1/2 -translate-y-1/2 hidden group-hover:block group-focus-within:block ${SETTINGS_KBD_KEY_CLASS}`}
        >
          /
        </kbd>
      )}
      {hasValue && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-1 text-[var(--theme-text-secondary)] transition-colors hover:bg-[var(--theme-bg-primary)]/60 hover:text-[var(--theme-text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--theme-border-focus)]"
          aria-label={t('settingsSearchClearAria')}
        >
          <X size={14} strokeWidth={2} />
        </button>
      )}
    </div>
  );
};
