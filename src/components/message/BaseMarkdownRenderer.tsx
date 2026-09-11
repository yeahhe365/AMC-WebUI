import React, { useEffect, useMemo, useRef } from 'react';
import { useI18n } from '@/contexts/I18nContext';
import ReactMarkdown from 'react-markdown';
import type { PluggableList } from 'unified';
import { CodeBlock } from './blocks/CodeBlock';
import { TableBlock } from './blocks/TableBlock';
import { ToolResultBlock } from './blocks/ToolResultBlock';
import { CodeExecutionBlock } from './blocks/CodeExecutionBlock';
import { DeferredDiagramBlock } from './blocks/DeferredDiagramBlock';
import { type UploadedFile, type SideViewContent } from '@/types';
import type { OpenHtmlPreviewHandler } from '@/utils/html-preview/previewPrivilege';
import { extractTextFromNode, findCodeElement } from '@/utils/reactNodeText';
import { InlineCode } from './code/InlineCode';
import { transformMarkdownTextSegments } from '@/utils/markdownSegments';
import { stripGemmaThoughtMarkup, wrapReasoningMarkup } from '@/utils/chat/reasoning';
import { normalizePreviewableMarkdownContent } from '@/utils/previewableMarkdown';
import type { LiveArtifactFollowupPayload } from '@/utils/live-artifacts/liveArtifactFollowup';
import { loadNamedComponent } from '@/utils/lazyNamedComponent';
import { InlineTimestampSeekButton } from '@/components/media-nav/InlineTimestampSeekButton';
import { InlinePdfLocateButton } from '@/components/media-nav/InlinePdfLocateButton';
import { InlineImageLocateButton } from '@/components/media-nav/InlineImageLocateButton';

const loadMermaidBlock = () => loadNamedComponent(() => import('./blocks/MermaidBlock'), 'MermaidBlock');
const loadGraphvizBlock = () => loadNamedComponent(() => import('./blocks/GraphvizBlock'), 'GraphvizBlock');

export interface MarkdownRendererProps {
  content: string;
  messageId?: string;
  isLoading: boolean;
  onImageClick: (file: UploadedFile) => void;
  onOpenHtmlPreview: OpenHtmlPreviewHandler;
  onLiveArtifactFollowUp?: (payload: LiveArtifactFollowupPayload) => void;
  expandCodeBlocksByDefault: boolean;
  isMermaidRenderingEnabled: boolean;
  isGraphvizRenderingEnabled: boolean;
  allowHtml?: boolean;
  themeId: string;
  onOpenSidePanel: (content: SideViewContent) => void;
  hideThinkingInContext?: boolean;
  files?: UploadedFile[];
  diagramLoadMode?: 'deferred' | 'eager';
  diagramRenderDelayMs?: number;
  interactiveMode?: 'enabled' | 'disabled';
  contentPreNormalized?: boolean;
  liveArtifactFontSize?: number;
  liveArtifactsMode?: boolean;
  unwrapMislabeledHtmlBlocks?: boolean;
  /** True while the stream has emitted an executableCode part with no result yet. */
  hasPendingCodeExecution?: boolean;
}

type MarkdownCodeProps = React.ComponentPropsWithoutRef<'code'> & {
  inline?: boolean;
  children?: React.ReactNode;
};
type MarkdownImageProps = React.ComponentPropsWithoutRef<'img'>;
type MarkdownTableProps = React.ComponentPropsWithoutRef<'table'>;
type MarkdownAnchorProps = React.ComponentPropsWithoutRef<'a'>;
type MarkdownDivProps = React.ComponentPropsWithoutRef<'div'>;
type MarkdownPreProps = React.ComponentPropsWithoutRef<'pre'> & {
  children?: React.ReactNode;
  node?: {
    position?: {
      start?: {
        offset?: number;
      };
    };
  };
};

interface BaseMarkdownRendererProps extends MarkdownRendererProps {
  remarkPlugins: PluggableList;
  rehypePlugins: PluggableList;
}

const INLINE_MATH_OPERATOR_REGEX = /(?:^|[^A-Za-z])(?:\d+\s*[=+\-*/<>]\s*\d+|[A-Za-z]\s*[=+\-*/<>]\s*[A-Za-z0-9])/;
const INLINE_MATH_MARKER_REGEX = /[\\^_{}]/;

const SINGLE_LIVE_ARTIFACT_FENCE_REGEX =
  /^```(amc-live-artifact-html|amc-live-artifact-interaction)\n([\s\S]*?)\n?```\s*$/;

const extractSingleLiveArtifactFence = (content: string): { language: string; code: string } | null => {
  const match = content.trim().match(SINGLE_LIVE_ARTIFACT_FENCE_REGEX);
  if (!match) {
    return null;
  }

  return {
    language: match[1],
    code: match[2] ?? '',
  };
};

const isLikelyMathExpression = (value: string): boolean => {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return false;
  }

  return (
    INLINE_MATH_MARKER_REGEX.test(trimmedValue) ||
    INLINE_MATH_OPERATOR_REGEX.test(trimmedValue) ||
    trimmedValue.includes('\n')
  );
};

const normalizeEscapedMathDelimiters = (value: string): string => {
  let nextValue = value.replace(/\\\$\$([\s\S]+?)\\\$\$/g, (match, innerContent: string) =>
    isLikelyMathExpression(innerContent) ? `$$${innerContent}$$` : match,
  );

  nextValue = nextValue.replace(/\\\$((?:\\.|[^\\$])+?)\\\$/g, (match, innerContent: string) =>
    isLikelyMathExpression(innerContent) ? `$${innerContent}$` : match,
  );

  return nextValue;
};

export const BaseMarkdownRenderer: React.FC<BaseMarkdownRendererProps> = React.memo(
  ({
    content,
    messageId,
    isLoading,
    onImageClick,
    onOpenHtmlPreview,
    onLiveArtifactFollowUp,
    expandCodeBlocksByDefault,
    isMermaidRenderingEnabled,
    isGraphvizRenderingEnabled,
    themeId,
    onOpenSidePanel,
    hideThinkingInContext,
    files,
    diagramLoadMode = 'deferred',
    diagramRenderDelayMs = 500,
    interactiveMode = 'enabled',
    contentPreNormalized = false,
    liveArtifactFontSize,
    liveArtifactsMode,
    unwrapMislabeledHtmlBlocks = true,
    hasPendingCodeExecution = false,
    remarkPlugins,
    rehypePlugins,
  }) => {
    const { t } = useI18n();
    const isInteractive = interactiveMode !== 'disabled';

    // Keep the event callbacks behind a latest-ref so the `components` map for
    // react-markdown can depend on nothing but content/theme primitives. The
    // inline component closures defined below are function types; if their
    // identity changed on every render, React would unmount/remount the whole
    // subtree they render, resetting local state like CodeBlock's expanded
    // flag. Background-session store churn must not tear down a completed
    // session's code blocks, so the closures read the freshest callback from
    // this ref at event time instead of being rebuilt.
    const handlersRef = useRef({ onImageClick, onOpenHtmlPreview, onLiveArtifactFollowUp, onOpenSidePanel });
    useEffect(() => {
      handlersRef.current = { onImageClick, onOpenHtmlPreview, onLiveArtifactFollowUp, onOpenSidePanel };
    });

    const components = useMemo(
      () => ({
        code: (props: MarkdownCodeProps) => {
          return <InlineCode {...props} />;
        },
        img: (props: MarkdownImageProps) => {
          const { src, alt, className, ...rest } = props;

          const imageClassName = isInteractive
            ? `${className || ''} cursor-pointer hover:opacity-90 transition-opacity`
            : className || '';

          return (
            <img
              src={src}
              alt={alt}
              className={imageClassName}
              onClick={(e) => {
                if (!isInteractive) return;
                e.stopPropagation();
                if (src && src.startsWith('data:image/')) {
                  const mimeType = src.split(';')[0].split(':')[1];
                  const file: UploadedFile = {
                    id: `inline-img-${Date.now()}`,
                    name: alt || 'generated-plot.png',
                    type: mimeType,
                    size: 0,
                    dataUrl: src,
                    uploadState: 'active',
                  };
                  handlersRef.current.onImageClick(file);
                } else if (src) {
                  const file: UploadedFile = {
                    id: `inline-img-${Date.now()}`,
                    name: alt || 'image',
                    type: 'image/jpeg',
                    size: 0,
                    dataUrl: src,
                    uploadState: 'active',
                  };
                  handlersRef.current.onImageClick(file);
                }
              }}
              {...rest}
            />
          );
        },
        table: (props: MarkdownTableProps) => <TableBlock {...props} />,
        a: (props: MarkdownAnchorProps) => {
          const { href, children, ...rest } = props;
          if (href?.startsWith('#video-seek') || href?.startsWith('#audio-seek') || href?.startsWith('#time-seek')) {
            const queryIndex = href.indexOf('?');
            const queryStr = queryIndex !== -1 ? href.slice(queryIndex + 1) : '';
            const searchParams = new URLSearchParams(queryStr);
            const start = Number.parseFloat(searchParams.get('start') || '0');
            const endParam = searchParams.get('end');
            const end = endParam ? Number.parseFloat(endParam) : undefined;
            const pointParam = searchParams.get('point');
            const boxParam = searchParams.get('box');
            const kindParam = searchParams.get('kind');
            const videoParam = searchParams.get('video') || searchParams.get('audio') || undefined;
            const snippetParam = searchParams.get('snippet') || undefined;
            const mediaKind =
              kindParam === 'audio' || href.startsWith('#audio-seek')
                ? ('audio' as const)
                : kindParam === 'video'
                  ? ('video' as const)
                  : undefined;

            let annotation:
              { point?: [number, number]; box2d?: [number, number, number, number]; snippet?: string } | undefined;
            if (pointParam || boxParam || snippetParam) {
              let point: [number, number] | undefined;
              if (pointParam) {
                const pointParts = pointParam
                  .replace(/[()[\]]/g, '')
                  .split(/[,;\s]+/)
                  .map((v) => Number.parseFloat(v.trim()))
                  .filter(Number.isFinite);
                if (pointParts.length === 2) {
                  const isZeroToOne =
                    pointParts.every((v) => v >= 0 && v <= 1.0) && pointParts.some((v) => v > 0 && v < 1.0);
                  const scale = isZeroToOne ? 1000 : 1;
                  point = [Math.round(pointParts[0] * scale), Math.round(pointParts[1] * scale)];
                }
              }

              let box2d: [number, number, number, number] | undefined;
              if (boxParam) {
                const boxParts = boxParam
                  .replace(/[()[\]]/g, '')
                  .split(/[,;\s]+/)
                  .map((v) => Number.parseFloat(v.trim()))
                  .filter(Number.isFinite);
                if (boxParts.length === 4) {
                  const isZeroToOne =
                    boxParts.every((v) => v >= 0 && v <= 1.0) && boxParts.some((v) => v > 0 && v < 1.0);
                  const scale = isZeroToOne ? 1000 : 1;
                  box2d = [
                    Math.round(boxParts[0] * scale),
                    Math.round(boxParts[1] * scale),
                    Math.round(boxParts[2] * scale),
                    Math.round(boxParts[3] * scale),
                  ];
                }
              }

              annotation = {
                point,
                box2d,
                snippet: snippetParam,
              };
            }

            return (
              <InlineTimestampSeekButton
                startSeconds={start}
                endSeconds={end}
                videoName={videoParam}
                mediaKind={mediaKind}
                annotation={annotation}
                messageId={messageId}
              >
                {children}
              </InlineTimestampSeekButton>
            );
          }

          if (href?.startsWith('#pdf-seek')) {
            const queryIndex = href.indexOf('?');
            const queryStr = queryIndex !== -1 ? href.slice(queryIndex + 1) : '';
            const searchParams = new URLSearchParams(queryStr);
            const page = Number.parseInt(searchParams.get('page') || '1', 10);
            const docParam = searchParams.get('doc') || undefined;
            const boxParam = searchParams.get('box');
            const pointParam = searchParams.get('point');
            const snippetParam = searchParams.get('snippet') || undefined;

            let box2d: [number, number, number, number] | undefined;
            if (boxParam) {
              const boxParts = boxParam
                .replace(/[()[\]]/g, '')
                .split(/[,;\s]+/)
                .map((v) => Number.parseFloat(v.trim()))
                .filter(Number.isFinite);
              if (boxParts.length === 4) {
                const isZeroToOne = boxParts.every((v) => v >= 0 && v <= 1.0) && boxParts.some((v) => v > 0 && v < 1.0);
                const scale = isZeroToOne ? 1000 : 1;
                box2d = [
                  Math.round(boxParts[0] * scale),
                  Math.round(boxParts[1] * scale),
                  Math.round(boxParts[2] * scale),
                  Math.round(boxParts[3] * scale),
                ];
              }
            }

            let point: [number, number] | undefined;
            if (pointParam) {
              const pointParts = pointParam
                .replace(/[()[\]]/g, '')
                .split(/[,;\s]+/)
                .map((v) => Number.parseFloat(v.trim()))
                .filter(Number.isFinite);
              if (pointParts.length === 2) {
                const isZeroToOne =
                  pointParts.every((v) => v >= 0 && v <= 1.0) && pointParts.some((v) => v > 0 && v < 1.0);
                const scale = isZeroToOne ? 1000 : 1;
                point = [Math.round(pointParts[0] * scale), Math.round(pointParts[1] * scale)];
              }
            }

            return (
              <InlinePdfLocateButton
                pageNumber={page}
                docName={docParam}
                box2d={box2d}
                point={point}
                snippet={snippetParam}
                messageId={messageId}
              >
                {children}
              </InlinePdfLocateButton>
            );
          }

          if (href?.startsWith('#image-seek')) {
            const queryIndex = href.indexOf('?');
            const queryStr = queryIndex !== -1 ? href.slice(queryIndex + 1) : '';
            const searchParams = new URLSearchParams(queryStr);
            const fileParam = searchParams.get('file') || undefined;
            const boxParam = searchParams.get('box');
            const pointParam = searchParams.get('point');
            const arrowParam = searchParams.get('arrow') || undefined;
            const labelParam = searchParams.get('label') || undefined;
            const snippetParam = searchParams.get('snippet') || undefined;

            let box2d: [number, number, number, number] | undefined;
            if (boxParam) {
              const boxParts = boxParam
                .replace(/[()[\]]/g, '')
                .split(/[,;\s]+/)
                .map((v) => Number.parseFloat(v.trim()))
                .filter(Number.isFinite);
              if (boxParts.length === 4) {
                const isZeroToOne = boxParts.every((v) => v >= 0 && v <= 1.0) && boxParts.some((v) => v > 0 && v < 1.0);
                const scale = isZeroToOne ? 1000 : 1;
                box2d = [
                  Math.round(boxParts[0] * scale),
                  Math.round(boxParts[1] * scale),
                  Math.round(boxParts[2] * scale),
                  Math.round(boxParts[3] * scale),
                ];
              }
            }

            let point: [number, number] | undefined;
            if (pointParam) {
              const pointParts = pointParam
                .replace(/[()[\]]/g, '')
                .split(/[,;\s]+/)
                .map((v) => Number.parseFloat(v.trim()))
                .filter(Number.isFinite);
              if (pointParts.length === 2) {
                const isZeroToOne =
                  pointParts.every((v) => v >= 0 && v <= 1.0) && pointParts.some((v) => v > 0 && v < 1.0);
                const scale = isZeroToOne ? 1000 : 1;
                point = [Math.round(pointParts[0] * scale), Math.round(pointParts[1] * scale)];
              }
            }

            return (
              <InlineImageLocateButton
                fileName={fileParam}
                box2d={box2d}
                point={point}
                arrow={arrowParam}
                label={labelParam}
                snippet={snippetParam}
                messageId={messageId}
              >
                {children}
              </InlineImageLocateButton>
            );
          }

          const isInternal = href && (href.startsWith('#') || href.startsWith('/'));

          return (
            <a
              href={href}
              target={isInternal ? undefined : '_blank'}
              rel={isInternal ? undefined : 'noopener noreferrer'}
              {...rest}
            >
              {children}
            </a>
          );
        },
        div: (props: MarkdownDivProps) => {
          const { className, children, ...rest } = props;
          if (className?.includes('tool-result')) {
            return (
              <ToolResultBlock
                className={className}
                files={files}
                onImageClick={handlersRef.current.onImageClick}
                {...rest}
              >
                {children}
              </ToolResultBlock>
            );
          }
          return (
            <div className={className} {...rest}>
              {children}
            </div>
          );
        },
        pre: (props: MarkdownPreProps) => {
          const { children, node, ...rest } = props;

          const codeElement = findCodeElement(children);

          const codeClassName = codeElement?.props.className || '';
          const codeContent = codeElement?.props.children;

          const rawCode = extractTextFromNode(codeContent);

          const langMatch = codeClassName.match(/language-(\S+)/);
          const language = langMatch ? langMatch[1] : '';
          const isGraphviz = language === 'graphviz' || language === 'dot';

          const isServerCodeExecution = typeof rest.className === 'string' && rest.className.includes('code-exec-code');

          const codeBlock = (
            <CodeBlock
              {...rest}
              files={files}
              messageId={messageId}
              cacheKey={
                messageId && node?.position?.start?.offset !== undefined
                  ? `${messageId}:${node.position.start.offset}`
                  : undefined
              }
              className={codeClassName}
              onOpenHtmlPreview={handlersRef.current.onOpenHtmlPreview}
              onLiveArtifactFollowUp={handlersRef.current.onLiveArtifactFollowUp}
              onImageClick={handlersRef.current.onImageClick}
              expandCodeBlocksByDefault={expandCodeBlocksByDefault}
              showPreviewControls={isInteractive}
              isLoading={isLoading}
              onOpenSidePanel={handlersRef.current.onOpenSidePanel}
              liveArtifactFontSize={liveArtifactFontSize}
              themeId={themeId}
              liveArtifactsMode={liveArtifactsMode}
              disableRun={isServerCodeExecution}
            >
              {codeElement || children}
            </CodeBlock>
          );

          if (isServerCodeExecution) {
            return <CodeExecutionBlock isRunning={hasPendingCodeExecution}>{codeBlock}</CodeExecutionBlock>;
          }

          if (isMermaidRenderingEnabled && language === 'mermaid' && typeof rawCode === 'string') {
            return (
              <DeferredDiagramBlock
                label={`Mermaid ${t('preview')}`}
                load={loadMermaidBlock}
                componentProps={{
                  code: rawCode,
                  onImageClick: handlersRef.current.onImageClick,
                  isLoading,
                  renderDelayMs: diagramRenderDelayMs,
                  themeId,
                  onOpenSidePanel: handlersRef.current.onOpenSidePanel,
                }}
                eager={diagramLoadMode === 'eager'}
              />
            );
          }

          if (isGraphvizRenderingEnabled && isGraphviz && typeof rawCode === 'string') {
            return (
              <DeferredDiagramBlock
                label={`Graphviz ${t('preview')}`}
                load={loadGraphvizBlock}
                componentProps={{
                  code: rawCode,
                  onImageClick: handlersRef.current.onImageClick,
                  isLoading,
                  renderDelayMs: diagramRenderDelayMs,
                  themeId,
                  onOpenSidePanel: handlersRef.current.onOpenSidePanel,
                }}
                eager={diagramLoadMode === 'eager'}
              />
            );
          }

          return codeBlock;
        },
      }),
      [
        diagramLoadMode,
        diagramRenderDelayMs,
        expandCodeBlocksByDefault,
        files,
        hasPendingCodeExecution,
        isGraphvizRenderingEnabled,
        isInteractive,
        isLoading,
        isMermaidRenderingEnabled,
        messageId,
        t,
        themeId,
        liveArtifactFontSize,
        liveArtifactsMode,
      ],
    );

    const processedContent = useMemo(() => {
      if (!content) return '';

      const normalizedContent = contentPreNormalized
        ? content
        : normalizePreviewableMarkdownContent(content, {
            isStreaming: isLoading,
            unwrapMislabeledHtmlBlocks,
          });
      const contentWithNormalizedMath = transformMarkdownTextSegments(
        normalizedContent,
        normalizeEscapedMathDelimiters,
      );

      if (hideThinkingInContext) {
        return wrapReasoningMarkup(contentWithNormalizedMath, isLoading, t('thinkingRawProcess'));
      }

      return stripGemmaThoughtMarkup(contentWithNormalizedMath);
    }, [content, contentPreNormalized, hideThinkingInContext, isLoading, t, unwrapMislabeledHtmlBlocks]);
    const singleLiveArtifact = useMemo(() => extractSingleLiveArtifactFence(processedContent), [processedContent]);

    if (isInteractive && singleLiveArtifact) {
      return (
        <div className={isLoading ? 'is-loading' : ''}>
          <CodeBlock
            cacheKey={messageId ? `${messageId}:direct-live-artifact` : undefined}
            files={files}
            messageId={messageId}
            className={`language-${singleLiveArtifact.language}`}
            onOpenHtmlPreview={onOpenHtmlPreview}
            onLiveArtifactFollowUp={onLiveArtifactFollowUp}
            onImageClick={onImageClick}
            expandCodeBlocksByDefault={expandCodeBlocksByDefault}
            showPreviewControls={isInteractive}
            isLoading={isLoading}
            onOpenSidePanel={onOpenSidePanel}
            liveArtifactFontSize={liveArtifactFontSize}
            themeId={themeId}
            liveArtifactsMode={liveArtifactsMode}
          >
            <code className={`language-${singleLiveArtifact.language}`}>{singleLiveArtifact.code}</code>
          </CodeBlock>
        </div>
      );
    }

    return (
      <div className={isLoading ? 'is-loading' : ''}>
        <ReactMarkdown
          remarkPlugins={remarkPlugins}
          rehypePlugins={rehypePlugins}
          components={components}
          urlTransform={(url) => url}
        >
          {processedContent}
        </ReactMarkdown>
      </div>
    );
  },
);
