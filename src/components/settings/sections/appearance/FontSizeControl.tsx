import React from 'react';
import { Info, Type } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { type AppSettings } from '@/types';
import {
  SETTINGS_RANGE_SLIDER_CLASS,
  SETTINGS_SECTION_CARD_CLASS,
  SETTINGS_SECTION_LABEL_CLASS,
  SETTINGS_VALUE_BADGE_CLASS,
} from '@/constants/designTokens';
import { Tooltip } from '@/components/shared/Tooltip';

interface FontSizeControlProps {
  settings: AppSettings;
  onUpdate: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
}

export const FontSizeControl: React.FC<FontSizeControlProps> = ({ settings, onUpdate }) => {
  const { t } = useI18n();
  return (
    <div className={`${SETTINGS_SECTION_CARD_CLASS} space-y-4`} data-settings-item="interface-font-size">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <label className={`${SETTINGS_SECTION_LABEL_CLASS} flex items-center gap-2`}>
            <Type size={14} strokeWidth={1.5} /> {t('settingsFontSize')}
          </label>
          <Tooltip text={t('settingsFontSizeTooltip')}>
            <Info size={14} className="text-[var(--theme-text-secondary)] cursor-help" strokeWidth={1.5} />
          </Tooltip>
        </div>
        <span className={SETTINGS_VALUE_BADGE_CLASS}>{settings.baseFontSize}px</span>
      </div>
      <input
        type="range"
        min="12"
        max="24"
        step="1"
        value={settings.baseFontSize}
        onChange={(e) => onUpdate('baseFontSize', parseInt(e.target.value, 10))}
        className={SETTINGS_RANGE_SLIDER_CLASS}
      />
      <div className="flex justify-between text-xs text-[var(--theme-text-secondary)] font-mono px-1 tabular-nums">
        <span>12px</span>
        <span>18px</span>
        <span>24px</span>
      </div>
    </div>
  );
};
