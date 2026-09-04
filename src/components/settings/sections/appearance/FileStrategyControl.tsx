import React from 'react';
import { CloudUpload, Info } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { type FilesApiConfig, type AppSettings } from '@/types';
import { Tooltip } from '@/components/shared/Tooltip';
import { ToggleItem } from '@/components/shared/ToggleItem';
import { SETTINGS_SECTION_CARD_CLASS, SETTINGS_SECTION_LABEL_CLASS } from '@/constants/designTokens';

interface FileStrategyControlProps {
  settings: AppSettings;
  onUpdate: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
}

export const FileStrategyControl: React.FC<FileStrategyControlProps> = ({ settings, onUpdate }) => {
  const { t } = useI18n();
  const updateFileConfig = (key: keyof FilesApiConfig, enabled: boolean) => {
    onUpdate('filesApiConfig', { ...settings.filesApiConfig, [key]: enabled });
  };

  return (
    <div className={SETTINGS_SECTION_CARD_CLASS} data-settings-item="api-files-strategy">
      <div className="mb-3 flex items-start justify-between">
        <label className={`${SETTINGS_SECTION_LABEL_CLASS} flex items-center gap-2`}>
          <CloudUpload size={14} strokeWidth={1.5} />
          {t('settingsFilesApiTitle')}
        </label>
        <Tooltip text={t('settingsFilesApiTooltip')}>
          <Info size={14} className="cursor-help text-[var(--theme-text-secondary)]" strokeWidth={1.5} />
        </Tooltip>
      </div>
      <p className="mb-3 text-xs leading-relaxed text-[var(--theme-text-secondary)] opacity-80">
        {t('settingsFilesApiDesc')}
      </p>
      <div className="grid grid-cols-1 gap-x-6 gap-y-0 sm:grid-cols-2">
        <ToggleItem
          label={t('settingsFilesApiImages')}
          checked={settings.filesApiConfig.images}
          onChange={(enabled) => updateFileConfig('images', enabled)}
          small
        />
        <ToggleItem
          label={t('settingsFilesApiPdfs')}
          checked={settings.filesApiConfig.pdfs}
          onChange={(enabled) => updateFileConfig('pdfs', enabled)}
          small
        />
        <ToggleItem
          label={t('settingsFilesApiAudio')}
          checked={settings.filesApiConfig.audio}
          onChange={(enabled) => updateFileConfig('audio', enabled)}
          small
        />
        <ToggleItem
          label={t('settingsFilesApiVideo')}
          checked={settings.filesApiConfig.video}
          onChange={(enabled) => updateFileConfig('video', enabled)}
          small
        />
        <ToggleItem
          label={t('settingsFilesApiText')}
          checked={settings.filesApiConfig.text}
          onChange={(enabled) => updateFileConfig('text', enabled)}
          small
        />
      </div>
    </div>
  );
};
