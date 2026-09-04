import React, { useCallback, useMemo, useState } from 'react';
import { Search, MoreHorizontal, Undo2 } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useI18n } from '@/contexts/I18nContext';
import { SHORTCUT_REGISTRY, DEFAULT_SHORTCUTS } from '@/constants/shortcuts';
import {
  SETTINGS_SECTION_CARD_CLASS,
  SETTINGS_SECTION_LABEL_CLASS,
  SETTINGS_SEARCH_INPUT_CLASS,
} from '@/constants/designTokens';
import { FOCUS_VISIBLE_RING_BASE_CLASS } from '@/constants/focusClasses';
import { type AppSettings, type ModelOption } from '@/types';
import { formatShortcut } from '@/utils/keyboardShortcuts';
import { ShortcutRecorder } from './shortcuts/ShortcutRecorder';
import { TabCycleModelsCard } from './TabCycleModelsCard';
import { Select } from '@/components/shared/Select';
import { Toggle } from '@/components/shared/Toggle';
import { usePortaledMenu } from '@/hooks/ui/usePortaledMenu';

interface ShortcutsSectionProps {
  currentSettings?: AppSettings;
  availableModels?: ModelOption[];
  onUpdateSettings?: (settings: Partial<AppSettings>) => void;
}

type CategoryFilter = 'all' | 'general' | 'input' | 'global';

export const ShortcutsSection: React.FC<ShortcutsSectionProps> = ({
  currentSettings,
  availableModels = [],
  onUpdateSettings,
}) => {
  const { t } = useI18n();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('all');
  const {
    isOpen: isMoreOpen,
    menuPosition,
    containerRef,
    buttonRef,
    menuRef,
    targetWindow,
    toggleMenu,
    closeMenu,
  } = usePortaledMenu();

  const getCategoryLabel = (cat: CategoryFilter): string => {
    if (cat === 'all') return t('shortcutsFilterAll');
    if (cat === 'general') return t('shortcutsGeneralTitle');
    if (cat === 'input') return t('shortcutsChatInputTitle');
    return t('shortcutsGlobalTitle');
  };

  const handleShortcutChange = useCallback(
    (id: string, newKey: string) => {
      if (!currentSettings || !onUpdateSettings) return;
      const updatedShortcuts = { ...currentSettings.customShortcuts };
      if (newKey === DEFAULT_SHORTCUTS[id]) {
        delete updatedShortcuts[id];
      } else {
        updatedShortcuts[id] = newKey;
      }
      onUpdateSettings({ customShortcuts: updatedShortcuts });
    },
    [currentSettings, onUpdateSettings],
  );

  const handleToggleEnabled = useCallback(
    (id: string, enabled: boolean) => {
      if (!currentSettings || !onUpdateSettings) return;
      const defaultKey = DEFAULT_SHORTCUTS[id] ?? '';
      if (enabled) {
        // Re-enable: restore default if currently empty
        const current = currentSettings.customShortcuts?.[id];
        if (!current) handleShortcutChange(id, defaultKey);
      } else {
        handleShortcutChange(id, '');
      }
    },
    [currentSettings, onUpdateSettings, handleShortcutChange],
  );

  const handleResetSingle = useCallback(
    (id: string) => {
      handleShortcutChange(id, DEFAULT_SHORTCUTS[id] ?? '');
    },
    [handleShortcutChange],
  );

  const handleResetAll = useCallback(() => {
    if (!currentSettings || !onUpdateSettings) return;
    onUpdateSettings({ customShortcuts: {} });
  }, [currentSettings, onUpdateSettings]);

  // Build filtered list — search by label or shortcut display, plus category
  const allItems = SHORTCUT_REGISTRY;
  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allItems.filter((item) => {
      if (activeCategory !== 'all' && item.category !== activeCategory) return false;
      if (!q) return true;
      const label = t(item.labelKey);
      const customKey = currentSettings?.customShortcuts?.[item.id];
      const effectiveKey = customKey !== undefined ? customKey : item.defaultKey;
      const display = effectiveKey ? formatShortcut(effectiveKey).join(' ').toLowerCase() : '';
      return label.toLowerCase().includes(q) || display.includes(q);
    });
  }, [allItems, activeCategory, searchQuery, currentSettings?.customShortcuts, t]);

  const countByCategory = useMemo(() => {
    const map: Record<string, number> = { all: allItems.length };
    for (const cat of ['general', 'input', 'global'] as const) {
      map[cat] = allItems.filter((i) => i.category === cat).length;
    }
    return map;
  }, [allItems]);

  // Keep TabCycleModelsCard visible only when its shortcut is visible
  const showTabCycleCard = filteredItems.some((i) => i.id === 'input.cycleModels');

  const handleToggleVisible = useCallback(
    (enabled: boolean) => {
      if (!currentSettings || !onUpdateSettings) return;
      const visibleIds = filteredItems.map((i) => i.id);
      const updated = { ...currentSettings.customShortcuts };
      for (const id of visibleIds) {
        updated[id] = enabled ? (DEFAULT_SHORTCUTS[id] ?? '') : '';
        if (enabled && updated[id] === DEFAULT_SHORTCUTS[id]) delete updated[id];
      }
      onUpdateSettings({ customShortcuts: updated });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filteredItems is derived from search state; intentionally omit to avoid stale closure on bulk toggle
    [currentSettings, onUpdateSettings],
  );

  if (!currentSettings || !onUpdateSettings) {
    return <div className="p-4 text-center text-[var(--theme-text-secondary)]">{t('shortcutsUnavailable')}</div>;
  }

  return (
    <div className="space-y-3">
      <div className={`${SETTINGS_SECTION_CARD_CLASS} p-3 flex items-center justify-between gap-3`}>
        <div className="flex shrink-0 items-baseline gap-2">
          <h4 className={SETTINGS_SECTION_LABEL_CLASS}>{t('shortcutsPageTitle')}</h4>
          <span className="text-xs font-normal tabular-nums text-[var(--theme-text-secondary)]">
            {filteredItems.length}/{allItems.length}
          </span>
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
          <div className="relative w-full max-w-[220px]">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--theme-text-tertiary)]"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('shortcutsSearchPlaceholder')}
              autoComplete="off"
              spellCheck={false}
              className={SETTINGS_SEARCH_INPUT_CLASS}
            />
          </div>
          <Select
            label=""
            hideLabel
            value={activeCategory}
            onChange={(event) => setActiveCategory(event.target.value as CategoryFilter)}
            size="compact"
            triggerClassName="h-10"
            wrapperClassName="relative w-40"
            dropdownClassName="max-h-[320px]"
          >
            <option value="all">{`${t('shortcutsFilterAll')} (${countByCategory.all})`}</option>
            <option value="general">{`${getCategoryLabel('general')} (${countByCategory.general})`}</option>
            <option value="input">{`${getCategoryLabel('input')} (${countByCategory.input})`}</option>
            <option value="global">{`${getCategoryLabel('global')} (${countByCategory.global})`}</option>
          </Select>
          <div className="relative" ref={containerRef}>
            <button
              ref={buttonRef}
              onClick={toggleMenu}
              className={`inline-flex h-10 w-10 items-center justify-center rounded-lg border border-transparent text-[var(--theme-text-secondary)] transition-colors hover:bg-[var(--theme-bg-tertiary)] hover:text-[var(--theme-text-primary)] ${FOCUS_VISIBLE_RING_BASE_CLASS}`}
              aria-label={t('shortcutsMoreActionsAria')}
            >
              <MoreHorizontal size={16} />
            </button>
            {isMoreOpen &&
              targetWindow &&
              createPortal(
                <div
                  ref={menuRef}
                  className="fixed min-w-40 bg-[var(--theme-bg-primary)] border border-[var(--theme-border-secondary)] rounded-xl shadow-premium py-1.5"
                  style={menuPosition}
                  role="menu"
                >
                  <button
                    onClick={() => {
                      handleToggleVisible(true);
                      closeMenu();
                    }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-primary)]"
                    role="menuitem"
                  >
                    {t('shortcutsEnableAllVisible')}
                  </button>
                  <button
                    onClick={() => {
                      handleToggleVisible(false);
                      closeMenu();
                    }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-primary)]"
                    role="menuitem"
                  >
                    {t('shortcutsDisableAllVisible')}
                  </button>
                  <div className="my-1 border-t border-[var(--theme-border-secondary)]/60" />
                  <button
                    onClick={() => {
                      handleResetAll();
                      closeMenu();
                    }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-danger)]"
                    role="menuitem"
                  >
                    {t('shortcutsResetAllDefaults')}
                  </button>
                </div>,
                targetWindow.document.body,
              )}
          </div>
        </div>
      </div>

      <div className={`${SETTINGS_SECTION_CARD_CLASS} p-0 overflow-hidden`}>
        {filteredItems.length === 0 ? (
          <div className="py-10 text-center text-sm text-[var(--theme-text-secondary)]">{t('shortcutsEmpty')}</div>
        ) : (
          <div className="divide-y divide-[var(--theme-border-secondary)]/40">
            {filteredItems.map((item, index) => {
              const customKey = currentSettings.customShortcuts?.[item.id];
              const effectiveKey = customKey !== undefined ? customKey : item.defaultKey;
              const isEnabled = effectiveKey !== '';
              const isModified = customKey !== undefined && customKey !== item.defaultKey;
              const isLast = index === filteredItems.length - 1;
              return (
                <React.Fragment key={item.id}>
                  <div
                    data-settings-item={`shortcut-${item.id}`}
                    className={`grid grid-cols-[minmax(0,1fr)_14rem_2.5rem] items-center gap-3 px-4 py-2.5 ${!isEnabled ? 'opacity-60' : ''} ${!isLast ? 'border-b border-[var(--theme-border-secondary)]/40' : ''}`}
                  >
                    <div className="min-w-0 pr-2">
                      <div className="truncate text-sm font-medium text-[var(--theme-text-primary)]">
                        {t(item.labelKey)}
                      </div>
                    </div>
                    <div className="flex min-h-9 items-center justify-end gap-2">
                      {isModified && (
                        <button
                          onClick={() => handleResetSingle(item.id)}
                          title={t('shortcutsResetDefault')}
                          aria-label={t('shortcutsResetAria')}
                          className={`p-1 rounded-md text-[var(--theme-text-secondary)] transition-colors hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] ${FOCUS_VISIBLE_RING_BASE_CLASS}`}
                        >
                          <Undo2 size={14} />
                        </button>
                      )}
                      <ShortcutRecorder
                        value={effectiveKey}
                        defaultValue={item.defaultKey}
                        onChange={(shortcut) => handleShortcutChange(item.id, shortcut)}
                      />
                    </div>
                    <div className="flex justify-end">
                      <Toggle
                        checked={isEnabled}
                        onChange={(v) => handleToggleEnabled(item.id, v)}
                        ariaLabel={t(item.labelKey)}
                      />
                    </div>
                  </div>
                  {item.id === 'input.cycleModels' && showTabCycleCard && (
                    <div
                      className="px-4 pb-3 pt-1 bg-[var(--theme-bg-tertiary)]/10"
                      data-settings-item="shortcuts-cycle-models"
                    >
                      <TabCycleModelsCard
                        availableModels={availableModels}
                        configuredIds={currentSettings.tabModelCycleIds}
                        onChange={(tabModelCycleIds) => onUpdateSettings({ tabModelCycleIds })}
                      />
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
