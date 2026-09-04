import React from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { Loader2, Download, Minimize, X, ZoomIn, ZoomOut, RotateCw, Image as ImageIcon, Expand } from 'lucide-react';
import { IconHtml5 } from '@/components/icons';
import { FOCUS_VISIBLE_RING_SECONDARY_OFFSET_CLASS } from '@/constants/focusClasses';
import { ICON_BUTTON_CLASS, MODAL_CLOSE_BUTTON_DANGER_HOVER_CLASS } from '@/constants/buttonClasses';
import type { HtmlPreviewPrivilege } from '@/utils/html-preview/previewPrivilege';

interface HtmlPreviewHeaderProps {
  title: string;
  privilege?: HtmlPreviewPrivilege;
  scale: number;
  isTrueFullscreen: boolean;
  isPreviewReady: boolean;
  isScreenshotting: boolean;
  minZoom: number;
  maxZoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onRefresh: () => void;
  onDownload: () => void;
  onScreenshot: () => void;
  onToggleFullscreen: () => void;
  onClose: () => void;
}

export const HtmlPreviewHeader: React.FC<HtmlPreviewHeaderProps> = ({
  title,
  privilege = 'unrestricted',
  scale,
  isTrueFullscreen,
  isPreviewReady,
  isScreenshotting,
  minZoom,
  maxZoom,
  onZoomIn,
  onZoomOut,
  onRefresh,
  onDownload,
  onScreenshot,
  onToggleFullscreen,
  onClose,
}) => {
  const { t } = useI18n();
  const subtitle = privilege === 'sanitized' ? t('htmlPreviewArtifactSubtitle') : t('htmlPreviewDemoSubtitle');
  const iconBtnClass = `${ICON_BUTTON_CLASS} ${FOCUS_VISIBLE_RING_SECONDARY_OFFSET_CLASS} disabled:opacity-30 disabled:cursor-not-allowed`;

  return (
    <header className="h-[45px] px-4 flex items-center justify-between gap-4 bg-[var(--theme-bg-primary)] border-b border-[var(--theme-border-secondary)] z-10 select-none">
      <div className="flex items-center gap-3 min-w-0 overflow-hidden">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--theme-bg-tertiary)]/45 text-[var(--theme-text-tertiary)]">
          <IconHtml5 size={20} />
        </div>
        <div className="flex flex-col min-w-0">
          <h2
            id="html-preview-modal-title"
            className="text-sm font-semibold text-[var(--theme-text-primary)] truncate"
            title={title}
          >
            {title}
          </h2>
          <span className="text-xs text-[var(--theme-text-tertiary)] truncate">{subtitle}</span>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <div className="hidden sm:flex items-center">
          <button
            onClick={onZoomOut}
            className={iconBtnClass}
            disabled={scale <= minZoom}
            title={t('htmlPreviewZoomOut')}
          >
            <ZoomOut size={18} strokeWidth={1.5} />
          </button>
          <span className="text-xs font-mono font-medium text-[var(--theme-text-secondary)] w-10 text-center select-none tabular-nums">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={onZoomIn}
            className={iconBtnClass}
            disabled={scale >= maxZoom}
            title={t('htmlPreviewZoomIn')}
          >
            <ZoomIn size={18} strokeWidth={1.5} />
          </button>
        </div>

        <div className="hidden sm:block w-px h-4 bg-[var(--theme-border-secondary)] mx-2" />

        <button onClick={onRefresh} className={iconBtnClass} title={t('htmlPreviewReload')}>
          <RotateCw size={18} strokeWidth={1.5} />
        </button>
        <button onClick={onDownload} className={iconBtnClass} title={t('htmlPreviewDownloadHtml')}>
          <Download size={18} strokeWidth={1.5} />
        </button>
        <button
          onClick={onScreenshot}
          className={iconBtnClass}
          disabled={!isPreviewReady || isScreenshotting}
          title={t('htmlPreviewScreenshot')}
        >
          {isScreenshotting ? (
            <Loader2 size={18} className="animate-spin" strokeWidth={1.5} />
          ) : (
            <ImageIcon size={18} strokeWidth={1.5} />
          )}
        </button>

        <div className="w-px h-4 bg-[var(--theme-border-secondary)] mx-2" />

        <button
          onClick={onToggleFullscreen}
          className={iconBtnClass}
          title={isTrueFullscreen ? t('htmlPreviewExitFullscreen') : t('htmlPreviewFullscreen')}
        >
          {isTrueFullscreen ? <Minimize size={18} strokeWidth={1.5} /> : <Expand size={18} strokeWidth={1.5} />}
        </button>

        {!isTrueFullscreen && (
          <button
            onClick={onClose}
            className={`${MODAL_CLOSE_BUTTON_DANGER_HOVER_CLASS} ml-1`}
            title={t('htmlPreviewClose')}
          >
            <X size={20} strokeWidth={1.5} />
          </button>
        )}
      </div>
    </header>
  );
};
