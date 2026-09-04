import React from 'react';
import { Info, Type } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import type { AppSettings } from '@/types';
import { Tooltip } from '@/components/shared/Tooltip';
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
      <input
        id="live-artifacts-custom-font-size"
        type="range"
        min={LIVE_ARTIFACTS_CUSTOM_FONT_SIZE_MIN}
        max={LIVE_ARTIFACTS_CUSTOM_FONT_SIZE_MAX}
        step="1"
        value={customFontSize}
        onChange={(event) =>
          onUpdate('liveArtifactsCustomFontSize', clampLiveArtifactsCustomFontSize(Number(event.target.value)))
        }
        className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-[var(--theme-border-secondary)] accent-[var(--theme-bg-accent)] hover:accent-[var(--theme-bg-accent-hover)]"
      />
      <div className="flex justify-between px-1 font-mono text-xs text-[var(--theme-text-secondary)]">
        <span>{LIVE_ARTIFACTS_CUSTOM_FONT_SIZE_MIN}px</span>
        <span>16px</span>
        <span>{LIVE_ARTIFACTS_CUSTOM_FONT_SIZE_MAX}px</span>
      </div>
    </div>
  );
};
