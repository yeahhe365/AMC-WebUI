import React, { useCallback, useRef, useState } from 'react';
import mermaid from 'mermaid';
import DOMPurify from 'dompurify';
import { type SideViewContent, type UploadedFile } from '@/types';
import { DiagramWrapper } from './parts/DiagramWrapper';
import { useI18n } from '@/contexts/I18nContext';
import { isDarkThemeId } from '@/utils/themeMode';
import { svgToUploadedFile } from '@/utils/export/svgToUploadedFile';
import { useDebouncedDiagramRender } from '@/hooks/diagram/useDebouncedDiagramRender';
import { useDiagramExport } from '@/hooks/diagram/useDiagramExport';

// Strip script tags and event handlers from mermaid-rendered SVG before injection.
// With securityLevel 'strict', mermaid already escapes HTML labels; this is a
// defense-in-depth guard against any residual script/foreignObject injection.
const sanitizeMermaidSvg = (svg: string): string =>
  DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_TAGS: ['foreignObject'],
    FORBID_TAGS: ['script'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover'],
  });

interface MermaidBlockProps {
  code: string;
  onImageClick: (file: UploadedFile) => void;
  isLoading: boolean;
  themeId: string;
  onOpenSidePanel: (content: SideViewContent) => void;
  renderDelayMs?: number;
}

export const MermaidBlock: React.FC<MermaidBlockProps> = ({
  code,
  onImageClick,
  isLoading: isMessageLoading,
  themeId,
  onOpenSidePanel,
  renderDelayMs = 500,
}) => {
  const { t } = useI18n();
  const [svg, setSvg] = useState('');
  const [error, setError] = useState('');
  const [isRendering, setIsRendering] = useState(true);
  const [diagramFile, setDiagramFile] = useState<UploadedFile | null>(null);
  const [showSource, setShowSource] = useState(false);
  const diagramContainerRef = useRef<HTMLDivElement>(null);

  const renderMermaid = useCallback(
    async (isMounted: () => boolean) => {
      if (!code) return;

      try {
        const id = `mermaid-svg-${Math.random().toString(36).substring(2, 9)}`;

        mermaid.initialize({
          startOnLoad: false,
          theme: isDarkThemeId(themeId) ? 'dark' : 'default',
          securityLevel: 'strict',
          fontFamily: 'inherit',
        });

        const { svg: renderedSvg } = await mermaid.render(id, code);

        if (!isMounted()) return;

        const sanitizedSvg = sanitizeMermaidSvg(renderedSvg);
        setSvg(sanitizedSvg);

        setDiagramFile(
          // Size intentionally mirrors the raw render output (pre-sanitization).
          svgToUploadedFile(sanitizedSvg, { id, name: 'mermaid-diagram.svg', size: renderedSvg.length }),
        );
        setError('');
        setIsRendering(false);
      } catch (error) {
        if (!isMounted()) return;

        if (isMessageLoading) {
          setIsRendering(true);
        } else {
          const errorMessage = error instanceof Error ? error.message : t('diagramRenderMermaidFailed');
          setError(errorMessage.replace(/.*error:\s*/, ''));
          setSvg('');
          setIsRendering(false);
        }
      }
    },
    [code, isMessageLoading, themeId, t],
  );

  useDebouncedDiagramRender(renderMermaid, renderDelayMs);

  const { isDownloading, handleDownloadJpg } = useDiagramExport({
    svg,
    filenamePrefix: 'mermaid',
    scale: 3,
    onError: setError,
    fallbackErrorMessage: t('diagramExportJpgFailed'),
  });

  return (
    <DiagramWrapper
      title="Mermaid"
      code={code}
      error={error}
      isRendering={isRendering}
      isDownloading={isDownloading}
      diagramFile={diagramFile}
      showSource={showSource}
      setShowSource={setShowSource}
      onImageClick={onImageClick}
      onDownloadJpg={handleDownloadJpg}
      onOpenSidePanel={() => onOpenSidePanel({ type: 'mermaid', content: code, title: t('diagramMermaidTitle') })}
      themeId={themeId}
      containerRef={diagramContainerRef}
    >
      <div dangerouslySetInnerHTML={{ __html: svg }} />
    </DiagramWrapper>
  );
};
