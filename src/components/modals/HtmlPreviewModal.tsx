import React, { useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useWindowContext } from '@/contexts/WindowContext';
import { useI18n } from '@/contexts/I18nContext';
import { Z_INDEX_MODAL_BACKDROP } from '@/constants/layout';
import { useHtmlPreviewModal } from '@/hooks/ui/useHtmlPreviewModal';
import { HtmlPreviewHeader } from './html-preview/HtmlPreviewHeader';
import { HtmlPreviewContent } from './html-preview/HtmlPreviewContent';
import { CodeEditor } from '@/components/shared/CodeEditor';
import { Copy, Check, AlertTriangle, X } from 'lucide-react';
import { interpolate } from '@/i18n/interpolate';
import type { LiveArtifactFollowupPayload } from '@/utils/live-artifacts/liveArtifactFollowup';
import { DEFAULT_HTML_PREVIEW_PRIVILEGE, type HtmlPreviewPrivilege } from '@/utils/html-preview/previewPrivilege';

import { type UploadedFile } from '@/types';

interface HtmlPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  htmlContent: string | null;
  initialTrueFullscreenRequest?: boolean;
  privilege?: HtmlPreviewPrivilege;
  themeId?: string;
  baseFontSize?: number;
  onLiveArtifactFollowUp?: (payload: LiveArtifactFollowupPayload) => void;
  onImageClick?: (file: UploadedFile) => void;
}

export const HtmlPreviewModal: React.FC<HtmlPreviewModalProps> = ({
  isOpen,
  onClose,
  htmlContent,
  initialTrueFullscreenRequest,
  privilege = DEFAULT_HTML_PREVIEW_PRIVILEGE,
  themeId,
  baseFontSize,
  onLiveArtifactFollowUp,
  onImageClick,
}) => {
  const { t } = useI18n();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { document: targetDocument } = useWindowContext();
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const {
    isActuallyOpen,
    isTrueFullscreen,
    isDirectFullscreenLaunch,
    scale,
    isPreviewReady,
    contentHeight,
    isScreenshotting,
    viewMode,
    setViewMode,
    deviceMode,
    setDeviceMode,
    diagnostics,
    clearDiagnostics,
    handleZoomIn,
    handleZoomOut,
    handleDownload,
    handleScreenshot,
    handleRefresh,
    iframeRefreshKey,
    enterTrueFullscreen,
    exitTrueFullscreen,
    getPreviewTitle,
    MIN_ZOOM,
    MAX_ZOOM,
  } = useHtmlPreviewModal({
    isOpen,
    onClose,
    htmlContent,
    initialTrueFullscreenRequest,
    privilege,
    themeId,
    iframeRef,
    onLiveArtifactFollowUp: privilege === 'sanitized' ? onLiveArtifactFollowUp : undefined,
    onImageClick,
  });

  const handleCopyCode = useCallback(async () => {
    if (!htmlContent) return;
    try {
      await navigator.clipboard.writeText(htmlContent);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      // Ignore clipboard failure
    }
  }, [htmlContent]);

  if (!isActuallyOpen || !htmlContent) {
    return null;
  }

  const animationClass = isOpen
    ? initialTrueFullscreenRequest
      ? ''
      : 'modal-enter-animation'
    : 'modal-exit-animation';

  const containerClass = isDirectFullscreenLaunch
    ? `fixed inset-0 ${Z_INDEX_MODAL_BACKDROP} opacity-0 pointer-events-none`
    : `fixed inset-0 bg-black/80 flex items-center justify-center ${Z_INDEX_MODAL_BACKDROP}`;

  return createPortal(
    <div className={containerClass} role="dialog" aria-modal="true" aria-labelledby="html-preview-modal-title">
      <div
        className={`bg-[var(--theme-bg-secondary)] w-full h-full flex flex-col overflow-hidden relative ${animationClass}`}
      >
        <HtmlPreviewHeader
          title={getPreviewTitle()}
          privilege={privilege}
          scale={scale}
          isTrueFullscreen={isTrueFullscreen}
          isPreviewReady={isPreviewReady}
          isScreenshotting={isScreenshotting}
          minZoom={MIN_ZOOM}
          maxZoom={MAX_ZOOM}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          deviceMode={deviceMode}
          onDeviceModeChange={setDeviceMode}
          diagnosticCount={diagnostics.length}
          onToggleDiagnostics={() => setIsDiagnosticsOpen((prev) => !prev)}
          isDiagnosticsOpen={isDiagnosticsOpen}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onRefresh={handleRefresh}
          onDownload={handleDownload}
          onScreenshot={handleScreenshot}
          onToggleFullscreen={isTrueFullscreen ? exitTrueFullscreen : enterTrueFullscreen}
          onClose={onClose}
        />

        {viewMode === 'code' ? (
          <div className="flex-grow relative flex flex-col min-h-0 bg-[var(--theme-bg-code-block)]">
            <div className="flex items-center justify-between px-4 py-2 bg-[var(--theme-bg-secondary)] border-b border-[var(--theme-border-secondary)] text-xs font-mono text-[var(--theme-text-secondary)] shrink-0">
              <span className="font-semibold uppercase tracking-wider text-[11px] text-[var(--theme-text-tertiary)]">
                HTML
              </span>
              <button
                type="button"
                onClick={handleCopyCode}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--theme-bg-tertiary)] hover:bg-[var(--theme-bg-accent)]/10 text-[var(--theme-text-primary)] transition-colors border border-[var(--theme-border-secondary)] font-sans text-xs font-medium cursor-pointer"
                title={t('htmlPreviewCopyCode')}
              >
                {copiedCode ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
                <span>{copiedCode ? t('htmlPreviewCopied') : t('htmlPreviewCopyCode')}</span>
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              <CodeEditor value={htmlContent} onChange={() => {}} language="html" readOnly={true} />
            </div>
          </div>
        ) : (
          <HtmlPreviewContent
            key={iframeRefreshKey}
            iframeRef={iframeRef}
            htmlContent={htmlContent}
            scale={scale}
            contentHeight={contentHeight}
            privilege={privilege}
            themeId={themeId}
            baseFontSize={baseFontSize}
            deviceMode={deviceMode}
          />
        )}

        {isDiagnosticsOpen && diagnostics.length > 0 && viewMode === 'preview' && (
          <div className="absolute bottom-4 right-4 z-40 w-96 max-w-[calc(100vw-2rem)] rounded-xl border border-amber-500/30 bg-neutral-900/95 text-neutral-100 shadow-2xl backdrop-blur-md overflow-hidden flex flex-col text-xs font-mono animate-in fade-in slide-in-from-bottom-2 duration-200">
            <div className="flex items-center justify-between px-3 py-2 bg-amber-950/40 border-b border-amber-500/20">
              <div className="flex items-center gap-1.5 font-sans font-semibold text-amber-400">
                <AlertTriangle size={14} />
                <span>{interpolate(t('htmlPreviewRuntimeErrors'), { count: String(diagnostics.length) })}</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={clearDiagnostics}
                  className="px-2 py-0.5 rounded text-[11px] bg-white/10 hover:bg-white/20 text-neutral-300 transition-colors"
                >
                  {t('clear')}
                </button>
                <button
                  type="button"
                  onClick={() => setIsDiagnosticsOpen(false)}
                  className="p-1 rounded text-neutral-400 hover:text-white transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
            <div className="p-3 max-h-60 overflow-y-auto custom-scrollbar flex flex-col gap-2">
              {diagnostics.map((diag, idx) => (
                <div key={idx} className="p-2 rounded bg-white/5 border border-white/5 text-[11px] leading-relaxed">
                  <div className="text-rose-400 font-bold">{diag.message || diag.type}</div>
                  {diag.source && (
                    <div className="text-neutral-400 truncate mt-0.5">
                      {diag.source}
                      {diag.line !== undefined ? `:${diag.line}` : ''}
                      {diag.column !== undefined ? `:${diag.column}` : ''}
                    </div>
                  )}
                  {diag.url && <div className="text-neutral-400 truncate mt-0.5">URL: {diag.url}</div>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>,
    targetDocument.body,
  );
};
