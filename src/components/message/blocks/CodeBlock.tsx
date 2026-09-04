import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, X, Terminal, AlertTriangle, FileOutput, RotateCcw } from 'lucide-react';
import { type SideViewContent } from '@/types';
import { type OpenHtmlPreviewHandler } from '@/utils/html-preview/previewPrivilege';
import { useCodeBlock } from '@/hooks/ui/useCodeBlock';
import { usePyodide } from '@/features/local-python/usePyodide';
import { CodeHeader } from './parts/CodeHeader';
import { ArtifactFrame } from './ArtifactFrame';
import { extractTextFromNode } from '@/utils/reactNodeText';
import { isImageMimeType } from '@/utils/file/fileTypeClassification';
import { createManagedObjectUrl, releaseManagedObjectUrl } from '@/services/objectUrlManager';
import { FileDisplay } from '@/components/message/FileDisplay';
import { useI18n } from '@/contexts/I18nContext';
import { logService } from '@/services/logService';
import {
  isLikelyStreamingLiveArtifactInteractionJson,
  isLiveArtifactInteractionLanguage,
  isLiveArtifactLanguage,
} from '@/utils/previewableMarkdown';
import type { LiveArtifactFollowupPayload } from '@/utils/live-artifacts/liveArtifactFollowup';
import {
  diagnoseLiveArtifactInteraction,
  hasLiveArtifactInteractionShape,
} from '@/utils/live-artifacts/liveArtifactInteraction';
import { LiveArtifactInteractionFrame } from './LiveArtifactInteractionFrame';
import { LiveArtifactInteractionDiagnostic } from './LiveArtifactInteractionDiagnostic';

interface CodeBlockProps {
  children: React.ReactNode;
  cacheKey?: string;
  className?: string;
  onOpenHtmlPreview: OpenHtmlPreviewHandler;
  expandCodeBlocksByDefault: boolean;
  onOpenSidePanel: (content: SideViewContent) => void;
  showPreviewControls?: boolean;
  isLoading?: boolean;
  liveArtifactFontSize?: number;
  themeId?: string;
  onLiveArtifactFollowUp?: (payload: LiveArtifactFollowupPayload) => void;
  liveArtifactsMode?: boolean;
  /** Hides the local Pyodide run button — used for server-executed code blocks. */
  disableRun?: boolean;
}

type GeneratedFileEntry = {
  id: string;
  name: string;
  type: string;
  size: number;
  dataUrl: string;
  uploadState: 'active';
};

const LiveArtifactInteractionPendingFrame: React.FC<{ label: string; baseFontSize?: number }> = ({
  label,
  baseFontSize,
}) => (
  <div
    data-live-artifact-interaction-pending="true"
    aria-label={label}
    aria-live="polite"
    className="my-3 rounded-lg border border-[var(--theme-border-primary)] bg-[var(--theme-bg-model-message)] p-4 shadow-sm"
    style={baseFontSize ? { fontSize: `${baseFontSize}px` } : undefined}
  >
    <div className="space-y-3">
      <div className="h-3 w-40 rounded bg-[var(--theme-border-secondary)] animate-pulse" />
      <div className="grid gap-2">
        <div className="h-9 rounded-md border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-primary)] animate-pulse" />
        <div className="h-9 rounded-md border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-primary)] animate-pulse" />
      </div>
      <div className="ml-auto h-8 w-24 rounded-md bg-[var(--theme-bg-accent)]/40 animate-pulse" />
    </div>
  </div>
);

export const CodeBlock: React.FC<CodeBlockProps> = (props) => {
  const { t } = useI18n();
  const {
    preRef,
    isExpanded,
    isOverflowing,
    isCopied,
    sourceLanguage,
    finalLanguage,
    showPreview,
    handleToggleExpand,
    handleCopy,
    handleOpenSide,
    handleOpenPreview,
    handleDownload,
    codeElement,
    resolvedCodeText,
    previewMarkupType,
    COLLAPSE_THRESHOLD_PX,
  } = useCodeBlock(props);

  const isPython = finalLanguage.toLowerCase() === 'python' || finalLanguage.toLowerCase() === 'py';

  const rawCode = useMemo(() => {
    if (!isPython) return '';
    if (codeElement) {
      return extractTextFromNode(codeElement.props.children);
    }
    return extractTextFromNode(props.children);
  }, [codeElement, props.children, isPython]);

  const { isRunning, output, image, files, error, hasRun, runCode, clearOutput, resetState } = usePyodide(
    props.cacheKey,
  );

  const handleRun = () => {
    if (rawCode) runCode(rawCode);
  };

  // Object URLs are external resources — create/release only in effects so Strict
  // Mode / concurrent discarded renders cannot leave unreclaimed blob: URLs.
  // setState here is intentional: URLs must not be allocated during render.
  const [generatedFiles, setGeneratedFiles] = useState<GeneratedFileEntry[]>([]);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    const nextEntries = files.map((file, fileIndex) => {
      const blob = new Blob([file.data], { type: file.type });
      return {
        id: `generated-file-${fileIndex}`,
        name: file.name,
        type: file.type,
        size: file.data.byteLength,
        dataUrl: createManagedObjectUrl(blob),
        uploadState: 'active' as const,
      };
    });

    setGeneratedFiles(nextEntries);
    return () => {
      for (const entry of nextEntries) {
        releaseManagedObjectUrl(entry.dataUrl);
      }
    };
  }, [files]);

  useEffect(() => {
    const url = image ? createManagedObjectUrl(new Blob([image], { type: 'image/png' })) : null;

    setImageUrl(url);
    return () => {
      if (url) {
        releaseManagedObjectUrl(url);
      }
    };
  }, [image]);

  const displayInlineImage = imageUrl && !generatedFiles.some((file) => isImageMimeType(file.type)) ? imageUrl : null;
  const isInteractive = props.showPreviewControls ?? true;
  const showPreviewControls = isInteractive && showPreview;
  const isInteractionFence = isLiveArtifactInteractionLanguage(sourceLanguage);
  const isLikelyJsonShape = isInteractionFence || hasLiveArtifactInteractionShape(resolvedCodeText);
  // The diagnostic/repair pass is only consumed for interaction fences or
  // ```json blocks while Live Artifacts mode is on. Skip it otherwise so a
  // session with LA disabled does not pay a full spec parse on every ```json
  // code block (the bare-JSON wrapping already gated this the same way).
  const shouldDiagnoseInteraction = isLikelyJsonShape && (isInteractionFence || props.liveArtifactsMode);

  const diagnosis = useMemo(() => {
    if (!shouldDiagnoseInteraction || !resolvedCodeText) return null;
    return diagnoseLiveArtifactInteraction(resolvedCodeText);
  }, [resolvedCodeText, shouldDiagnoseInteraction]);

  const interactionSpec = diagnosis?.spec ?? null;

  // Log rejected specs for observability
  useEffect(() => {
    if (diagnosis && diagnosis.errors.length > 0 && props.cacheKey) {
      logService.warn('Live Artifact interaction spec rejected', {
        cacheKey: props.cacheKey,
        codes: diagnosis.errors.map((e) => e.code),
        fenceLanguage: isInteractionFence ? 'amc-live-artifact-interaction' : 'json',
      });
    }
  }, [diagnosis, props.cacheKey, isInteractionFence]);

  const isStreamingInteractionCandidate =
    isInteractionFence && Boolean(props.isLoading) && isLikelyStreamingLiveArtifactInteractionJson(resolvedCodeText);
  // Fenced Live Artifacts (amc-live-artifact-html) always go through ArtifactFrame.
  // Do not gate on isLikelyHtml: that helper rejects common fragments that include
  // <style> tags or are only partially closed while streaming, which used to leave
  // a blank/missing preview even though the fence language is authoritative.
  const showInlineHtmlPreview =
    showPreviewControls &&
    isLiveArtifactLanguage(sourceLanguage) &&
    previewMarkupType === 'html' &&
    (resolvedCodeText.trim().length > 0 || Boolean(props.isLoading));

  // Streaming pending frame: partial JSON during streaming takes priority over diagnostic
  // (incomplete JSON will fail parse and produce errors, but we want the skeleton, not a diagnosis).
  if (isInteractive && isStreamingInteractionCandidate) {
    return <LiveArtifactInteractionPendingFrame label={t('thinkingText')} baseFontSize={props.liveArtifactFontSize} />;
  }

  // Render diagnostic card when the spec failed validation (amc-live-artifact-interaction fence
  // OR ```json with liveArtifactsMode enabled).
  if (isInteractive && diagnosis && diagnosis.errors.length > 0 && (isInteractionFence || props.liveArtifactsMode)) {
    return (
      <LiveArtifactInteractionDiagnostic
        diagnosis={diagnosis}
        rawJson={resolvedCodeText}
        baseFontSize={props.liveArtifactFontSize}
        onFollowUp={props.onLiveArtifactFollowUp}
      />
    );
  }

  // Render the form when the spec parsed successfully (amc-live-artifact-interaction fence
  // OR ```json with liveArtifactsMode enabled).
  if (isInteractive && interactionSpec && (isInteractionFence || props.liveArtifactsMode)) {
    return (
      <LiveArtifactInteractionFrame
        spec={interactionSpec}
        baseFontSize={props.liveArtifactFontSize}
        onFollowUp={props.onLiveArtifactFollowUp}
      />
    );
  }

  if (showInlineHtmlPreview) {
    return (
      <ArtifactFrame
        html={resolvedCodeText}
        cacheKey={props.cacheKey}
        isLoading={props.isLoading}
        baseFontSize={props.liveArtifactFontSize}
        themeId={props.themeId}
        onFollowUp={props.onLiveArtifactFollowUp}
        onOpenPreview={() =>
          props.onOpenHtmlPreview(resolvedCodeText, {
            privilege: 'sanitized',
            themeId: props.themeId,
            baseFontSize: props.liveArtifactFontSize,
          })
        }
      />
    );
  }

  return (
    <div className="group relative my-3 rounded-lg border border-[var(--theme-border-primary)] bg-[var(--theme-bg-code-block)] shadow-sm">
      <CodeHeader
        language={finalLanguage}
        showPreview={showPreviewControls}
        isOverflowing={isOverflowing}
        isExpanded={isExpanded}
        isCopied={isCopied}
        onToggleExpand={handleToggleExpand}
        onCopy={handleCopy}
        onDownload={handleDownload}
        onOpenSide={handleOpenSide}
        onOpenPreview={handleOpenPreview}
        canRun={isPython && !props.disableRun}
        isRunning={isRunning}
        onRun={handleRun}
      />

      <div className="relative">
        <pre
          ref={preRef}
          className={`${props.className} group !m-0 !p-0 !border-none !rounded-none !bg-transparent custom-scrollbar !overflow-x-auto`}
          style={{
            overflowY: isExpanded || !isOverflowing ? 'visible' : 'hidden',
            maxHeight: isExpanded || !isOverflowing ? 'none' : `${COLLAPSE_THRESHOLD_PX}px`,
          }}
        >
          {codeElement ? (
            React.cloneElement(codeElement as React.ReactElement, {
              className: `${codeElement.props.className || ''} !p-4 ${isOverflowing ? '!pb-14' : ''} !block font-mono text-[13px] sm:text-sm leading-relaxed !cursor-text`,
              onClick: undefined,
              title: undefined,
            })
          ) : (
            <span className={`block p-4 font-mono text-sm ${isOverflowing ? 'pb-14' : ''}`}>{props.children}</span>
          )}
        </pre>

        {isOverflowing && !isExpanded && (
          <div
            className="absolute bottom-0 left-0 right-0 h-20 select-none bg-gradient-to-t from-[var(--theme-bg-code-block)] to-transparent cursor-pointer flex items-end justify-center pb-2 group/expand code-block-expand-overlay"
            onClick={handleToggleExpand}
          >
            <span className="text-xs font-medium text-[var(--theme-text-tertiary)] group-hover/expand:text-[var(--theme-text-primary)] flex items-center gap-1 bg-[var(--theme-bg-primary)] px-3 py-1 rounded-full shadow-sm border border-[var(--theme-border-secondary)] transition-colors">
              <ChevronDown size={12} /> {t('codeShowMore')}
            </span>
          </div>
        )}
        {isOverflowing && isExpanded && (
          <div className="absolute bottom-4 left-0 right-0 flex select-none justify-center pointer-events-none z-10 code-block-expand-overlay">
            <button
              onClick={handleToggleExpand}
              className="pointer-events-auto flex items-center gap-1.5 px-3 py-1.5 bg-[var(--theme-bg-primary)] hover:bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border-secondary)] rounded-full text-xs font-medium text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-primary)] shadow-sm transition-colors"
              title={t('codeCollapseBlock')}
            >
              <ChevronUp size={12} strokeWidth={2} /> {t('codeShowLess')}
            </button>
          </div>
        )}
      </div>

      {hasRun && (
        <div className="border-t border-[var(--theme-border-secondary)] bg-[var(--theme-bg-primary)] rounded-b-lg overflow-hidden animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="flex select-none items-center justify-between px-3 py-1.5 bg-[var(--theme-bg-tertiary)]/50">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--theme-text-tertiary)] flex items-center gap-1.5">
              <Terminal size={12} /> {t('codeLocalPythonOutput')}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={resetState}
                className="p-1 rounded-md text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-secondary)] transition-colors"
                title={t('codeResetView')}
              >
                <RotateCcw size={12} />
              </button>
              <button
                onClick={clearOutput}
                className="p-1 rounded-md text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-secondary)] transition-colors"
                title={t('codeCloseConsole')}
              >
                <X size={12} />
              </button>
            </div>
          </div>

          <div className="p-3 max-h-[400px] overflow-auto custom-scrollbar">
            {error && (
              <div className="text-red-500 text-xs font-mono whitespace-pre-wrap mb-2 flex gap-2">
                <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {output && (
              <div className="text-[var(--theme-text-primary)] text-xs font-mono whitespace-pre-wrap leading-relaxed opacity-90 mb-2">
                {output}
              </div>
            )}

            {displayInlineImage && (
              <div className="mt-2 mb-2 rounded-lg overflow-hidden border border-[var(--theme-border-secondary)] inline-block bg-white">
                <img src={displayInlineImage} alt={t('codePlotAlt')} className="max-w-full h-auto block" />
              </div>
            )}

            {generatedFiles.length > 0 && (
              <div className="mt-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--theme-text-tertiary)] flex select-none items-center gap-1.5 mb-2">
                  <FileOutput size={12} /> {t('codeGeneratedFiles')}
                </span>
                <div className="flex flex-wrap gap-2">
                  {generatedFiles.map((file) => (
                    <FileDisplay
                      key={file.id}
                      file={file}
                      isFromMessageList={true}
                      isGemini3={false} // Disable extra edit controls for generated files
                    />
                  ))}
                </div>
              </div>
            )}

            {!error && !output && !displayInlineImage && generatedFiles.length === 0 && !isRunning && (
              <div className="text-[var(--theme-text-tertiary)] text-xs italic">{t('codeExecutedNoOutput')}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
