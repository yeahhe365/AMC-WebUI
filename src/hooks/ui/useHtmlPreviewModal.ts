import { logService } from '@/services/logService';
import { useState, useEffect, useCallback, type RefObject } from 'react';
import { useWindowContext } from '@/contexts/WindowContext';
import { createManagedObjectUrl } from '@/services/objectUrlManager';
import { sanitizeFilename, triggerDownload } from '@/utils/export/core';
import { useFullscreen } from './useFullscreen';
import { useHtmlPreviewGraphvizRelay } from './useHtmlPreviewGraphvizRelay';
import {
  createStaticPreviewSnapshotContainer,
  HTML_PREVIEW_CLEAR_SELECTION_EVENT,
  HTML_PREVIEW_MESSAGE_CHANNEL,
} from '@/utils/html-preview/previewDocument';
import { DEFAULT_HTML_PREVIEW_PRIVILEGE, type HtmlPreviewPrivilege } from '@/utils/html-preview/previewPrivilege';
import { useI18n } from '@/contexts/I18nContext';
import { toastError } from '@/stores/toastStore';
import { type LiveArtifactFollowupPayload } from '@/utils/live-artifacts/liveArtifactFollowup';
import { LIVE_ARTIFACT_CLEAR_SELECTION_EVENT } from '@/utils/text-selection/liveArtifactSelection';
import { useHtmlPreviewBridge } from './useHtmlPreviewBridge';
import { formatI18nErrorMessage } from '@/i18n/interpolate';

const ZOOM_STEP = 0.1;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 3.0;
const MODAL_EXIT_DELAY_MS = 300;

interface UseHtmlPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  htmlContent: string | null;
  initialTrueFullscreenRequest?: boolean;
  privilege?: HtmlPreviewPrivilege;
  themeId?: string;
  iframeRef: RefObject<HTMLIFrameElement>;
  onLiveArtifactFollowUp?: (payload: LiveArtifactFollowupPayload) => void;
}

type DocumentWithWebkitFullscreen = Document & {
  webkitFullscreenElement?: Element | null;
};

const MAX_PREVIEW_CONTENT_HEIGHT = 200_000;

export const useHtmlPreviewModal = ({
  isOpen,
  onClose,
  htmlContent,
  initialTrueFullscreenRequest,
  privilege = DEFAULT_HTML_PREVIEW_PRIVILEGE,
  themeId,
  iframeRef,
  onLiveArtifactFollowUp,
}: UseHtmlPreviewModalProps) => {
  const { t } = useI18n();
  const [isTrueFullscreen, setIsTrueFullscreen] = useState(false);
  const [isActuallyOpen, setIsActuallyOpen] = useState(isOpen);
  const [scale, setScale] = useState(1);
  const [isScreenshotting, setIsScreenshotting] = useState(false);
  const [isPreviewReady, setIsPreviewReady] = useState(false);

  const [isDirectFullscreenLaunch, setIsDirectFullscreenLaunch] = useState(initialTrueFullscreenRequest);
  const [contentHeight, setContentHeight] = useState(0);
  // Bumped by handleRefresh to remount the iframe (via a key), re-running the
  // preview script from scratch without the hook fighting React's srcDoc prop.
  const [iframeRefreshKey, setIframeRefreshKey] = useState(0);

  const { document: targetDocument, window: targetWindow } = useWindowContext();
  const { enterFullscreen, exitFullscreen } = useFullscreen();
  useHtmlPreviewGraphvizRelay({
    iframeRef,
    privilege,
    themeId,
    enabled: isOpen,
  });
  const postClearSelection = useCallback(() => {
    iframeRef.current?.contentWindow?.postMessage(
      {
        channel: HTML_PREVIEW_MESSAGE_CHANNEL,
        event: HTML_PREVIEW_CLEAR_SELECTION_EVENT,
      },
      '*',
    );
  }, [iframeRef]);

  useEffect(() => {
    if (isOpen) {
      setIsActuallyOpen(true);
      setScale(1);
      setContentHeight(0);
      setIsPreviewReady(false);
      setIsDirectFullscreenLaunch(initialTrueFullscreenRequest);
    } else {
      const timer = setTimeout(() => setIsActuallyOpen(false), MODAL_EXIT_DELAY_MS);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [isOpen, initialTrueFullscreenRequest, htmlContent]);

  const handleZoomIn = useCallback(
    () => setScale((previousScale) => Math.min(MAX_ZOOM, previousScale + ZOOM_STEP)),
    [],
  );
  const handleZoomOut = useCallback(
    () => setScale((previousScale) => Math.max(MIN_ZOOM, previousScale - ZOOM_STEP)),
    [],
  );

  const enterTrueFullscreen = useCallback(async () => {
    const element = iframeRef.current;
    if (!element) return;
    try {
      await enterFullscreen(element);
    } catch {
      setIsDirectFullscreenLaunch(false);
    }
  }, [iframeRef, enterFullscreen]);

  const exitTrueFullscreen = useCallback(async () => {
    await exitFullscreen();
  }, [exitFullscreen]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const newlyFullscreenElement =
        targetDocument.fullscreenElement || (targetDocument as DocumentWithWebkitFullscreen).webkitFullscreenElement;
      const isNowInTrueFullscreenForIframe = newlyFullscreenElement === iframeRef.current;

      if (isTrueFullscreen && !isNowInTrueFullscreenForIframe) {
        if (initialTrueFullscreenRequest) {
          onClose();
          return;
        }
      }
      setIsTrueFullscreen(isNowInTrueFullscreenForIframe);
    };

    targetDocument.addEventListener('fullscreenchange', handleFullscreenChange);
    targetDocument.addEventListener('webkitfullscreenchange', handleFullscreenChange);

    return () => {
      targetDocument.removeEventListener('fullscreenchange', handleFullscreenChange);
      targetDocument.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, [isTrueFullscreen, iframeRef, initialTrueFullscreenRequest, onClose, targetDocument]);

  const handleBridgeReady = useCallback(() => {
    setContentHeight(0);
    setIsPreviewReady(true);
  }, []);

  const handleBridgeResize = useCallback((height: number) => {
    const nextHeight = Math.min(Math.ceil(height), MAX_PREVIEW_CONTENT_HEIGHT);
    setContentHeight((current) => (current === nextHeight ? current : nextHeight));
  }, []);

  // Escape only closes the overlay when the browser is not already managing
  // true fullscreen (the browser exits fullscreen itself in that case).
  const handleBridgeEscape = useCallback(() => {
    if (!isTrueFullscreen) {
      onClose();
    }
  }, [isTrueFullscreen, onClose]);

  useHtmlPreviewBridge({
    iframeRef,
    targetWindow,
    privilege,
    enabled: isOpen,
    selectionScale: scale,
    handlers: {
      onReady: handleBridgeReady,
      onResize: handleBridgeResize,
      onEscape: handleBridgeEscape,
      onFollowUp: onLiveArtifactFollowUp,
    },
  });

  useEffect(() => {
    const handleClearSelection = () => {
      postClearSelection();
    };

    targetWindow.addEventListener(LIVE_ARTIFACT_CLEAR_SELECTION_EVENT, handleClearSelection);
    return () => targetWindow.removeEventListener(LIVE_ARTIFACT_CLEAR_SELECTION_EVENT, handleClearSelection);
  }, [postClearSelection, targetWindow]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (isTrueFullscreen) {
          // Browser handles exiting true fullscreen
        } else {
          if (isOpen) onClose();
        }
      }
    };

    if (isOpen) {
      targetDocument.addEventListener('keydown', handleKeyDown);
      if (initialTrueFullscreenRequest && iframeRef.current) {
        enterTrueFullscreen();
      }
    }
    return () => {
      targetDocument.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, initialTrueFullscreenRequest, enterTrueFullscreen, isTrueFullscreen, targetDocument, iframeRef]);

  const getPreviewTitle = useCallback(() => {
    let title = t('htmlPreviewTitle');
    try {
      const titleMatch = htmlContent?.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleMatch && titleMatch[1]) {
        title = titleMatch[1].trim();
      }
    } catch {
      // Fall back to the default preview title if parsing fails.
    }
    return title;
  }, [htmlContent, t]);

  const handleDownload = useCallback(() => {
    if (!htmlContent) return;
    const title = getPreviewTitle();
    const filename = `${sanitizeFilename(title)}.html`;
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = createManagedObjectUrl(blob);
    triggerDownload(url, filename);
  }, [htmlContent, getPreviewTitle]);

  const getCurrentPreviewScreenshotTarget = useCallback((): HTMLElement | null => {
    try {
      const previewDocument = iframeRef.current?.contentDocument;
      return previewDocument?.body || previewDocument?.documentElement || null;
    } catch {
      return null;
    }
  }, [iframeRef]);

  const handleScreenshot = useCallback(async () => {
    if (!htmlContent || !isPreviewReady || isScreenshotting) return;

    setIsScreenshotting(true);
    let snapshotCleanup: (() => void) | null = null;
    try {
      const { exportElementAsPng } = await import('@/utils/export/image');
      const target = getCurrentPreviewScreenshotTarget();
      let exportTarget = target;
      if (!exportTarget) {
        // The iframe is not readable (sandboxed / not mounted): build a static
        // snapshot from the source HTML instead. Async so graphviz nodes can be
        // hydrated before the frame is exported.
        const snapshot = await createStaticPreviewSnapshotContainer(htmlContent, targetDocument, {
          sanitize: privilege !== 'unrestricted',
        });
        snapshotCleanup = snapshot.cleanup;
        exportTarget = snapshot.container;
      }
      const title = getPreviewTitle();
      const filename = `${sanitizeFilename(title)}-screenshot.png`;

      await exportElementAsPng(exportTarget, filename, {
        backgroundColor: null,
        scale: 2,
        messages: {
          imageTooLarge: t('exportImageTooLarge'),
          exportFailed: (message) => formatI18nErrorMessage(t, 'exportFailedWithMessage', message),
        },
      });
    } catch (screenshotError) {
      logService.error('Failed to take screenshot of iframe content:', screenshotError);
      toastError(t('htmlPreviewScreenshotFailed'));
    } finally {
      snapshotCleanup?.();
      setIsScreenshotting(false);
    }
  }, [
    getCurrentPreviewScreenshotTarget,
    getPreviewTitle,
    htmlContent,
    isPreviewReady,
    isScreenshotting,
    t,
    targetDocument,
    privilege,
  ]);

  const handleRefresh = useCallback(() => {
    if (iframeRef.current && htmlContent) {
      setIsPreviewReady(false);
      // Remount the iframe by bumping the key. The old imperative srcdoc write
      // desynced from React's srcDoc prop (the refresh relied on the prop being
      // unchanged). A remount restarts the preview script cleanly.
      setIframeRefreshKey((key) => key + 1);
    }
  }, [htmlContent, iframeRef]);

  return {
    isActuallyOpen,
    isTrueFullscreen,
    isDirectFullscreenLaunch,
    scale,
    isPreviewReady,
    contentHeight,
    isScreenshotting,
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
  };
};
