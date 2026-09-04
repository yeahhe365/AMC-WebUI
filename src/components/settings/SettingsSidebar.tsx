import React from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { KeyRound, LayoutPanelLeft, Bot, SlidersHorizontal, X } from 'lucide-react';
import { type SettingsTab, type SettingsTabDescriptor, useSettingsUiStore } from '@/stores/settingsUiStore';
import { IconAbout, IconData, IconKeyboard, IconMcp } from '@/components/icons';
import { Toggle } from '@/components/shared/Toggle';
import { SETTINGS_KBD_KEY_CLASS, SETTINGS_NAV_ACTIVE_CLASS, SETTINGS_NAV_IDLE_CLASS } from '@/constants/designTokens';
import { SettingsSearchBar } from './SettingsSearchBar';
import { interpolate } from '@/i18n/interpolate';

const SETTINGS_TAB_ICONS: Record<SettingsTab, React.ElementType> = {
  models: Bot,
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

const SIDEBAR_GROUPS: Array<{ id: string; tabIds: SettingsTab[] }> = [
  {
    id: 'primary',
    tabIds: ['models', 'api', 'mcp', 'interface', 'data'],
  },
  {
    id: 'shortcuts',
    tabIds: ['shortcuts'],
  },
  {
    id: 'about',
    tabIds: ['about'],
  },
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
  const isAdvancedModeEnabled = useSettingsUiStore((state) => state.isAdvancedModeEnabled);
  const toggleAdvancedMode = useSettingsUiStore((state) => state.toggleAdvancedMode);
  const tabsById = new Map(tabs.map((tab) => [tab.id, tab]));
  const groupedTabs = SIDEBAR_GROUPS.map((group) => ({
    id: group.id,
    tabs: group.tabIds.map((tabId) => tabsById.get(tabId)).filter((tab): tab is SettingsTabDescriptor => !!tab),
  })).filter((group) => group.tabs.length > 0);
  const isSearching = searchQuery.trim().length > 0;

  const renderTabButton = (tab: SettingsTabDescriptor) => {
    const Icon = SETTINGS_TAB_ICONS[tab.id];
    const isActive = !isSearching && activeTab === tab.id;

    return (
      <button
        key={tab.id}
        ref={isActive ? activeTabRef : undefined}
        onClick={() => setActiveTab(tab.id)}
        className={`flex-shrink-0 flex items-center gap-3 px-3 py-2.5 md:px-4 md:py-3 text-sm rounded-lg transition-colors outline-none select-none w-auto md:w-full text-left focus-visible:ring-2 focus-visible:ring-[var(--theme-border-focus)] ${
          isActive ? SETTINGS_NAV_ACTIVE_CLASS : SETTINGS_NAV_IDLE_CLASS
        }`}
        role="tab"
        aria-selected={isActive}
      >
        <Icon size={18} strokeWidth={isActive ? 2.2 : 2} className="text-[var(--theme-text-primary)]" />
        <span>{t(tab.labelKey)}</span>
      </button>
    );
  };

  return (
    <aside className="flex-shrink-0 w-full md:w-64 bg-[var(--theme-bg-secondary)] border-b md:border-b-0 md:border-r border-[var(--theme-border-primary)] flex flex-col">
      {/* Mobile-only close row; desktop close lives in the content pane. */}
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0 md:hidden">
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-md hover:bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--theme-border-focus)]"
          aria-label={t('close')}
        >
          <X size={20} strokeWidth={2} />
        </button>
        <div className="w-8" aria-hidden="true" />
      </div>

      {/* Search container aligned with main header baseline */}
      <div className="flex-shrink-0 px-4 pt-0 pb-1.5 md:h-16 md:px-3 md:py-0 md:flex md:items-center">
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
          className="flex flex-1 gap-1 overflow-x-auto px-4 pb-2 pt-1 md:flex-col md:gap-1.5 md:overflow-x-hidden md:overflow-y-auto md:px-3 md:pb-3 md:pt-1 custom-scrollbar"
          role="tablist"
        >
          {groupedTabs.map((group) => (
            <div
              key={group.id}
              data-settings-group={group.id}
              className="flex flex-shrink-0 md:w-full md:flex-col gap-1 md:gap-1.5"
            >
              {group.tabs.map(renderTabButton)}
            </div>
          ))}
        </nav>
      )}

      <div className={`flex-shrink-0 px-4 py-2 md:p-3 ${isSearching ? 'hidden md:block' : ''}`}>
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
