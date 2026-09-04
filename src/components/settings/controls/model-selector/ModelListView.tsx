import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type ApiMode, type ModelOption } from '@/types';
import { getModelIcon } from '@/components/shared/ModelIcon';
import { useI18n } from '@/contexts/I18nContext';
import { buildModelCatalog, buildModelCatalogSections, filterModelCatalog } from '@/utils/model/modelCatalog';
import { ModelCatalogList } from '@/components/shared/ModelCatalogList';

interface ModelListViewProps {
  availableModels: ModelOption[];
  selectedModelId: string;
  selectedApiMode?: ApiMode;
  onSelectModel: (id: string, apiMode?: ApiMode) => void;
  /** Badge text for the selected model; see ModelCatalogList.activeBadgeLabel. */
  activeBadgeLabel?: string;
}

export const ModelListView: React.FC<ModelListViewProps> = ({
  availableModels,
  selectedModelId,
  selectedApiMode,
  onSelectModel,
  activeBadgeLabel,
}) => {
  const { t } = useI18n();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showBottomFade, setShowBottomFade] = useState(false);

  const updateBottomFade = useCallback(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    setShowBottomFade(el.scrollTop + el.clientHeight < el.scrollHeight - 4);
  }, []);

  useEffect(() => {
    updateBottomFade();
  }, [availableModels, updateBottomFade]);

  const sections = useMemo(() => {
    const catalog = buildModelCatalog(availableModels);
    const filteredEntries = filterModelCatalog(catalog, '');
    return buildModelCatalogSections(filteredEntries);
  }, [availableModels]);

  return (
    <div
      data-testid="settings-model-list-container"
      className="relative border border-[var(--theme-border-secondary)]/70 rounded-xl bg-[var(--theme-bg-input)]/30 overflow-hidden"
    >
      <div
        ref={scrollRef}
        onScroll={updateBottomFade}
        className="max-h-[340px] overflow-y-auto custom-scrollbar overscroll-contain p-2 space-y-2.5"
      >
        <ModelCatalogList
          sections={sections}
          variant="settings"
          renderModelIcon={getModelIcon}
          activeBadgeLabel={activeBadgeLabel}
          isEntrySelected={(entry) =>
            entry.id === selectedModelId &&
            (!selectedApiMode || !entry.model.apiMode || entry.model.apiMode === selectedApiMode)
          }
          onSelectEntry={(entry) => onSelectModel(entry.id, entry.model.apiMode)}
        />
        {availableModels.length === 0 && (
          <div className="p-4 text-center text-xs text-[var(--theme-text-secondary)] italic">
            {t('chatBehaviorModelNoModels')}
          </div>
        )}
        {availableModels.length > 0 && sections.length === 0 && (
          <div className="p-4 text-center text-xs text-[var(--theme-text-secondary)] italic">
            {t('modelPickerNoResults')}
          </div>
        )}
      </div>
      {showBottomFade && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-8 rounded-b-xl bg-gradient-to-t from-[var(--theme-bg-primary)] via-[var(--theme-bg-primary)]/60 to-transparent"
        />
      )}
    </div>
  );
};
