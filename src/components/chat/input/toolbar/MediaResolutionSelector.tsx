import React from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { Zap } from 'lucide-react';
import { MediaResolution } from '@/types';
import { Select } from '@/components/shared/Select';
import { interpolate } from '@/i18n/interpolate';

interface MediaResolutionSelectorProps {
  mediaResolution: MediaResolution;
  setMediaResolution: (resolution: MediaResolution) => void;
}

/**
 * Chat-toolbar resolution control for Native Audio (Live API) models only —
 * the only place it is rendered (ChatInputToolbar). Standard (non-live)
 * resolution choices live in Settings → Generation, plus the per-file modal.
 */
export const MediaResolutionSelector: React.FC<MediaResolutionSelectorProps> = ({
  mediaResolution,
  setMediaResolution,
}) => {
  const { t } = useI18n();
  const options = [
    { value: MediaResolution.MEDIA_RESOLUTION_UNSPECIFIED, count: 258 },
    { value: MediaResolution.MEDIA_RESOLUTION_LOW, count: 66 },
  ];

  return (
    <Select
      id="media-resolution-selector"
      label={t('settingsMediaResolution')}
      hideLabel
      value={mediaResolution}
      onChange={(e) => setMediaResolution(e.target.value as MediaResolution)}
      className="mb-0"
      wrapperClassName="relative min-w-[180px] w-auto"
      direction="up"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          <span className="flex items-center gap-2">
            <Zap size={14} className="text-[var(--theme-text-tertiary)]" />
            <span>{interpolate(t('mediaResolutionLiveTokensPerImage'), { count: option.count })}</span>
          </span>
        </option>
      ))}
    </Select>
  );
};
