import React, { Suspense, useState, useEffect, useRef, useCallback } from 'react';
import { X, Code, Eye, Download, FileCode2, type LucideIcon } from 'lucide-react';
import { type SideViewContent } from '@/types';
import { createManagedObjectUrl } from '@/services/objectUrlManager';
import { triggerDownload, sanitizeFilename } from '@/utils/export/core';
import { useIsMobile } from '@/hooks/useDevice';
import { FOCUS_VISIBLE_RING_PRIMARY_OFFSET_CLASS } from '@/constants/focusClasses';
import { Z_INDEX_SIDE_PANEL_MOBILE, Z_INDEX_TOPMOST_OVERLAY } from '@/constants/layout';
import { useI18n } from '@/contexts/I18nContext';
import { lazyNamedComponent } from '@/utils/lazyNamedComponent';
import { buildHtmlPreviewSrcDoc } from '@/utils/html-preview/previewDocument';
import { HTML_PREVIEW_SANDBOX } from '@/utils/html-preview/previewPrivilege';
import { useHtmlPreviewGraphvizRelay } from '@/hooks/ui/useHtmlPreviewGraphvizRelay';

interface PanelTabButtonProps {
  activeTab: 'code' | 'preview';
  id: 'code' | 'preview';
  icon: LucideIcon;
  label: string;
  onSelect: (id: 'code' | 'preview') => void;
}

const PanelTabButton: React.FC<PanelTabButtonProps> = ({ activeTab, id, icon: Icon, label, onSelect }) => (
  <button
    onClick={() => onSelect(id)}
    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
      activeTab === id
        ? 'bg-[var(--theme-bg-secondary)] text-[var(--theme-text-primary)] shadow-sm'
        : 'text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-secondary)] hover:bg-[var(--theme-bg-secondary)]/50'
    }`}
  >
    <Icon size={14} strokeWidth={1.5} />
    <span className="hidden sm:inline">{label}</span>
  </button>
);

const LazyMermaidBlock = lazyNamedComponent(() => import('@/components/message/blocks/MermaidBlock'), 'MermaidBlock');
const LazyGraphvizBlock = lazyNamedComponent(
  () => import('@/components/message/blocks/GraphvizBlock'),
  'GraphvizBlock',
);
const LazyCodeEditor = lazyNamedComponent(() => import('@/components/shared/CodeEditor'), 'CodeEditor');

interface SidePanelProps {
  content: SideViewContent | null;
  onClose: () => void;
  themeId: string;
}

export const SidePanel: React.FC<SidePanelProps> = ({ content, onClose, themeId }) => {
  const { t } = useI18n();
  const [localCode, setLocalCode] = useState(content?.content || '');
  const [debouncedCode, setDebouncedCode] = useState(content?.content || '');
  const [activeTab, setActiveTab] = useState<'code' | 'preview'>('preview');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  useHtmlPreviewGraphvizRelay({
    iframeRef,
    privilege: 'unrestricted',
    themeId,
    enabled: content?.type === 'html',
  });

  const [width, setWidth] = useState(600);
  const [isResizing, setIsResizing] = useState(false);
  const isResizingRef = useRef(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  const isMobile = useIsMobile();

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedCode(localCode);
    }, 1000);
    return () => clearTimeout(timer);
  }, [localCode]);

  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    isResizingRef.current = true;
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
    isResizingRef.current = false;
  }, []);

  const resize = useCallback((mouseEvent: MouseEvent) => {
    if (isResizingRef.current) {
      const newWidth = window.innerWidth - mouseEvent.clientX;
      if (newWidth > 300 && newWidth < window.innerWidth * 0.9) {
        setWidth(newWidth);
      }
    }
  }, []);

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', resize);
      window.addEventListener('mouseup', stopResizing);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, resize, stopResizing]);

  if (!content) return null;

  const handleDownload = () => {
    const ext = content.type === 'html' ? 'html' : content.type === 'mermaid' ? 'mmd' : 'txt';
    const blob = new Blob([localCode], { type: 'text/plain' });
    const url = createManagedObjectUrl(blob);
    triggerDownload(url, `${sanitizeFilename(content.title || 'snippet')}.${ext}`);
  };

  const previewFallback = (
    <div className="w-full h-full flex items-center justify-center text-[var(--theme-text-secondary)]">
      {t('sidePanelLoadingPreview')}
    </div>
  );

  const renderPreview = () => {
    if (content.type === 'html') {
      return (
        <div className="w-full h-full relative bg-white">
          <iframe
            ref={iframeRef}
            className="w-full h-full border-0 block"
            // Match the code-block preview modal: unrestricted rendering (not Live Artifacts).
            sandbox={HTML_PREVIEW_SANDBOX.unrestricted}
            title={t('sidePanelLivePreview')}
            srcDoc={buildHtmlPreviewSrcDoc(debouncedCode, { privilege: 'unrestricted' })}
          />
        </div>
      );
    }
    if (content.type === 'mermaid') {
      return (
        <div className="w-full h-full overflow-auto bg-white dark:bg-[#0d1117] p-4 flex items-center justify-center">
          <div className="w-full flex justify-center">
            <Suspense fallback={previewFallback}>
              <LazyMermaidBlock
                code={debouncedCode}
                onImageClick={() => {}}
                isLoading={false}
                themeId={themeId}
                onOpenSidePanel={() => {}}
              />
            </Suspense>
          </div>
        </div>
      );
    }
    if (content.type === 'graphviz') {
      return (
        <div className="w-full h-full overflow-auto bg-white dark:bg-[#0d1117] p-4 flex items-center justify-center">
          <div className="w-full flex justify-center">
            <Suspense fallback={previewFallback}>
              <LazyGraphvizBlock
                code={debouncedCode}
                onImageClick={() => {}}
                isLoading={false}
                themeId={themeId}
                onOpenSidePanel={() => {}}
              />
            </Suspense>
          </div>
        </div>
      );
    }
    return (
      <div className="p-4 text-[var(--theme-text-tertiary)] flex items-center justify-center h-full">
        {t('sidePanelPreviewUnsupported')}
      </div>
    );
  };

  const editorLanguage =
    content.language ||
    (content.type === 'html'
      ? 'html'
      : content.type === 'mermaid'
        ? 'mermaid'
        : content.type === 'graphviz'
          ? 'dot'
          : content.type === 'svg'
            ? 'xml'
            : 'plaintext');

  const isHtml = content.type === 'html';

  const PreviewIcon = isHtml ? FileCode2 : Eye;
  const previewLabel = isHtml ? 'HTML' : t('preview');

  return (
    <>
      {isResizing && (
        <div
          className={`fixed inset-0 ${Z_INDEX_TOPMOST_OVERLAY} bg-transparent cursor-col-resize`}
          style={{ touchAction: 'none' }}
        />
      )}

      <div
        ref={sidebarRef}
        className={`
                    h-full flex flex-col bg-[var(--theme-bg-secondary)] border-l border-[var(--theme-border-primary)] shadow-2xl relative transition-none flex-shrink-0 z-40 slide-in-right-animate
                    ${isMobile ? `fixed inset-0 w-full ${Z_INDEX_SIDE_PANEL_MOBILE}` : ''}
                `}
        style={{ width: isMobile ? '100%' : `${width}px` }}
      >
        {!isMobile && (
          <div
            onMouseDown={startResizing}
            className={`
                            absolute left-0 top-0 bottom-0 w-1.5 -ml-0.5 z-50 cursor-col-resize 
                            flex items-center justify-center group transition-colors hover:bg-[var(--theme-bg-accent)]
                            ${isResizing ? 'bg-[var(--theme-bg-accent)]' : 'bg-transparent'}
                        `}
            title={t('sidePanelDragResize')}
          />
        )}

        <div className="flex items-center justify-between px-4 h-14 border-b border-[var(--theme-border-secondary)] bg-[var(--theme-bg-primary)] flex-shrink-0">
          <div className="flex bg-[var(--theme-bg-input)] p-1 rounded-lg border border-[var(--theme-border-secondary)] flex-shrink-0">
            <PanelTabButton
              activeTab={activeTab}
              id="preview"
              icon={PreviewIcon}
              label={previewLabel}
              onSelect={setActiveTab}
            />
            <PanelTabButton
              activeTab={activeTab}
              id="code"
              icon={Code}
              label={t('sidePanelCodeTab')}
              onSelect={setActiveTab}
            />
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={handleDownload}
              className={`p-2 text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] rounded-lg transition-colors ${FOCUS_VISIBLE_RING_PRIMARY_OFFSET_CLASS}`}
              title={t('sidePanelDownloadCode')}
            >
              <Download size={16} strokeWidth={1.5} />
            </button>
            <button
              onClick={onClose}
              className={`p-2 text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] rounded-lg transition-colors ${FOCUS_VISIBLE_RING_PRIMARY_OFFSET_CLASS}`}
              title={t('sidePanelClose')}
            >
              <X size={18} strokeWidth={1.5} />
            </button>
          </div>
        </div>

        <div className="flex-grow flex flex-col min-h-0 bg-[var(--theme-bg-primary)] relative">
          <div
            className={`absolute inset-0 transition-opacity duration-200 ${activeTab === 'code' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}
          >
            <Suspense fallback={previewFallback}>
              <LazyCodeEditor value={localCode} onChange={setLocalCode} language={editorLanguage} />
            </Suspense>
          </div>
          <div
            className={`absolute inset-0 transition-opacity duration-200 ${activeTab === 'preview' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}
          >
            {renderPreview()}
          </div>
        </div>
      </div>
    </>
  );
};
