import { useI18n } from '@/contexts/I18nContext';
import React, {
  useId,
  useMemo,
  useRef,
  useState,
  useCallback,
  useEffect,
  useLayoutEffect,
  type RefObject,
} from 'react';
import { type ModelOption, type ChatProviderId } from '@/types';
import { useClickOutside } from '@/hooks/ui/useClickOutside';
import { useListboxNavigation } from '@/hooks/ui/useListboxNavigation';
import {
  buildModelCatalog,
  buildModelCatalogSections,
  filterModelCatalog,
  type ModelCatalogEntry,
} from '@/utils/model/modelCatalog';
import { getModelIcon } from './ModelIcon';
import { ModelCatalogList } from './ModelCatalogList';
import { ModelDetailCard } from './ModelDetailCard';

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
  dropdownMaxHeight?: number;
}

export const ModelPicker: React.FC<ModelPickerProps> = ({
  models,
  selectedId,
  onSelect,
  renderTrigger,
  dropdownClassName,
  dropdownMaxHeight = 300,
}) => {
  const { t } = useI18n();
  const listboxId = useId();

  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState({
    offset: 0,
    width: 320,
    above: false,
    height: dropdownMaxHeight,
    detailHeight: dropdownMaxHeight,
  });
  // Bottom-edge fade while the list still has content below the fold — gone
  // once the user scrolls to the end, so the last row is never obscured.
  const [showBottomFade, setShowBottomFade] = useState(false);
  const [hoveredEntry, setHoveredEntry] = useState<ModelCatalogEntry | null>(null);
  const [detailSide, setDetailSide] = useState<'right' | 'left' | null>(null);

  const updateBottomFade = useCallback(() => {
    const listElement = listRef.current;
    if (!listElement) return;
    setShowBottomFade(listElement.scrollTop + listElement.clientHeight < listElement.scrollHeight - 4);
  }, []);

  const effectiveModels = useMemo(
    () => models.filter((model) => model.visibleInSelector !== false || model.id === selectedId),
    [models, selectedId],
  );
  const catalog = useMemo(() => buildModelCatalog(effectiveModels), [effectiveModels]);
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
    if (!isOpen) {
      setHoveredEntry(null);
      return;
    }
    updateBottomFade();
  }, [isOpen, sections, updateBottomFade]);

  useLayoutEffect(() => {
    if (!isOpen) return;

    const positionDropdown = () => {
      const anchor = containerRef.current;
      const dropdown = dropdownRef.current;
      if (!anchor || !dropdown) return;

      const padding = 8;
      const anchorRect = anchor.getBoundingClientRect();
      const anchorLeft = anchorRect.left;
      const width = dropdown.offsetWidth;
      const left = Math.max(padding, Math.min(anchorLeft, window.innerWidth - padding - width));
      const offset = left - anchorLeft;
      let visibleTop = padding;
      let visibleBottom = window.innerHeight - padding;
      for (let parent = anchor.parentElement; parent; parent = parent.parentElement) {
        if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(parent).overflowY)) {
          const bounds = parent.getBoundingClientRect();
          visibleTop = Math.max(visibleTop, bounds.top);
          visibleBottom = Math.min(visibleBottom, bounds.bottom);
        }
      }
      const below = Math.max(0, visibleBottom - anchorRect.bottom - 4);
      const aboveSpace = Math.max(0, anchorRect.top - visibleTop - 4);
      const above = below < Math.min(dropdownMaxHeight, 240) && aboveSpace > below;
      const height = Math.min(dropdownMaxHeight, above ? aboveSpace : below);
      setDropdownPosition((current) =>
        current.offset === offset &&
        current.width === width &&
        current.above === above &&
        current.height === height &&
        current.detailHeight === below
          ? current
          : { offset, width, above, height, detailHeight: below },
      );
      const detailWidth = 320;
      setDetailSide(
        window.innerWidth - (left + width) >= detailWidth + 16 ? 'right' : left >= detailWidth + 16 ? 'left' : null,
      );
    };

    positionDropdown();
    window.addEventListener('resize', positionDropdown);
    window.addEventListener('scroll', positionDropdown, true);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(positionDropdown);
    if (containerRef.current) observer?.observe(containerRef.current);
    if (dropdownRef.current) observer?.observe(dropdownRef.current);
    return () => {
      window.removeEventListener('resize', positionDropdown);
      window.removeEventListener('scroll', positionDropdown, true);
      observer?.disconnect();
    };
  }, [isOpen, dropdownMaxHeight]);

  const handleSelectModel = (entry: ModelCatalogEntry) => {
    if (entry.model.unavailable) {
      return;
    }
    onSelect(entry.id, entry.model.providerId);
    navigation.close();
  };

  useClickOutside(containerRef, () => navigation.close(), isOpen);

  const activeEntry = activeIndex >= 0 ? visibleEntries[activeIndex] : undefined;
  const detailModel = hoveredEntry?.model || activeEntry?.model || selectedModel;
  // This picker receives only an id, so a shared id across providers cannot identify one selected connection.
  const isDetailSelected =
    detailModel?.id === selectedId && effectiveModels.filter((model) => model.id === selectedId).length === 1;
  // Same model id may exist on several providers — scope option ids by provider
  // so DOM ids, aria-activedescendant, and React keys stay unique.
  const activeOptionKey = activeEntry ? `${activeEntry.model.providerId ?? 'gemini'}:${activeEntry.id}` : undefined;
  const activeDescendantId = activeOptionKey ? `model-picker-option-${activeOptionKey}` : undefined;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented) return;

    if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
      setHoveredEntry(null);
    }
    navigation.handleKeyDown(event);
  };

  return (
    <div className="relative min-w-0 max-w-full" ref={containerRef} onKeyDown={handleKeyDown}>
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
          ref={dropdownRef}
          style={{
            left: dropdownPosition.offset,
            maxWidth: 'calc(100vw - 16px)',
            maxHeight: dropdownPosition.height,
            top: dropdownPosition.above ? 'auto' : '100%',
            bottom: dropdownPosition.above ? '100%' : 'auto',
            marginTop: dropdownPosition.above ? 0 : 4,
            marginBottom: dropdownPosition.above ? 4 : 0,
          }}
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
                    onHoverEntry={(entry) => {
                      // Keep the preview while the pointer crosses to its card for reading or scrolling.
                      if (entry) setHoveredEntry(entry);
                    }}
                  />
                )}
              </div>
            </>
          )}
        </div>
      )}

      {isOpen &&
        detailSide &&
        !dropdownPosition.above &&
        dropdownPosition.height >= dropdownMaxHeight &&
        detailModel && (
          <div
            data-testid="model-picker-detail-hovercard"
            style={{
              ...(detailSide === 'right'
                ? { left: dropdownPosition.offset + dropdownPosition.width + 8 }
                : { right: `calc(100% - ${dropdownPosition.offset}px + 8px)` }),
              maxHeight: dropdownPosition.detailHeight,
            }}
            className={`hidden sm:block absolute top-full mt-1 z-50 transition-all duration-150 animate-in fade-in zoom-in-95 pointer-events-none ${
              detailSide === 'left' ? 'right-[calc(100%+8px)]' : 'left-[328px]'
            }`}
          >
            <ModelDetailCard
              model={detailModel}
              selectionStatus={isDetailSelected ? 'selected' : 'preview'}
              className="max-h-[inherit] overflow-y-auto custom-scrollbar"
              renderModelIcon={getModelIcon}
            />
          </div>
        )}
    </div>
  );
};
