import React from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { useChatInputActionsContext } from './ChatInputContext';

export const ChatInputExpandCorner: React.FC<{ hasCustomHeight?: boolean; onToggle?: () => void }> = ({
  hasCustomHeight,
  onToggle,
}) => {
  const { isFullscreen, onToggleFullscreen, disabled, isNativeAudioModel } = useChatInputActionsContext();
  const { t } = useI18n();

  if (!onToggleFullscreen || isNativeAudioModel) return null;

  const isExpanded = hasCustomHeight ?? isFullscreen;
  const ExpandIcon = isExpanded ? Minimize2 : Maximize2;
  const label = isExpanded ? t('fullscreenTooltipCollapse') : t('fullscreenTooltipExpand');
  const handleClick = onToggle ?? onToggleFullscreen;

  return (
    <div data-composer-expand-corner="" className="group/expand-corner absolute top-px right-px z-10 size-8">
      <span
        aria-hidden="true"
        data-composer-expand-corner-line=""
        className="pointer-events-none absolute top-1 right-1 size-3 origin-top-right scale-100 rounded-tr-[16px] border-[var(--theme-text-primary)]/60 border-t-[1.5px] border-r-[1.5px] opacity-70 transition-[opacity,scale] duration-200 ease-out group-focus-within/expand-corner:scale-50 group-focus-within/expand-corner:opacity-0 group-hover/expand-corner:scale-50 group-hover/expand-corner:opacity-0"
      />
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        aria-pressed={isExpanded}
        aria-label={label}
        title={label}
        className="-translate-y-2.5 [&_svg]:!size-3 pointer-events-none absolute top-1 right-1 flex size-[22px] translate-x-2.5 rotate-[-8deg] scale-[0.8] items-center justify-center rounded-full bg-transparent text-[var(--theme-text-tertiary)] opacity-0 shadow-none transition-[opacity,translate,scale,rotate,color,background-color] duration-300 ease-out hover:bg-[var(--theme-bg-tertiary)] hover:text-[var(--theme-text-primary)] focus-visible:pointer-events-auto focus-visible:translate-x-0 focus-visible:translate-y-0 focus-visible:rotate-0 focus-visible:scale-100 focus-visible:bg-[var(--theme-bg-tertiary)] focus-visible:text-[var(--theme-text-primary)] focus-visible:opacity-100 group-focus-within/expand-corner:pointer-events-auto group-focus-within/expand-corner:translate-x-0 group-focus-within/expand-corner:translate-y-0 group-focus-within/expand-corner:rotate-0 group-focus-within/expand-corner:scale-100 group-focus-within/expand-corner:bg-[var(--theme-bg-tertiary)]/80 group-focus-within/expand-corner:text-[var(--theme-text-primary)] group-focus-within/expand-corner:opacity-100 group-hover/expand-corner:pointer-events-auto group-hover/expand-corner:translate-x-0 group-hover/expand-corner:translate-y-0 group-hover/expand-corner:rotate-0 group-hover/expand-corner:scale-100 group-hover/expand-corner:bg-[var(--theme-bg-tertiary)]/80 group-hover/expand-corner:text-[var(--theme-text-primary)] group-hover/expand-corner:opacity-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer focus:outline-none"
      >
        <ExpandIcon className="transition-[scale] duration-300 ease-out group-focus-within/expand-corner:scale-110 group-hover/expand-corner:scale-110" />
      </button>
    </div>
  );
};
