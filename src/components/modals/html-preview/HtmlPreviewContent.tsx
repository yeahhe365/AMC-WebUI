import { logService } from '@/services/logService';
import React, { useRef, useState, useEffect, type RefObject } from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { buildHtmlPreviewSrcDoc } from '@/utils/html-preview/previewDocument';
import {
  DEFAULT_HTML_PREVIEW_PRIVILEGE,
  HTML_PREVIEW_SANDBOX,
  type HtmlPreviewPrivilege,
} from '@/utils/html-preview/previewPrivilege';

interface HtmlPreviewContentProps {
  iframeRef: RefObject<HTMLIFrameElement>;
  htmlContent: string;
  scale: number;
  contentHeight: number;
  privilege?: HtmlPreviewPrivilege;
  themeId?: string;
  baseFontSize?: number;
}

export const HtmlPreviewContent: React.FC<HtmlPreviewContentProps> = ({
  iframeRef,
  htmlContent,
  scale,
  contentHeight,
  privilege = DEFAULT_HTML_PREVIEW_PRIVILEGE,
  themeId,
  baseFontSize,
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

  return (
    <div ref={containerRef} className="flex-grow relative overflow-auto custom-scrollbar bg-[var(--theme-bg-tertiary)]">
      {isUnrestricted && (
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.05]"
          style={{
            backgroundImage: `radial-gradient(var(--theme-text-tertiary) 1px, transparent 1px)`,
            backgroundSize: '20px 20px',
          }}
        />
      )}

      <iframe
        ref={iframeRef}
        srcDoc={buildHtmlPreviewSrcDoc(htmlContent, { privilege, themeId, baseFontSize })}
        title={t('htmlPreviewIframeTitle')}
        className={`border-none shadow-sm origin-top-left ${isUnrestricted ? 'bg-white' : 'bg-[var(--theme-bg-primary)]'}`}
        style={{
          width: `${100 / scale}%`,
          height: iframeHeight,
          transform: `scale(${scale})`,
        }}
        sandbox={HTML_PREVIEW_SANDBOX[privilege]}
        allow={privilege === 'sanitized' ? 'clipboard-write' : undefined}
        onError={handleIframeError}
      />
    </div>
  );
};
