import { logService } from '@/services/logService';
import React, { useRef, useState, useEffect, type RefObject } from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { buildHtmlPreviewSrcDoc } from '@/utils/html-preview/previewDocument';
import {
  DEFAULT_HTML_PREVIEW_PRIVILEGE,
  HTML_PREVIEW_SANDBOX,
  type HtmlPreviewPrivilege,
} from '@/utils/html-preview/previewPrivilege';
import type { HtmlPreviewDeviceMode } from '@/hooks/ui/useHtmlPreviewModal';

interface HtmlPreviewContentProps {
  iframeRef: RefObject<HTMLIFrameElement>;
  htmlContent: string;
  scale: number;
  contentHeight: number;
  privilege?: HtmlPreviewPrivilege;
  themeId?: string;
  baseFontSize?: number;
  deviceMode?: HtmlPreviewDeviceMode;
}

export const HtmlPreviewContent: React.FC<HtmlPreviewContentProps> = ({
  iframeRef,
  htmlContent,
  scale,
  contentHeight,
  privilege = DEFAULT_HTML_PREVIEW_PRIVILEGE,
  themeId,
  baseFontSize,
  deviceMode = 'desktop',
}) => {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const updateHeight = () => setContainerHeight(container.clientHeight);
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const iframeHeight = contentHeight > 0 ? `${Math.max(contentHeight, containerHeight) / scale}px` : `${100 / scale}%`;

  const handleIframeError = (event: React.SyntheticEvent<HTMLIFrameElement, Event>) => {
    logService.error('Iframe loading error:', event);
  };

  const isUnrestricted = privilege === 'unrestricted';
  const isDeviceFramed = deviceMode === 'tablet' || deviceMode === 'mobile';

  const frameInner = (
    <iframe
      ref={iframeRef}
      srcDoc={buildHtmlPreviewSrcDoc(htmlContent, { privilege, themeId, baseFontSize })}
      title={t('htmlPreviewIframeTitle')}
      className={`border-none shadow-sm origin-top-left flex-1 w-full ${isUnrestricted ? 'bg-white' : 'bg-[var(--theme-bg-primary)]'}`}
      style={{
        width: `${100 / scale}%`,
        height: iframeHeight,
        transform: `scale(${scale})`,
      }}
      sandbox={HTML_PREVIEW_SANDBOX[privilege]}
      allow={privilege === 'sanitized' ? 'clipboard-write' : undefined}
      onError={handleIframeError}
    />
  );

  return (
    <div
      ref={containerRef}
      className={`flex-grow relative overflow-auto custom-scrollbar bg-[var(--theme-bg-tertiary)] ${
        isDeviceFramed ? 'flex items-center justify-center p-3 sm:p-6' : ''
      }`}
    >
      {isUnrestricted && !isDeviceFramed && (
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.05]"
          style={{
            backgroundImage: `radial-gradient(var(--theme-text-tertiary) 1px, transparent 1px)`,
            backgroundSize: '20px 20px',
          }}
        />
      )}

      {deviceMode === 'mobile' ? (
        <div
          data-device-frame="mobile"
          className="w-full max-w-[375px] h-[calc(100%-1rem)] min-h-[580px] rounded-[36px] shadow-2xl border-4 border-neutral-700 dark:border-neutral-600 bg-[var(--theme-bg-primary)] overflow-hidden relative transition-all duration-300 ring-1 ring-black/20 flex flex-col shrink-0"
        >
          <div className="h-4 w-full bg-neutral-800 shrink-0 flex items-center justify-center">
            <div className="w-12 h-1 rounded-full bg-neutral-600/70" />
          </div>
          <div className="flex-1 min-h-0 w-full relative flex flex-col overflow-auto custom-scrollbar">
            {frameInner}
          </div>
        </div>
      ) : deviceMode === 'tablet' ? (
        <div
          data-device-frame="tablet"
          className="w-full max-w-[768px] h-[calc(100%-1rem)] min-h-[500px] rounded-2xl shadow-2xl border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-primary)] overflow-hidden relative transition-all duration-300 ring-1 ring-black/10 flex flex-col shrink-0"
        >
          <div className="flex-1 min-h-0 w-full relative flex flex-col overflow-auto custom-scrollbar">
            {frameInner}
          </div>
        </div>
      ) : (
        frameInner
      )}
    </div>
  );
};
