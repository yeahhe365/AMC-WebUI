import { useMemo, type FC } from 'react';
import { ChevronDown } from 'lucide-react';
import { type ModelOption, type ChatProviderId } from '@/types';
import { useI18n } from '@/contexts/I18nContext';
import { GoogleSpinner } from '@/components/icons/GoogleSpinner';
import { ModelPicker } from '@/components/shared/ModelPicker';
import { FOCUS_VISIBLE_RING_PRIMARY_OFFSET_CLASS } from '@/constants/focusClasses';

const MODEL_TRIGGER_BUTTON_CLASS = `min-h-9 flex items-center gap-2 rounded-xl px-2 sm:px-3 bg-transparent hover:bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-primary)] font-medium text-base transition-all duration-200 ease-out ${FOCUS_VISIBLE_RING_PRIMARY_OFFSET_CLASS} disabled:opacity-70 disabled:cursor-not-allowed border border-transparent hover:border-[var(--theme-border-secondary)] active:bg-[var(--theme-bg-tertiary)]`;

interface HeaderModelSelectorProps {
  currentModelName?: string;
  availableModels: ModelOption[];
  selectedModelId: string;
  onSelectModel: (modelId: string, providerId?: ChatProviderId) => void;
  isSwitchingModel: boolean;
  isLoading: boolean;
}

export const HeaderModelSelector: FC<HeaderModelSelectorProps> = ({
  currentModelName,
  availableModels,
  selectedModelId,
  onSelectModel,
  isSwitchingModel,
  isLoading,
}) => {
  const { t } = useI18n();

  const abbreviatedModelName = useMemo(() => {
    if (!currentModelName) return '';
    if (currentModelName === t('loading')) return currentModelName;

    let name = currentModelName;
    name = name.replace(/^Gemini\s+/i, '');
    name = name.replace(/\s+Preview/i, '');
    name = name.replace(/\s+Latest/i, '');

    return name;
  }, [currentModelName, t]);

  const isSelectorDisabled = availableModels.length === 0 || isLoading || isSwitchingModel;

  return (
    <ModelPicker
      models={availableModels}
      selectedId={selectedModelId}
      onSelect={onSelectModel}
      dropdownClassName="w-[calc(100vw-2rem)] max-w-[320px] sm:w-[320px] sm:max-w-none max-h-96"
      renderTrigger={({ isOpen, setIsOpen, listboxId, activeDescendantId }) => (
        <div className="relative flex items-center gap-1">
          <button
            onClick={() => setIsOpen(!isOpen)}
            disabled={isSelectorDisabled}
            className={`${MODEL_TRIGGER_BUTTON_CLASS} ${isSwitchingModel ? 'animate-pulse' : ''}`}
            title={`${t('headerModelSelectorTooltipCurrent')}: ${currentModelName}. ${t('headerModelSelectorTooltipAction')}`}
            aria-label={`${t('headerModelAriaLabelCurrent')}: ${currentModelName}. ${t('headerModelAriaLabelAction')}`}
            aria-haspopup="listbox"
            aria-expanded={isOpen}
            aria-controls={isOpen ? listboxId : undefined}
            aria-activedescendant={isOpen ? activeDescendantId : undefined}
          >
            {!currentModelName && (
              <div className="flex items-center justify-center">
                <GoogleSpinner size={16} />
              </div>
            )}

            <span className="truncate max-w-[180px] font-semibold sm:max-w-[220px]">{abbreviatedModelName}</span>
            <ChevronDown
              size={15}
              strokeWidth={2}
              aria-hidden
              className={`flex-shrink-0 text-[var(--theme-text-tertiary)] transition-transform duration-200 ${
                isOpen ? 'rotate-180' : ''
              }`}
            />
          </button>
        </div>
      )}
    />
  );
};
