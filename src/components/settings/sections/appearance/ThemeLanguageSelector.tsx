import React from 'react';
import { useI18n } from '@/contexts/I18nContext';
import type { AppSettings } from '@/types';
import { SUPPORTED_LANGUAGES, LANGUAGE_META } from '@/i18n/languageRegistry';
import { Select } from '@/components/shared/Select';
import { SETTINGS_SECTION_CARD_CLASS } from '@/constants/designTokens';

export const ThemeLanguageSelector: React.FC<{
  settings: AppSettings;
  onUpdate: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
}> = ({ settings, onUpdate }) => {
  const { t } = useI18n();
  const themeOptions = [
    { id: 'system', labelKey: 'settingsThemeSystem' },
    { id: 'onyx', labelKey: 'settingsThemeDark' },
    { id: 'graphite', labelKey: 'settingsThemeGray' },
    { id: 'pearl', labelKey: 'settingsThemeLight' },
    { id: 'sepia', labelKey: 'settingsThemeSepia' },
  ] as const;

  return (
    <div className={`${SETTINGS_SECTION_CARD_CLASS} space-y-1`}>
      <div
        className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between py-1"
        data-settings-item="interface-theme"
      >
        <span className="text-sm font-medium text-[var(--theme-text-primary)]">{t('settingsTheme')}</span>
        <Select
          id="interface-theme-select"
          label={t('settingsTheme')}
          hideLabel
          value={settings.themeId}
          onChange={(e) => onUpdate('themeId', e.target.value as AppSettings['themeId'])}
          wrapperClassName="w-44"
        >
          {themeOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {t(option.labelKey)}
            </option>
          ))}
        </Select>
      </div>

      <div
        className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-t border-[var(--theme-border-secondary)]/50 py-3"
        data-settings-item="interface-language"
      >
        <span className="text-sm font-medium text-[var(--theme-text-primary)]">{t('settingsLanguage')}</span>
        <Select
          id="interface-language-select"
          label={t('settingsLanguage')}
          hideLabel
          value={settings.language}
          onChange={(e) => onUpdate('language', e.target.value as AppSettings['language'])}
          wrapperClassName="w-44"
        >
          <option value="system">{t('settingsLanguageSystem')}</option>
          {SUPPORTED_LANGUAGES.map((id) => (
            <option key={id} value={id}>
              {LANGUAGE_META[id].nativeLabel}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
};
