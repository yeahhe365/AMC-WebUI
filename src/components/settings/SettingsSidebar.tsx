import React from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { KeyRound, LayoutPanelLeft, SlidersHorizontal, X, Cloud, Sparkles } from 'lucide-react';
import { type SettingsTab, type SettingsTabDescriptor, useSettingsUiStore } from '@/stores/settingsUiStore';
import { IconAbout, IconData, IconKeyboard, IconMcp } from '@/components/icons';
import { Toggle } from '@/components/shared/Toggle';
import { Select } from '@/components/shared/Select';
import { useResponsiveValue } from '@/hooks/ui/useDevice';
import { SETTINGS_KBD_KEY_CLASS, SETTINGS_NAV_ACTIVE_CLASS, SETTINGS_NAV_IDLE_CLASS } from '@/constants/designTokens';
import { SettingsSearchBar } from './SettingsSearchBar';
import { interpolate } from '@/i18n/interpolate';

const SETTINGS_TAB_ICONS: Record<SettingsTab, React.ElementType> = {
  gemini: Sparkles,
  providers: Cloud,
  models: SlidersHorizontal,
  interface: LayoutPanelLeft,
  api: KeyRound,
  mcp: IconMcp,
  data: IconData,
  shortcuts: IconKeyboard,
  about: IconAbout,
};

interface SettingsSidebarProps {
  tabs: SettingsTabDescriptor[];
  activeTab: SettingsTab;
  setActiveTab: (tab: SettingsTab) => void;
  onClose: () => void;
  activeTabRef?: React.Ref<HTMLButtonElement>;
  searchInputRef?: React.Ref<HTMLInputElement>;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  /** Live match count for the search status shown while searching. */
  resultsCount?: number;
  /** Combobox wiring passed through to the search input. */
  searchExpanded?: boolean;
  searchResultsId?: string;
  searchActiveOptionId?: string | null;
}

const SIDEBAR_TAB_ORDER: SettingsTab[] = [
  'gemini',
  'providers',
  'models',
  'mcp',
  'interface',
  'data',
  'shortcuts',
  'about',
];

export const SettingsSidebar: React.FC<SettingsSidebarProps> = ({
  tabs,
  activeTab,
  setActiveTab,
  onClose,
  activeTabRef,
  searchInputRef,
  searchQuery,
  onSearchChange,
  resultsCount = 0,
  searchExpanded,
  searchResultsId,
  searchActiveOptionId,
}) => {
  const { t } = useI18n();
  const isCompact = useResponsiveValue(true, false, 767);
  const isAdvancedModeEnabled = useSettingsUiStore((state) => state.isAdvancedModeEnabled);
  const toggleAdvancedMode = useSettingsUiStore((state) => state.toggleAdvancedMode);
  const tabsById = React.useMemo(() => new Map(tabs.map((tab) => [tab.id, tab])), [tabs]);
  const visibleTabs = React.useMemo(() => {
    const ordered = SIDEBAR_TAB_ORDER.map((tabId) => tabsById.get(tabId)).filter(
      (tab): tab is SettingsTabDescriptor => !!tab,
    );
    const remaining = tabs.filter((tab) => !SIDEBAR_TAB_ORDER.includes(tab.id) && tab.id !== 'api');
    return [...ordered, ...remaining];
  }, [tabs, tabsById]);
  const isSearching = searchQuery.trim().length > 0;

  const renderTabButton = (tab: SettingsTabDescriptor) => {
    const Icon = SETTINGS_TAB_ICONS[tab.id];
    const isActive = !isSearching && (activeTab === tab.id || (activeTab === 'api' && tab.id === 'gemini'));

    return (
      <button
        key={tab.id}
        ref={isActive && !isCompact ? activeTabRef : undefined}
        onClick={() => setActiveTab(tab.id)}
        className={`flex-shrink-0 flex items-center gap-3 px-3 py-2.5 md:px-3 md:py-2 text-sm rounded-xl transition-colors outline-none select-none w-auto md:w-full text-left focus-visible:ring-2 focus-visible:ring-[var(--theme-border-focus)] ${
          isActive ? SETTINGS_NAV_ACTIVE_CLASS : SETTINGS_NAV_IDLE_CLASS
        }`}
        role="tab"
        aria-selected={isActive}
      >
        <Icon size={17} strokeWidth={isActive ? 2.2 : 2} className="text-[var(--theme-text-primary)] shrink-0" />
        <span className="truncate">{t(tab.labelKey)}</span>
      </button>
    );
  };

  return (
    <aside className="flex-shrink-0 w-full md:w-64 bg-[var(--theme-bg-secondary)] border-b md:border-b-0 md:border-r border-[var(--theme-border-primary)] flex flex-col">
      <div className="flex items-center gap-2 px-3 pt-3 pb-2 flex-shrink-0 md:hidden">
        <Select
          label={t('settingsTitle')}
          hideLabel
          size="compact"
          className="flex-1 min-w-0"
          wrapperClassName="min-w-0"
          value={activeTab === 'api' ? 'gemini' : activeTab}
          onChange={(event) => setActiveTab(event.target.value as SettingsTab)}
          triggerRef={isCompact ? activeTabRef : undefined}
        >
          {visibleTabs.map((tab) => (
            <option key={tab.id} value={tab.id}>
              {t(tab.labelKey)}
            </option>
          ))}
        </Select>
        <button
          type="button"
          onClick={toggleAdvancedMode}
          aria-label={t('settingsAdvancedMode')}
          title={t('settingsAdvancedMode')}
          aria-pressed={isAdvancedModeEnabled}
          className={`h-9 w-9 shrink-0 flex items-center justify-center rounded-lg focus-visible:ring-2 focus-visible:ring-[var(--theme-border-focus)] ${isAdvancedModeEnabled ? SETTINGS_NAV_ACTIVE_CLASS : SETTINGS_NAV_IDLE_CLASS}`}
        >
          <SlidersHorizontal size={18} />
        </button>
        <button
          type="button"
          onClick={onClose}
          className="h-9 w-9 shrink-0 flex items-center justify-center rounded-lg hover:bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--theme-border-focus)]"
          aria-label={t('close')}
        >
          <X size={20} strokeWidth={2} />
        </button>
      </div>

      {/* Search container aligned with main header baseline */}
      <div className="flex-shrink-0 px-3 pb-3 md:h-16 md:py-0 md:flex md:items-center">
        <SettingsSearchBar
          value={searchQuery}
          onChange={onSearchChange}
          inputRef={searchInputRef}
          compact
          ariaExpanded={searchExpanded}
          ariaControlsId={searchResultsId}
          ariaActiveDescendantId={searchActiveOptionId}
        />
      </div>

      {/* Search collapses the tab list into a desktop-only match-count status. */}
      {isSearching ? (
        <div
          data-settings-search-status
          role="status"
          className="hidden md:flex flex-1 flex-col gap-1.5 px-4 py-3 text-xs text-[var(--theme-text-secondary)] md:py-2"
        >
          <span className="font-medium text-[var(--theme-text-secondary)]">
            {interpolate(t('settingsSearchResultsCount'), { count: resultsCount })}
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className={SETTINGS_KBD_KEY_CLASS}>Esc</kbd>
            <span>{t('settingsSearchEscHint')}</span>
          </span>
        </div>
      ) : (
        <nav
          className="hidden md:flex flex-1 flex-col gap-1 overflow-x-hidden overflow-y-auto px-3 pb-3 pt-1 custom-scrollbar"
          role="tablist"
        >
          {visibleTabs.map(renderTabButton)}
        </nav>
      )}

      <div className="hidden md:block flex-shrink-0 p-3">
        <div
          className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 ${
            isAdvancedModeEnabled ? 'bg-[var(--theme-bg-accent)]/15' : ''
          }`}
        >
          <button
            type="button"
            onClick={toggleAdvancedMode}
            className={`flex items-center gap-2 rounded-md px-1 py-0.5 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--theme-border-focus)] ${
              isAdvancedModeEnabled
                ? 'text-[var(--theme-text-primary)]'
                : 'text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]'
            }`}
            aria-pressed={isAdvancedModeEnabled}
          >
            <SlidersHorizontal size={14} />
            <span>{t('settingsAdvancedMode')}</span>
          </button>
          <Toggle checked={isAdvancedModeEnabled} onChange={toggleAdvancedMode} ariaLabel={t('settingsAdvancedMode')} />
        </div>
      </div>
    </aside>
  );
};
