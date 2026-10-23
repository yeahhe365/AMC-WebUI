import React from 'react';
import { SETTINGS_INPUT_CLASS } from '@/constants/formClasses';
import { SETTINGS_SECTION_CARD_CLASS, SETTINGS_SECTION_LABEL_CLASS } from '@/constants/designTokens';
import { type AppSettings, type AutoTitleLength } from '@/types';
import { useI18n } from '@/contexts/I18nContext';
import { Select } from '@/components/shared/Select';
import { ToggleItem } from '@/components/shared/ToggleItem';
import { Toggle } from '@/components/shared/Toggle';

interface AutoTitleCardProps {
  currentSettings: AppSettings;
  onUpdateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
}

export const AutoTitleCard: React.FC<AutoTitleCardProps> = ({ currentSettings, onUpdateSetting }) => {
  const { t } = useI18n();

  return (
    <div className={`${SETTINGS_SECTION_CARD_CLASS} space-y-4`} data-settings-item="models-auto-title">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h4 className={`${SETTINGS_SECTION_LABEL_CLASS} min-w-0`}>{t('settingsAutoTitleCardTitle')}</h4>
          <div className="shrink-0">
            <Toggle
              ariaLabel={t('isAutoTitleEnabled')}
              checked={currentSettings.isAutoTitleEnabled}
              onChange={(enabled) => onUpdateSetting('isAutoTitleEnabled', enabled)}
            />
          </div>
        </div>
        <p className="text-xs leading-relaxed text-[var(--theme-text-secondary)]">{t('settingsAutoTitleCardDesc')}</p>
      </div>

      {currentSettings.isAutoTitleEnabled && (
        <div className="pt-3 border-t border-[var(--theme-border-secondary)]/40 space-y-4">
          <div data-settings-item="models-auto-title-emoji">
            <ToggleItem
              label={t('settingsAutoTitleIncludeEmojiLabel')}
              checked={currentSettings.autoTitleIncludeEmoji ?? true}
              onChange={(enabled) => onUpdateSetting('autoTitleIncludeEmoji', enabled)}
              tooltip={t('settingsAutoTitleIncludeEmojiTooltip')}
            />
          </div>

          <div className="space-y-1.5" data-settings-item="models-auto-title-length">
            <label
              htmlFor="auto-title-length-select"
              className="text-xs font-semibold uppercase tracking-wider text-[var(--theme-text-secondary)]"
            >
              {t('settingsAutoTitleLengthLabel')}
            </label>
            <Select
              id="auto-title-length-select"
              label={t('settingsAutoTitleLengthLabel')}
              hideLabel
              value={currentSettings.autoTitleLength ?? 'standard'}
              onChange={(event) => onUpdateSetting('autoTitleLength', event.target.value as AutoTitleLength)}
            >
              <option value="concise">{t('settingsAutoTitleLengthConcise')}</option>
              <option value="standard">{t('settingsAutoTitleLengthStandard')}</option>
              <option value="detailed">{t('settingsAutoTitleLengthDetailed')}</option>
            </Select>
          </div>

          <div className="space-y-1.5" data-settings-item="models-auto-title-custom-prompt">
            <label
              htmlFor="auto-title-custom-prompt"
              className="text-xs font-semibold uppercase tracking-wider text-[var(--theme-text-secondary)]"
            >
              {t('settingsAutoTitleCustomPromptLabel')}
            </label>
            <input
              id="auto-title-custom-prompt"
              type="text"
              value={currentSettings.autoTitleCustomPrompt ?? ''}
              onChange={(event) => onUpdateSetting('autoTitleCustomPrompt', event.target.value)}
              placeholder={t('settingsAutoTitleCustomPromptPlaceholder')}
              className={`w-full p-2.5 border rounded-lg transition-all duration-200 focus:ring-2 focus:ring-offset-0 text-sm ${SETTINGS_INPUT_CLASS}`}
            />
          </div>
        </div>
      )}
    </div>
  );
};
