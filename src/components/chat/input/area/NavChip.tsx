import React from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { SUGGESTION_CHIP_ACTIVE_CLASS, SUGGESTION_CHIP_CLASS } from '@/constants/designTokens';
import { SuggestionIcon } from './SuggestionIcon';
import { useChatStore } from '@/stores/chatStore';
import { collectSessionMediaFiles } from '@/utils/media-nav/sessionMediaFiles';

interface NavChipProps {
  /** SuggestionIcon icon name rendering before the label. */
  iconName: string;
  /** i18n key of the chip label. */
  labelKey: string;
  /** i18n key of the hint shown when the session has no matching media. */
  missingHintKey: string;
  /** 'pdf', 'video', or 'any' — which media kind this chip requires. */
  mediaKind?: 'pdf' | 'video' | 'audio' | 'any';
  isEnabled: boolean;
  onToggle: () => void;
  testId: string;
}

/**
 * Preset-row toggle chip for one media navigation (PDF 导航 / 视频导航 / 媒体导航).
 * Same family as 目标框选 / 箭头标注: dimmed with a hint in the title while the
 * session has no matching media.
 */
const NavChipComponent: React.FC<NavChipProps> = ({
  iconName,
  labelKey,
  missingHintKey,
  mediaKind = 'any',
  isEnabled,
  onToggle,
  testId,
}) => {
  const { t } = useI18n();
  const hasMedia = useChatStore((state) => {
    const { pdfs, videos } = collectSessionMediaFiles(state.selectedFiles, state.activeMessages);
    if (mediaKind === 'pdf') return pdfs.length > 0;
    if (mediaKind === 'video') return videos.length > 0;
    return pdfs.length > 0 || videos.length > 0;
  });
  const label = t(labelKey);
  const title = hasMedia ? label : `${label} · ${t(missingHintKey)}`;

  return (
    <button
      type="button"
      onClick={onToggle}
      className={isEnabled ? SUGGESTION_CHIP_ACTIVE_CLASS : SUGGESTION_CHIP_CLASS}
      aria-label={label}
      aria-pressed={isEnabled}
      title={title}
      data-testid={testId}
    >
      <SuggestionIcon iconName={iconName} />
      <span>{label}</span>
    </button>
  );
};

export const NavChip = React.memo(NavChipComponent);
