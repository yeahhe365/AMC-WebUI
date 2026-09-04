import { logService } from '@/services/logService';
import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { Loader2, Repeat } from 'lucide-react';
import { type SideViewContent, type UploadedFile } from '@/types';
import { MESSAGE_BLOCK_BUTTON_CLASS } from '@/constants/buttonClasses';
import { DiagramWrapper } from './parts/DiagramWrapper';
import { useI18n } from '@/contexts/I18nContext';
import { getVizInstance, renderDotToSvgCached } from '@/features/graphviz/vizRuntime';
import { interpolate } from '@/i18n/interpolate';
import { svgToUploadedFile } from '@/utils/export/svgToUploadedFile';
import { useDebouncedDiagramRender } from '@/hooks/diagram/useDebouncedDiagramRender';
import { useDiagramExport } from '@/hooks/diagram/useDiagramExport';

const GRAPHVIZ_EXPORT_SCALE = 5;

interface GraphvizBlockProps {
  code: string;
  onImageClick: (file: UploadedFile) => void;
  isLoading: boolean;
  themeId: string;
  onOpenSidePanel: (content: SideViewContent) => void;
  renderDelayMs?: number;
}

export const GraphvizBlock: React.FC<GraphvizBlockProps> = ({
  code,
  onImageClick,
  isLoading: isMessageLoading,
  themeId,
  onOpenSidePanel,
  renderDelayMs = 500,
}) => {
  const { t } = useI18n();
  const [manualLayout, setManualLayout] = useState<'LR' | 'TB' | null>(null);

  const effectiveLayout = useMemo<'LR' | 'TB'>(() => {
    if (manualLayout) return manualLayout;
    const match = code.match(/rankdir\s*=\s*(["']?)(LR|TB|RL|BT)\1/i);
    if (match) {
      const dir = match[2].toUpperCase();
      if (dir === 'TB' || dir === 'BT') return 'TB';
      if (dir === 'LR' || dir === 'RL') return 'LR';
    }
    return 'LR';
  }, [code, manualLayout]);

  const [svgContent, setSvgContent] = useState('');
  const [error, setError] = useState('');
  const [isRendering, setIsRendering] = useState(true);

  const [diagramFile, setDiagramFile] = useState<UploadedFile | null>(null);
  const [showSource, setShowSource] = useState(false);

  const diagramContainerRef = useRef<HTMLDivElement>(null);

  // Warm the viz-js runtime (WASM chunk) on mount so the first diagram render
  // does not block on the network fetch.
  useEffect(() => {
    getVizInstance().catch((error) => {
      logService.error('Failed to initialize Viz', error);
    });
  }, []);

  const renderGraph = useCallback(async () => {
    if (!code) {
      setSvgContent('');
      setError('');
      setIsRendering(false);
      return;
    }

    setIsRendering(true);

    const result = await renderDotToSvgCached(code, {
      themeId,
      layout: effectiveLayout,
      preserveAuthorColors: true,
    });

    if (result.ok) {
      setSvgContent(result.svg);
      setDiagramFile(
        svgToUploadedFile(result.svg, {
          id: `graphviz-svg-${Math.random().toString(36).substring(2, 9)}`,
          name: 'graphviz-diagram.svg',
        }),
      );
      setError('');
      setIsRendering(false);
      return;
    }

    // Streaming messages keep the spinner up until the stream settles; final
    // messages surface the error fallback.
    if (isMessageLoading) {
      setIsRendering(true);
    } else {
      const errorMessage =
        result.error === 'render-failed'
          ? result.message.replace(/.*error:\s*/i, '')
          : t('diagramRenderGraphvizFailed');
      setError(errorMessage);
      setSvgContent('');
      setIsRendering(false);
    }
  }, [code, effectiveLayout, isMessageLoading, t, themeId]);

  const renderGraphWithLogging = useCallback(() => {
    renderGraph().catch((error) => {
      logService.error('Failed to render Graphviz diagram', error);
    });
  }, [renderGraph]);

  useDebouncedDiagramRender(renderGraphWithLogging, renderDelayMs);

  const handleToggleLayout = () => {
    setManualLayout(effectiveLayout === 'LR' ? 'TB' : 'LR');
  };

  const { isDownloading, handleDownloadJpg } = useDiagramExport({
    svg: svgContent,
    filenamePrefix: 'graphviz',
    scale: GRAPHVIZ_EXPORT_SCALE,
    onError: setError,
    fallbackErrorMessage: t('diagramExportFailed'),
  });

  const layoutToggleBtn = (
    <button
      onClick={handleToggleLayout}
      disabled={isRendering}
      className={MESSAGE_BLOCK_BUTTON_CLASS}
      title={interpolate(t('diagramToggleLayout'), { layout: effectiveLayout })}
    >
      {isRendering ? <Loader2 size={14} className="animate-spin" /> : <Repeat size={14} />}
    </button>
  );

  return (
    <DiagramWrapper
      title="Graphviz"
      code={code}
      error={error}
      isRendering={isRendering}
      isDownloading={isDownloading}
      diagramFile={diagramFile}
      showSource={showSource}
      setShowSource={setShowSource}
      onImageClick={onImageClick}
      onDownloadJpg={handleDownloadJpg}
      onOpenSidePanel={() => onOpenSidePanel({ type: 'graphviz', content: code, title: t('diagramGraphvizTitle') })}
      themeId={themeId}
      containerRef={diagramContainerRef}
      extraActions={layoutToggleBtn}
    >
      <div className="w-full overflow-x-auto custom-scrollbar" dangerouslySetInnerHTML={{ __html: svgContent }} />
    </DiagramWrapper>
  );
};
