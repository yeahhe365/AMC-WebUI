import React from 'react';
import { Info, Type } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import type { AppSettings } from '@/types';
import { Tooltip } from '@/components/shared/Tooltip';
import { Slider } from '@/components/shared/Slider';
import {
  LIVE_ARTIFACTS_CUSTOM_FONT_SIZE_MAX,
  LIVE_ARTIFACTS_CUSTOM_FONT_SIZE_MIN,
  clampLiveArtifactsCustomFontSize,
} from '@/utils/live-artifacts/liveArtifactsFontSize';
import {
  SETTINGS_SECTION_CARD_CLASS,
  SETTINGS_SECTION_LABEL_CLASS,
  SETTINGS_VALUE_BADGE_CLASS,
} from '@/constants/designTokens';

interface LiveArtifactsFontSizeControlProps {
  settings: AppSettings;
  onUpdate: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
}

export const LiveArtifactsFontSizeControl: React.FC<LiveArtifactsFontSizeControlProps> = ({ settings, onUpdate }) => {
  const { t } = useI18n();
  const customFontSize = clampLiveArtifactsCustomFontSize(settings.liveArtifactsCustomFontSize ?? 16);

  return (
    <div className={`${SETTINGS_SECTION_CARD_CLASS} space-y-3`} data-settings-item="interface-live-artifacts-font">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <label
            htmlFor="live-artifacts-custom-font-size"
            className={`flex items-center gap-2 ${SETTINGS_SECTION_LABEL_CLASS}`}
          >
            <Type size={14} strokeWidth={1.5} />
            {t('settingsLiveArtifactsFontSize')}
          </label>
          <Tooltip text={t('settingsLiveArtifactsFontSizeTooltip')}>
            <Info size={14} className="text-[var(--theme-text-secondary)] cursor-help" strokeWidth={1.5} />
          </Tooltip>
        </div>
        <span className={SETTINGS_VALUE_BADGE_CLASS}>{customFontSize}px</span>
      </div>
      <Slider
        id="live-artifacts-custom-font-size"
        min={LIVE_ARTIFACTS_CUSTOM_FONT_SIZE_MIN}
        max={LIVE_ARTIFACTS_CUSTOM_FONT_SIZE_MAX}
        step={1}
        value={customFontSize}
        onChange={(val) => onUpdate('liveArtifactsCustomFontSize', clampLiveArtifactsCustomFontSize(Math.round(val)))}
        ariaLabel={t('settingsLiveArtifactsFontSize')}
      />
      <div className="flex justify-between px-1 font-mono text-xs text-[var(--theme-text-secondary)]">
        <span>{LIVE_ARTIFACTS_CUSTOM_FONT_SIZE_MIN}px</span>
        <span>16px</span>
        <span>{LIVE_ARTIFACTS_CUSTOM_FONT_SIZE_MAX}px</span>
      </div>
    </div>
  );
};
