import React from 'react';
import { Pin, PinOff, Trash2 } from 'lucide-react';
import { type ApiMode, type ModelOption } from '@/types';
import { getModelIcon } from '@/components/shared/ModelIcon';
import { useI18n } from '@/contexts/I18nContext';
import { SMALL_ICON_DANGER_BUTTON_CLASS } from '@/constants/buttonClasses';

interface ModelListEditorRowProps {
  model: ModelOption;
  index: number;
  showApiModeControls?: boolean;
  onUpdate: (index: number, field: 'id' | 'name' | 'isPinned' | 'apiMode', value: string | boolean) => void;
  onDelete: (index: number) => void;
}

const providerOptions: Array<{ apiMode: ApiMode; labelKey: string; shortLabel: string }> = [
  { apiMode: 'gemini-native', labelKey: 'modelPickerProviderGemini', shortLabel: 'Gemini' },
  { apiMode: 'third-party', labelKey: 'modelPickerProviderThirdParty', shortLabel: 'Third-party' },
];

export const ModelListEditorRow: React.FC<ModelListEditorRowProps> = ({
  model,
  index,
  showApiModeControls = false,
  onUpdate,
  onDelete,
}) => {
  const { t } = useI18n();

  return (
    <div className="group rounded-lg border border-transparent bg-[var(--theme-bg-primary)]/35 p-2">
      <div className="flex items-center gap-2">
        <div className="w-9 flex justify-center items-center text-[var(--theme-text-secondary)]">
          {getModelIcon(model)}
        </div>
        <input
          type="text"
          value={model.id}
          onChange={(e) => onUpdate(index, 'id', e.target.value)}
          placeholder={t('settingsModelIdPlaceholder')}
          className="flex-1 min-w-0 bg-[var(--theme-bg-primary)] border border-[var(--theme-border-secondary)] rounded px-2 py-1.5 text-xs text-[var(--theme-text-primary)] focus:border-[var(--theme-border-focus)] outline-none font-mono"
        />
        <input
          type="text"
          value={model.name}
          onChange={(e) => onUpdate(index, 'name', e.target.value)}
          placeholder={t('settingsModelNamePlaceholder')}
          className="flex-1 min-w-0 bg-[var(--theme-bg-primary)] border border-[var(--theme-border-secondary)] rounded px-2 py-1.5 text-xs text-[var(--theme-text-primary)] focus:border-[var(--theme-border-focus)] outline-none"
        />
        <button
          type="button"
          onClick={() => onUpdate(index, 'isPinned', !model.isPinned)}
          aria-pressed={model.isPinned}
          className={`p-1.5 rounded transition-colors ${
            model.isPinned
              ? 'text-[var(--theme-text-link)] bg-[var(--theme-bg-accent)]/10'
              : 'text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)]'
          }`}
          title={model.isPinned ? t('settingsPinnedModel') : t('settingsPinModel')}
        >
          {model.isPinned ? <Pin size={14} /> : <PinOff size={14} />}
        </button>
        <button
          onClick={() => onDelete(index)}
          className={SMALL_ICON_DANGER_BUTTON_CLASS}
          title={t('settingsRemoveModel')}
        >
          <Trash2 size={14} />
        </button>
      </div>

      {showApiModeControls && (
        <div className="ml-10 mt-2 inline-flex rounded-md border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-input)] p-0.5">
          {providerOptions.map((option) => {
            const isActive = model.apiMode === option.apiMode;

            return (
              <button
                type="button"
                key={option.apiMode}
                onClick={() => onUpdate(index, 'apiMode', option.apiMode)}
                aria-pressed={isActive}
                title={t(option.labelKey)}
                className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-[var(--theme-bg-accent)] text-[var(--theme-text-accent)]'
                    : 'text-[var(--theme-text-secondary)] hover:bg-[var(--theme-bg-tertiary)] hover:text-[var(--theme-text-primary)]'
                }`}
              >
                {option.shortLabel}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
