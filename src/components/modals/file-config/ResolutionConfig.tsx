import React from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { Image as ImageIcon, MonitorPlay, FileText } from 'lucide-react';
import { MediaResolution } from '@/types';
import { Select } from '@/components/shared/Select';
import { interpolate } from '@/i18n/interpolate';

interface ResolutionConfigProps {
  mediaResolution: MediaResolution | '';
  setMediaResolution: (value: MediaResolution) => void;
  allowUltraHigh?: boolean;
  /** Global level shown inside the "follow global" option label. */
  globalMediaResolution?: MediaResolution;
  /** Inline per-unit token estimate for the currently selected level. */
  tokenEstimate?: string;
  /** Kind of media being configured; picks the label icon and estimate unit. */
  kind?: 'image' | 'video' | 'pdf';
}

const FILE_KIND_ICONS: Record<NonNullable<ResolutionConfigProps['kind']>, typeof ImageIcon> = {
  image: ImageIcon,
  video: MonitorPlay,
  pdf: FileText,
};

export const ResolutionConfig: React.FC<ResolutionConfigProps> = ({
  mediaResolution,
  setMediaResolution,
  allowUltraHigh = true,
  globalMediaResolution,
  tokenEstimate,
  kind = 'image',
}) => {
  const { t } = useI18n();
  const Icon = FILE_KIND_ICONS[kind];

  const globalLabel = (() => {
    switch (globalMediaResolution) {
      case MediaResolution.MEDIA_RESOLUTION_LOW:
        return t('mediaResolutionLow');
      case MediaResolution.MEDIA_RESOLUTION_MEDIUM:
        return t('mediaResolutionMedium');
      case MediaResolution.MEDIA_RESOLUTION_HIGH:
        return t('mediaResolutionHigh');
      case MediaResolution.MEDIA_RESOLUTION_ULTRA_HIGH:
        return t('mediaResolutionUltraHigh');
      default:
        return t('mediaResolutionUnspecified');
    }
  })();

  return (
    <div className="space-y-3 pb-4 border-b border-[var(--theme-border-secondary)]/50">
      <Select
        id="file-media-resolution"
        label={t('fileSettingsResolution')}
        layout="horizontal"
        value={mediaResolution}
        onChange={(e) => setMediaResolution(e.target.value as MediaResolution)}
        labelContent={
          <div className="flex items-center gap-2">
            <Icon size={14} className="text-[var(--theme-text-secondary)]" />
            <span>{t('fileSettingsResolution')}</span>
          </div>
        }
      >
        <option value="">{interpolate(t('fileSettingsResolutionFollowGlobal'), { value: globalLabel })}</option>
        <option value={MediaResolution.MEDIA_RESOLUTION_LOW}>{t('mediaResolutionLow')}</option>
        <option value={MediaResolution.MEDIA_RESOLUTION_MEDIUM}>{t('mediaResolutionMedium')}</option>
        <option value={MediaResolution.MEDIA_RESOLUTION_HIGH}>{t('mediaResolutionHigh')}</option>
        {allowUltraHigh && (
          <option value={MediaResolution.MEDIA_RESOLUTION_ULTRA_HIGH}>{t('mediaResolutionUltraHigh')}</option>
        )}
      </Select>
      {tokenEstimate && <p className="text-xs text-[var(--theme-text-secondary)]">{tokenEstimate}</p>}
      <p className="text-xs text-[var(--theme-text-tertiary)] italic">{t('fileSettingsResolutionHelp')}</p>
    </div>
  );
};
