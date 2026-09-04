import React, { useCallback, useMemo, useState } from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { ChevronDown, Keyboard } from 'lucide-react';
import { type ModelOption } from '@/types';
import { getQuickSwitchModelIds, getTabCycleModelIds } from '@/utils/model/modelCatalog';
import { interpolate } from '@/i18n/interpolate';

interface TabCycleModelsCardProps {
  availableModels: ModelOption[];
  configuredIds?: string[];
  onChange: (modelIds: string[] | undefined) => void;
}

export const TabCycleModelsCard: React.FC<TabCycleModelsCardProps> = ({ availableModels, configuredIds, onChange }) => {
  const { t } = useI18n();
  const [isExpanded, setIsExpanded] = useState(false);

  const orderedCycleModels = useMemo(() => {
    const cycleIds = getQuickSwitchModelIds(availableModels);
    const modelMap = new Map(availableModels.map((model) => [model.id, model]));
    return cycleIds.map((id) => modelMap.get(id)).filter((model): model is ModelOption => !!model);
  }, [availableModels]);

  const effectiveTabCycleIds = useMemo(
    () => getTabCycleModelIds(availableModels, configuredIds),
    [availableModels, configuredIds],
  );

  const cycleSummary = useMemo(
    () => interpolate(t('shortcutsCycleModelsScopeSummary'), { count: String(effectiveTabCycleIds.length) }),
    [effectiveTabCycleIds.length, t],
  );

  const handleToggleModel = useCallback(
    (modelId: string) => {
      const isSelected = effectiveTabCycleIds.includes(modelId);
      if (isSelected && effectiveTabCycleIds.length === 1) {
        return;
      }

      const nextIds = isSelected
        ? effectiveTabCycleIds.filter((id) => id !== modelId)
        : orderedCycleModels
            .map((model) => model.id)
            .filter((id) => effectiveTabCycleIds.includes(id) || id === modelId);

      onChange(nextIds.length === orderedCycleModels.length ? undefined : nextIds);
    },
    [effectiveTabCycleIds, onChange, orderedCycleModels],
  );

  return (
    <div className="rounded-lg border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-input)]/30 p-4">
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        aria-expanded={isExpanded}
        aria-label={t('shortcutsCycleModelsScopeToggleAria')}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span className="flex min-w-0 items-start gap-3">
          <Keyboard size={20} className="mt-0.5 flex-shrink-0 text-[var(--theme-text-link)]" strokeWidth={1.75} />
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-[var(--theme-text-primary)]">
              {t('shortcutsCycleModelsScopeTitle')}
            </span>
            <span className="mt-1 block text-xs leading-relaxed text-[var(--theme-text-secondary)]">
              {t('shortcutsCycleModelsScopeHint')}
            </span>
            <span className="mt-1 block text-xs text-[var(--theme-text-secondary)]">{cycleSummary}</span>
          </span>
        </span>
        <ChevronDown
          size={16}
          className={`flex-shrink-0 text-[var(--theme-text-secondary)] transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
          strokeWidth={1.75}
        />
      </button>

      {isExpanded && (
        <div className="mt-4 border-t border-[var(--theme-border-secondary)]/60 pt-4">
          {orderedCycleModels.length === 0 ? (
            <div className="text-xs italic text-[var(--theme-text-secondary)]">
              {t('shortcutsCycleModelsScopeEmpty')}
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {orderedCycleModels.map((model) => {
                const isSelected = effectiveTabCycleIds.includes(model.id);
                const isLocked = isSelected && effectiveTabCycleIds.length === 1;

                return (
                  <label
                    key={model.id}
                    className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
                      isSelected
                        ? 'border-[var(--theme-border-focus)] bg-[var(--theme-bg-accent)]/10'
                        : 'border-[var(--theme-border-secondary)] bg-[var(--theme-bg-primary)]/40 hover:border-[var(--theme-border-focus)]/50'
                    } ${isLocked ? 'opacity-80' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={isLocked}
                      onChange={() => handleToggleModel(model.id)}
                      aria-label={`${t('shortcutsCycleModelsScopeModelAria')}: ${model.name}`}
                      className="mt-0.5 h-4 w-4 rounded border-[var(--theme-border-secondary)] text-[var(--theme-text-link)] focus:ring-[var(--theme-border-focus)]"
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block text-sm font-medium ${isSelected ? 'text-[var(--theme-text-primary)]' : 'text-[var(--theme-text-secondary)]'}`}
                      >
                        {model.name}
                      </span>
                      <span className="block truncate font-mono text-xs text-[var(--theme-text-secondary)]">
                        {model.id}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
