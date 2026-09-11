import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { type SavedScenario, type ScenarioCategory } from '@/types';
import { Search, User, Library, Inbox } from 'lucide-react';
import { ScenarioItem } from './ScenarioItem';
import { CATEGORY_META, CATEGORY_ORDER, getCategory } from '@/features/scenarios/scenarioCategories';
import { useScenarioUiStore, type ScenarioOwnerScope } from '@/stores/scenarioUiStore';
import {
  SETTINGS_NAV_ACTIVE_CLASS,
  SETTINGS_NAV_IDLE_CLASS,
  SETTINGS_SEARCH_INPUT_CLASS,
  SETTINGS_SEGMENTED_ACTIVE_CLASS,
  SETTINGS_SEGMENTED_IDLE_CLASS,
  SETTINGS_SEGMENTED_TRACK_CLASS,
} from '@/constants/designTokens';

interface ScenarioListProps {
  scenarios: SavedScenario[];
  /** Read-only system presets (cannot be edited/deleted). */
  systemScenarioIds: string[];
  /** Everything shipped with the app, including seeded user presets. Drives the Built-in / Mine split. */
  builtInScenarioIds: string[];
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  onLoad: (scenario: SavedScenario) => void;
  onEdit: (scenario: SavedScenario) => void;
  onDelete: (id: string) => void;
  onDuplicate: (scenario: SavedScenario) => void;
  onExport: (scenario: SavedScenario) => void;
  onView?: (scenario: SavedScenario) => void;
}

type OwnerScope = ScenarioOwnerScope;

export const ScenarioList: React.FC<ScenarioListProps> = ({
  scenarios,
  systemScenarioIds,
  builtInScenarioIds,
  searchQuery,
  setSearchQuery,
  onLoad,
  onEdit,
  onDelete,
  onDuplicate,
  onExport,
  onView,
}) => {
  const { t } = useI18n();
  const ownerScope = useScenarioUiStore((state) => state.ownerScope);
  const setOwnerScope = useScenarioUiStore((state) => state.setOwnerScope);
  const activeCategory = useScenarioUiStore((state) => state.activeCategory);
  const setActiveCategory = useScenarioUiStore((state) => state.setActiveCategory);
  const setScrollPosition = useScenarioUiStore((state) => state.setScrollPosition);

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const savedScrollTop = useScenarioUiStore.getState().scrollPositions[ownerScope] ?? 0;
    const rafId = requestAnimationFrame(() => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = savedScrollTop;
      }
    });

    return () => cancelAnimationFrame(rafId);
  }, [ownerScope]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollPosition(ownerScope, e.currentTarget.scrollTop);
  };

  const handleOwnerScopeChange = (scope: ScenarioOwnerScope) => {
    if (scope === ownerScope) return;
    setOwnerScope(scope);
  };

  const handleCategorySelect = (category: ScenarioCategory | 'all') => {
    setActiveCategory(category);
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
    setScrollPosition(ownerScope, 0);
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
    setScrollPosition(ownerScope, 0);
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
    setScrollPosition(ownerScope, 0);
  };

  const builtInSet = useMemo(() => new Set(builtInScenarioIds), [builtInScenarioIds]);
  const isBuiltinScope = ownerScope === 'builtin';

  const scopedScenarios = useMemo(
    () => scenarios.filter((scenario) => builtInSet.has(scenario.id) === isBuiltinScope),
    [scenarios, builtInSet, isBuiltinScope],
  );

  const availableCategories = useMemo(() => {
    const present = new Set<ScenarioCategory>();
    scopedScenarios.forEach((scenario) => {
      present.add(getCategory(scenario.category));
    });
    return CATEGORY_ORDER.filter((category) => present.has(category));
  }, [scopedScenarios]);

  const effectiveCategory =
    activeCategory === 'all' || availableCategories.includes(activeCategory) ? activeCategory : 'all';

  const filteredScenarios = useMemo(() => {
    let list = scopedScenarios;

    if (effectiveCategory !== 'all') {
      list = list.filter((scenario) => getCategory(scenario.category) === effectiveCategory);
    }

    if (searchQuery.trim()) {
      const lowerQuery = searchQuery.toLowerCase();
      list = list.filter(
        (scenario) =>
          scenario.title.toLowerCase().includes(lowerQuery) ||
          (scenario.description && scenario.description.toLowerCase().includes(lowerQuery)) ||
          scenario.messages.some((message) => message.content.toLowerCase().includes(lowerQuery)) ||
          (scenario.systemInstruction && scenario.systemInstruction.toLowerCase().includes(lowerQuery)),
      );
    }

    return list;
  }, [scopedScenarios, searchQuery, effectiveCategory]);

  const ownerTabs: { id: OwnerScope; labelKey: string; icon: React.ElementType }[] = [
    { id: 'mine', labelKey: 'scenariosTabMine', icon: User },
    { id: 'builtin', labelKey: 'scenariosTabBuiltin', icon: Library },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="relative group flex-shrink-0">
        <Search
          size={16}
          strokeWidth={1.5}
          className="pointer-events-none absolute left-3 top-1/2 z-[1] -translate-y-1/2 text-[var(--theme-text-tertiary)] transition-colors group-hover:text-[var(--theme-text-secondary)] group-focus-within:text-[var(--theme-text-primary)]"
          aria-hidden
        />
        <input
          type="search"
          placeholder={t('scenariosSearchPlaceholder')}
          aria-label={t('scenariosSearchPlaceholder')}
          value={searchQuery}
          onChange={(event) => handleSearchChange(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          className={SETTINGS_SEARCH_INPUT_CLASS}
        />
      </div>

      <div className="flex flex-shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
        <div className={`${SETTINGS_SEGMENTED_TRACK_CLASS} w-full sm:w-auto`}>
          {ownerTabs.map((tab) => {
            const isActive = ownerScope === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleOwnerScopeChange(tab.id)}
                className={`flex flex-1 items-center justify-center gap-1.5 sm:flex-none ${
                  isActive ? SETTINGS_SEGMENTED_ACTIVE_CLASS : SETTINGS_SEGMENTED_IDLE_CLASS
                }`}
              >
                <Icon size={14} strokeWidth={isActive ? 2 : 1.5} />
                <span>{t(tab.labelKey)}</span>
              </button>
            );
          })}
        </div>

        {availableCategories.length > 0 && (
          <div
            className="flex items-center gap-1 overflow-x-auto no-scrollbar"
            role="group"
            aria-label={t('scenariosCategoryAria')}
          >
            <CategoryChip
              active={effectiveCategory === 'all'}
              onClick={() => handleCategorySelect('all')}
              label={t('scenariosFilterAll')}
            />
            {availableCategories.map((category) => (
              <CategoryChip
                key={category}
                active={effectiveCategory === category}
                onClick={() => handleCategorySelect(category)}
                label={t(CATEGORY_META[category].labelKey)}
              />
            ))}
          </div>
        )}
      </div>

      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="min-h-0 flex-grow overflow-y-auto custom-scrollbar"
      >
        {filteredScenarios.length === 0 ? (
          <div className="flex h-56 flex-col items-center justify-center text-[var(--theme-text-tertiary)]">
            <Inbox size={28} className="mb-3 opacity-40" strokeWidth={1.5} />
            <p className="text-sm text-[var(--theme-text-secondary)]">{t('scenariosEmptySearch')}</p>
            {searchQuery && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="mt-2 text-sm text-[var(--theme-text-link)] hover:underline"
              >
                {t('scenariosClearSearch')}
              </button>
            )}
          </div>
        ) : (
          <ul className="flex flex-col">
            {filteredScenarios.map((scenario) => {
              const isSystem = systemScenarioIds.includes(scenario.id);
              return (
                <ScenarioItem
                  key={scenario.id}
                  scenario={scenario}
                  isSystem={isSystem}
                  onLoad={onLoad}
                  onEdit={isSystem ? undefined : onEdit}
                  onDelete={isSystem ? undefined : onDelete}
                  onDuplicate={onDuplicate}
                  onExport={onExport}
                  onView={isSystem ? onView : undefined}
                />
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

const CategoryChip: React.FC<{
  active: boolean;
  onClick: () => void;
  label: string;
}> = ({ active, onClick, label }) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex-shrink-0 rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-border-focus)] ${
      active ? SETTINGS_NAV_ACTIVE_CLASS : SETTINGS_NAV_IDLE_CLASS
    }`}
  >
    {label}
  </button>
);
