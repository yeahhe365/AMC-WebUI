import React, { useMemo } from 'react';
import { ChevronDown } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import type { AppSettings, ModelOption } from '@/types';
import { ModelPicker } from '@/components/shared/ModelPicker';
import { buildProviderAwareModelList } from '@/utils/thirdPartyApiProviders';
import { SETTINGS_SECTION_CARD_CLASS, SETTINGS_SECTION_LABEL_CLASS } from '@/constants/designTokens';
import { FOCUS_VISIBLE_RING_BASE_CLASS } from '@/constants/focusClasses';

export const SelectionAskModelSection: React.FC<{
  settings: AppSettings;
  /** Narrowed to the two keys this card writes so callers can pass the shared
      settings update handler without re-asserting the full generic. */
  onUpdate: <K extends 'selectionAskModelId' | 'selectionAskProviderId'>(key: K, value: AppSettings[K]) => void;
  availableModels: ModelOption[];
}> = ({ settings, onUpdate, availableModels }) => {
  const { t } = useI18n();
  const models = useMemo(() => buildProviderAwareModelList(settings, availableModels), [settings, availableModels]);
  const selectedId = settings.selectionAskModelId;
  const selectionAskProviderId = settings.selectionAskProviderId;
  const selectedModel = selectedId
    ? (models.find(
        (m) => m.id === selectedId && (m.providerId ?? 'gemini-native') === (selectionAskProviderId ?? 'gemini-native'),
      ) ?? models.find((m) => m.id === selectedId))
    : undefined;

  return (
    <section data-settings-item="selectionAskModel" className={SETTINGS_SECTION_CARD_CLASS}>
      <h4 className={SETTINGS_SECTION_LABEL_CLASS}>{t('selectionAskModel')}</h4>
      <p className="mt-1 text-xs leading-relaxed text-[var(--theme-text-secondary)]">{t('selectionAskModelDesc')}</p>
      <div className="mt-3">
        <ModelPicker
          models={models}
          selectedId={selectedId ?? ''}
          onSelect={(id, providerId) => {
            onUpdate('selectionAskModelId', id);
            onUpdate('selectionAskProviderId', providerId);
          }}
          renderTrigger={({ isOpen, setIsOpen, selectedModel: pickerSelected }) => (
            <button
              type="button"
              onClick={() => setIsOpen(!isOpen)}
              className={`flex w-full items-center justify-between rounded-lg border border-[var(--theme-border-primary)] bg-[var(--theme-bg-primary)] px-3 py-2 text-sm text-left transition-colors hover:border-[var(--theme-border-focus)] ${FOCUS_VISIBLE_RING_BASE_CLASS}`}
              aria-label={t('selectionAskModel')}
              aria-haspopup="listbox"
              aria-expanded={isOpen}
            >
              <span
                className={
                  pickerSelected ? 'truncate text-[var(--theme-text-primary)]' : 'text-[var(--theme-text-tertiary)]'
                }
              >
                {pickerSelected ? pickerSelected.name : t('selectionAskModelNotConfigured')}
              </span>
              <ChevronDown
                size={16}
                strokeWidth={1.75}
                aria-hidden="true"
                className={`ml-2 shrink-0 text-[var(--theme-text-secondary)] transition-transform duration-200 ${
                  isOpen ? 'rotate-180' : ''
                }`}
              />
            </button>
          )}
          dropdownClassName="w-full min-w-[320px] max-h-[360px]"
        />
        {selectedModel && selectedModel.unavailable && (
          <p className="mt-2 text-xs text-[var(--theme-text-danger)]">{t('selectionAskModelUnavailable')}</p>
        )}
      </div>
    </section>
  );
};
