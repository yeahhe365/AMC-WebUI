import React from 'react';
import { useI18n } from '@/contexts/I18nContext';
import {
  Loader2,
  Download,
  Minimize,
  X,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Image as ImageIcon,
  Expand,
  Code2,
  Eye,
  Monitor,
  Tablet,
  Smartphone,
  AlertTriangle,
} from 'lucide-react';
import { IconHtml5 } from '@/components/icons';
import { FOCUS_VISIBLE_RING_SECONDARY_OFFSET_CLASS } from '@/constants/focusClasses';
import { ICON_BUTTON_CLASS, MODAL_CLOSE_BUTTON_DANGER_HOVER_CLASS } from '@/constants/buttonClasses';
import { interpolate } from '@/i18n/interpolate';
import type { HtmlPreviewPrivilege } from '@/utils/html-preview/previewPrivilege';
import type { HtmlPreviewViewMode, HtmlPreviewDeviceMode } from '@/hooks/ui/useHtmlPreviewModal';

interface HtmlPreviewHeaderProps {
  title: string;
  privilege?: HtmlPreviewPrivilege;
  scale: number;
  isTrueFullscreen: boolean;
  isPreviewReady: boolean;
  isScreenshotting: boolean;
  minZoom: number;
  maxZoom: number;
  viewMode?: HtmlPreviewViewMode;
  onViewModeChange?: (mode: HtmlPreviewViewMode) => void;
  deviceMode?: HtmlPreviewDeviceMode;
  onDeviceModeChange?: (mode: HtmlPreviewDeviceMode) => void;
  diagnosticCount?: number;
  onToggleDiagnostics?: () => void;
  isDiagnosticsOpen?: boolean;
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
  viewMode = 'preview',
  onViewModeChange,
  deviceMode = 'desktop',
  onDeviceModeChange,
  diagnosticCount = 0,
  onToggleDiagnostics,
  isDiagnosticsOpen = false,
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
    <header className="h-[45px] px-3 sm:px-4 flex items-center justify-between gap-2 sm:gap-4 bg-[var(--theme-bg-primary)] border-b border-[var(--theme-border-secondary)] z-10 select-none">
      <div className="flex items-center gap-2.5 min-w-0 overflow-hidden">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--theme-bg-tertiary)]/45 text-[var(--theme-text-tertiary)]">
          <IconHtml5 size={20} />
        </div>
        <div className="flex flex-col min-w-0 max-w-[120px] xs:max-w-[160px] sm:max-w-[200px] md:max-w-[260px]">
          <h2
            id="html-preview-modal-title"
            className="text-sm font-semibold text-[var(--theme-text-primary)] truncate"
            title={title}
          >
            {title}
          </h2>
          <span className="text-xs text-[var(--theme-text-tertiary)] truncate">{subtitle}</span>
        </div>

        {onViewModeChange && (
          <div className="flex items-center rounded-lg border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-secondary)]/50 p-0.5 shrink-0 ml-1">
            <button
              type="button"
              onClick={() => onViewModeChange('preview')}
              className={`flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-md transition-colors ${
                viewMode === 'preview'
                  ? 'bg-[var(--theme-bg-primary)] text-[var(--theme-text-primary)] shadow-2xs font-semibold'
                  : 'text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-secondary)]'
              }`}
              title={t('htmlPreviewTabPreview')}
            >
              <Eye size={13} />
              <span className="hidden xs:inline">{t('htmlPreviewTabPreview')}</span>
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange('code')}
              className={`flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-md transition-colors ${
                viewMode === 'code'
                  ? 'bg-[var(--theme-bg-primary)] text-[var(--theme-text-primary)] shadow-2xs font-semibold'
                  : 'text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-secondary)]'
              }`}
              title={t('htmlPreviewTabCode')}
            >
              <Code2 size={13} />
              <span className="hidden xs:inline">{t('htmlPreviewTabCode')}</span>
            </button>
          </div>
        )}
      </div>

      {viewMode === 'preview' && onDeviceModeChange && (
        <div className="hidden md:flex items-center rounded-lg border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-secondary)]/40 p-0.5 shrink-0">
          <button
            type="button"
            onClick={() => onDeviceModeChange('desktop')}
            className={`p-1 rounded-md transition-colors ${
              deviceMode === 'desktop'
                ? 'bg-[var(--theme-bg-primary)] text-[var(--theme-text-primary)] shadow-2xs'
                : 'text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-secondary)]'
            }`}
            title={t('htmlPreviewDeviceDesktop')}
          >
            <Monitor size={15} />
          </button>
          <button
            type="button"
            onClick={() => onDeviceModeChange('tablet')}
            className={`p-1 rounded-md transition-colors ${
              deviceMode === 'tablet'
                ? 'bg-[var(--theme-bg-primary)] text-[var(--theme-text-primary)] shadow-2xs'
                : 'text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-secondary)]'
            }`}
            title={t('htmlPreviewDeviceTablet')}
          >
            <Tablet size={15} />
          </button>
          <button
            type="button"
            onClick={() => onDeviceModeChange('mobile')}
            className={`p-1 rounded-md transition-colors ${
              deviceMode === 'mobile'
                ? 'bg-[var(--theme-bg-primary)] text-[var(--theme-text-primary)] shadow-2xs'
                : 'text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-secondary)]'
            }`}
            title={t('htmlPreviewDeviceMobile')}
          >
            <Smartphone size={15} />
          </button>
        </div>
      )}

      <div className="flex items-center gap-1 shrink-0">
        {viewMode === 'preview' && diagnosticCount > 0 && onToggleDiagnostics && (
          <button
            type="button"
            onClick={onToggleDiagnostics}
            className={`flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-full border transition-colors ${
              isDiagnosticsOpen
                ? 'bg-amber-500/20 text-amber-600 dark:text-amber-300 border-amber-500/40'
                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 hover:bg-amber-500/15'
            }`}
            title={interpolate(t('htmlPreviewRuntimeErrors'), { count: String(diagnosticCount) })}
          >
            <AlertTriangle size={13} className="shrink-0 text-amber-500" />
            <span className="tabular-nums font-mono text-[11px]">{diagnosticCount}</span>
          </button>
        )}

        {viewMode === 'preview' && (
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
        )}

        {viewMode === 'preview' && (
          <>
            <div className="hidden sm:block w-px h-4 bg-[var(--theme-border-secondary)] mx-1.5" />
            <button onClick={onRefresh} className={iconBtnClass} title={t('htmlPreviewReload')}>
              <RotateCw size={18} strokeWidth={1.5} />
            </button>
          </>
        )}

        <button onClick={onDownload} className={iconBtnClass} title={t('htmlPreviewDownloadHtml')}>
          <Download size={18} strokeWidth={1.5} />
        </button>

        {viewMode === 'preview' && (
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
        )}

        <div className="hidden sm:block w-px h-4 bg-[var(--theme-border-secondary)] mx-1.5" />

        <button
          onClick={onToggleFullscreen}
          className={`${iconBtnClass} hidden sm:inline-flex`}
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
