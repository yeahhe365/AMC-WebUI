import { useI18n } from '@/contexts/I18nContext';
import React, { useId, useMemo, useRef, useState, useCallback, useEffect, type RefObject } from 'react';
import { type ModelOption, type ChatProviderId } from '@/types';
import { useClickOutside } from '@/hooks/useClickOutside';
import { useListboxNavigation } from '@/hooks/ui/useListboxNavigation';
import {
  buildModelCatalog,
  buildModelCatalogSections,
  filterModelCatalog,
  type ModelCatalogEntry,
} from '@/utils/model/modelCatalog';
import { getModelIcon } from './ModelIcon';
import { ModelCatalogList } from './ModelCatalogList';

interface ModelPickerProps {
  models: ModelOption[];
  selectedId: string;
  onSelect: (modelId: string, providerId?: ChatProviderId) => void;

  renderTrigger: (props: {
    isOpen: boolean;
    setIsOpen: (v: boolean) => void;
    selectedModel: ModelOption | undefined;
    ref: RefObject<HTMLDivElement>;
    listboxId: string;
    activeDescendantId: string | undefined;
  }) => React.ReactNode;

  dropdownClassName?: string;
}

export const ModelPicker: React.FC<ModelPickerProps> = ({
  models,
  selectedId,
  onSelect,
  renderTrigger,
  dropdownClassName,
}) => {
  const { t } = useI18n();
  const listboxId = useId();

  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // Bottom-edge fade while the list still has content below the fold — gone
  // once the user scrolls to the end, so the last row is never obscured.
  const [showBottomFade, setShowBottomFade] = useState(false);
  const updateBottomFade = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    setShowBottomFade(el.scrollTop + el.clientHeight < el.scrollHeight - 4);
  }, []);

  const catalog = useMemo(() => buildModelCatalog(models), [models]);
  const filteredEntries = useMemo(() => filterModelCatalog(catalog, ''), [catalog]);

  const sections = useMemo(() => buildModelCatalogSections(filteredEntries), [filteredEntries]);
  const visibleEntries = useMemo(() => sections.flatMap((section) => section.entries), [sections]);
  const selectedModel = models.find((model) => model.id === selectedId);
  const selectedIndex = visibleEntries.findIndex((entry) => entry.id === selectedId);
  const getInitialActiveIndex = () => (selectedIndex >= 0 ? selectedIndex : visibleEntries.length > 0 ? 0 : -1);

  const selectableIndexes = visibleEntries
    .map((entry, index) => (entry.model.unavailable ? -1 : index))
    .filter((index) => index >= 0);

  const navigation = useListboxNavigation({
    getInitialActiveIndex,
    getRelativeActiveIndex: (currentIndex, directionStep) => {
      if (selectableIndexes.length === 0) {
        return -1;
      }

      const positionInSelectable = selectableIndexes.indexOf(currentIndex);
      const nextPosition =
        positionInSelectable === -1
          ? directionStep === 1
            ? 0
            : selectableIndexes.length - 1
          : (positionInSelectable + directionStep + selectableIndexes.length) % selectableIndexes.length;
      return selectableIndexes[nextPosition];
    },
    getFirstActiveIndex: () => (visibleEntries.length > 0 ? 0 : -1),
    getLastActiveIndex: () => visibleEntries.length - 1,
    onSelectActiveIndex: (index) => {
      const entry = visibleEntries[index];
      if (entry) {
        handleSelectModel(entry);
      }
    },
  });

  const { isOpen, activeIndex } = navigation;

  useEffect(() => {
    if (!isOpen) return;
    updateBottomFade();
  }, [isOpen, sections, updateBottomFade]);

  const handleSelectModel = (entry: ModelCatalogEntry) => {
    if (entry.model.unavailable) {
      return;
    }
    onSelect(entry.id, entry.model.providerId);
    navigation.close();
  };

  useClickOutside(containerRef, () => navigation.close(), isOpen);

  const activeEntry = activeIndex >= 0 ? visibleEntries[activeIndex] : undefined;
  // Same model id may exist on several providers — scope option ids by provider
  // so DOM ids, aria-activedescendant, and React keys stay unique.
  const activeOptionKey = activeEntry ? `${activeEntry.model.providerId ?? 'gemini'}:${activeEntry.id}` : undefined;
  const activeDescendantId = activeOptionKey ? `model-picker-option-${activeOptionKey}` : undefined;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented) return;

    navigation.handleKeyDown(event);
  };

  return (
    <div className="relative" ref={containerRef} onKeyDown={handleKeyDown}>
      {renderTrigger({
        isOpen,
        setIsOpen: (nextIsOpen) => (nextIsOpen ? navigation.open() : navigation.close()),
        selectedModel,
        ref: containerRef,
        listboxId,
        activeDescendantId,
      })}

      {isOpen && (
        <div
          className={`absolute top-full left-0 mt-1 bg-[var(--theme-bg-secondary)] border border-[var(--theme-border-primary)] rounded-xl shadow-premium z-50 flex flex-col modal-enter-animation overflow-hidden ${dropdownClassName || 'w-full min-w-[280px] max-h-[300px]'}`}
        >
          {!models.length ? (
            <div className="p-4 text-center">
              <p className="text-xs text-[var(--theme-text-tertiary)] mt-2">{t('appNoModelsAvailable')}</p>
            </div>
          ) : (
            <>
              <div
                id={listboxId}
                ref={listRef}
                onScroll={updateBottomFade}
                className={`overflow-y-auto custom-scrollbar p-1.5 flex-grow space-y-2 ${showBottomFade ? 'fade-mask-y-b' : ''}`}
                role="listbox"
                aria-activedescendant={activeDescendantId}
              >
                {sections.length === 0 ? (
                  <div className="px-3 py-5 text-center text-xs text-[var(--theme-text-tertiary)]">
                    {t('modelPickerNoResults')}
                  </div>
                ) : (
                  <ModelCatalogList
                    sections={sections}
                    variant="picker"
                    renderModelIcon={getModelIcon}
                    isEntrySelected={(entry) => entry.id === selectedId}
                    activeEntryId={activeEntry?.id}
                    onSelectEntry={handleSelectModel}
                  />
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
