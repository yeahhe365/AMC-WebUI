import { logService } from '@/services/logService';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Maximize2 } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { useWindowContext } from '@/contexts/WindowContext';
import { SMALL_ICON_BUTTON_CLASS } from '@/constants/buttonClasses';
import {
  buildStreamingHtmlPreviewRenderPayload,
  buildHtmlPreviewSrcDoc,
  buildStreamingHtmlPreviewSrcDoc,
  whenKatexReady,
  HTML_PREVIEW_CLEAR_SELECTION_EVENT,
  HTML_PREVIEW_MESSAGE_CHANNEL,
  HTML_PREVIEW_STREAM_RENDER_EVENT,
} from '@/utils/html-preview/previewDocument';
import { HTML_PREVIEW_SANDBOX } from '@/utils/html-preview/previewPrivilege';
import { useHtmlPreviewBridge } from '@/hooks/ui/useHtmlPreviewBridge';
import { useHtmlPreviewGraphvizRelay } from '@/hooks/ui/useHtmlPreviewGraphvizRelay';
import { type LiveArtifactFollowupPayload } from '@/utils/live-artifacts/liveArtifactFollowup';
import { LIVE_ARTIFACT_CLEAR_SELECTION_EVENT } from '@/utils/text-selection/liveArtifactSelection';

interface ArtifactFrameProps {
  html: string;
  cacheKey?: string;
  isLoading?: boolean;
  baseFontSize?: number;
  themeId?: string;
  onFollowUp?: (payload: LiveArtifactFollowupPayload) => void;
  onOpenPreview?: () => void;
}

const MIN_FRAME_HEIGHT = 120;
const DEFAULT_FRAME_HEIGHT = 320;
const MAX_FRAME_HEIGHT_CACHE_ENTRIES = 200;
const STREAMING_SRC_DOC_THROTTLE_MS = 120;
const frameHeightCache = new Map<string, number>();

const normalizeFrameHeight = (height: number) => Math.max(MIN_FRAME_HEIGHT, Math.ceil(height));

const hashString = (value: string): string => {
  let hash = 0;

  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }

  return (hash >>> 0).toString(36);
};

const getContentFrameHeightCacheKey = (html: string, cacheKey?: string): string => {
  const contentHash = `${html.length}:${hashString(html)}`;
  return cacheKey ? `${cacheKey}:${contentHash}` : `html:${contentHash}`;
};

const getStreamingFrameHeightCacheKey = (cacheKey?: string): string | undefined => {
  return cacheKey ? `stream:${cacheKey}` : undefined;
};

const readCachedFrameHeight = (heightCacheKey: string, fallbackHeightCacheKey?: string): number => {
  return (
    frameHeightCache.get(heightCacheKey) ??
    (fallbackHeightCacheKey ? frameHeightCache.get(fallbackHeightCacheKey) : undefined) ??
    DEFAULT_FRAME_HEIGHT
  );
};

const cacheFrameHeight = (heightCacheKey: string, height: number) => {
  if (frameHeightCache.has(heightCacheKey)) {
    frameHeightCache.delete(heightCacheKey);
  }

  frameHeightCache.set(heightCacheKey, height);

  if (frameHeightCache.size > MAX_FRAME_HEIGHT_CACHE_ENTRIES) {
    const oldestKey = frameHeightCache.keys().next().value;
    if (oldestKey) {
      frameHeightCache.delete(oldestKey);
    }
  }
};

export const ArtifactFrame: React.FC<ArtifactFrameProps> = ({
  html,
  cacheKey,
  isLoading = false,
  baseFontSize,
  themeId,
  onFollowUp,
  onOpenPreview,
}) => {
  const { t } = useI18n();
  const { window: targetWindow } = useWindowContext();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  useHtmlPreviewGraphvizRelay({
    iframeRef,
    privilege: 'sanitized',
    themeId,
  });
  const latestStreamingHtmlRef = useRef(html);
  const isLoadingRef = useRef(isLoading);
  const lastPostedStreamingHtmlRef = useRef<string | null>(null);
  const streamingFlushTimeoutRef = useRef<number | null>(null);
  const contentHeightCacheKey = useMemo(() => getContentFrameHeightCacheKey(html, cacheKey), [cacheKey, html]);
  const streamingHeightCacheKey = useMemo(() => getStreamingFrameHeightCacheKey(cacheKey), [cacheKey]);
  const heightCacheKey = isLoading && streamingHeightCacheKey ? streamingHeightCacheKey : contentHeightCacheKey;
  const streamingSrcDoc = useMemo(
    () => buildStreamingHtmlPreviewSrcDoc({ baseFontSize, themeId }),
    [baseFontSize, themeId],
  );
  const [frameHeightState, setFrameHeightState] = useState(() => ({
    heightCacheKey,
    height: readCachedFrameHeight(heightCacheKey, streamingHeightCacheKey),
  }));
  // Incremented when KaTeX finishes loading so the final srcDoc (which embeds
  // rendered math) is recomputed after the first render skipped the formulas.
  const [katexReadyTick, setKatexReadyTick] = useState(0);
  const finalSrcDoc = useMemo(() => {
    // Guard: while streaming, the iframe renders `streamingSrcDoc` (live,
    // chunk-by-chunk via postMessage) and `finalSrcDoc` is unused. Building it
    // every chunk would re-run the full DOMParser + sanitize + inject pipeline
    // for content the iframe cannot see yet. Deferring the build to the end of
    // the stream keeps the heavy final pass off the hot path.
    if (isLoading) {
      return '';
    }
    // katexReadyTick is an intentional invalidation token: reading it ties the
    // memo to the lazy KaTeX load so the first render (which skips formulas)
    // is recomputed once the chunk has arrived.
    void katexReadyTick;
    return buildHtmlPreviewSrcDoc(html, { baseFontSize, themeId });
  }, [baseFontSize, html, isLoading, katexReadyTick, themeId]);
  const frameHeight =
    frameHeightState.heightCacheKey === heightCacheKey
      ? frameHeightState.height
      : readCachedFrameHeight(heightCacheKey, streamingHeightCacheKey);
  const srcDoc = isLoading ? streamingSrcDoc : finalSrcDoc;

  useLayoutEffect(() => {
    latestStreamingHtmlRef.current = html;
  }, [html]);

  useLayoutEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);

  const clearStreamingFlushTimeout = useCallback(() => {
    if (streamingFlushTimeoutRef.current === null) {
      return;
    }

    targetWindow.clearTimeout(streamingFlushTimeoutRef.current);
    streamingFlushTimeoutRef.current = null;
  }, [targetWindow]);

  // Returns false when the iframe is not ready yet so callers can retry.
  const postStreamingHtml = useCallback((nextHtml: string, force = false): boolean => {
    if (!force && lastPostedStreamingHtmlRef.current === nextHtml) {
      return true;
    }

    const iframeWindow = iframeRef.current?.contentWindow;
    if (!iframeWindow) {
      return false;
    }

    try {
      iframeWindow.postMessage(
        {
          channel: HTML_PREVIEW_MESSAGE_CHANNEL,
          event: HTML_PREVIEW_STREAM_RENDER_EVENT,
          html: buildStreamingHtmlPreviewRenderPayload(nextHtml),
        },
        '*',
      );
      lastPostedStreamingHtmlRef.current = nextHtml;
      return true;
    } catch (error) {
      logService.warn('Failed to post Live Artifact streaming html:', error);
      return false;
    }
  }, []);

  const scheduleStreamingHtmlFlush = useCallback(
    (force = false) => {
      if (streamingFlushTimeoutRef.current !== null) {
        return;
      }

      // Named retry loop avoids a useCallback self-reference (react-hooks/immutability).
      const attemptFlush = () => {
        streamingFlushTimeoutRef.current = null;
        if (!isLoadingRef.current) {
          return;
        }

        const posted = postStreamingHtml(latestStreamingHtmlRef.current, force);
        // contentWindow can appear after the first timeout (Virtuoso remount / slow srcDoc).
        if (!posted) {
          streamingFlushTimeoutRef.current = targetWindow.setTimeout(attemptFlush, STREAMING_SRC_DOC_THROTTLE_MS);
        }
      };

      streamingFlushTimeoutRef.current = targetWindow.setTimeout(attemptFlush, STREAMING_SRC_DOC_THROTTLE_MS);
    },
    [postStreamingHtml, targetWindow],
  );

  const flushStreamingHtmlNow = useCallback(
    (force = false) => {
      if (!isLoadingRef.current) {
        return;
      }

      const posted = postStreamingHtml(latestStreamingHtmlRef.current, force);
      if (!posted) {
        scheduleStreamingHtmlFlush(force);
      }
    },
    [postStreamingHtml, scheduleStreamingHtmlFlush],
  );

  useEffect(() => {
    if (!isLoading) {
      clearStreamingFlushTimeout();
      lastPostedStreamingHtmlRef.current = null;
      return;
    }

    scheduleStreamingHtmlFlush();
  }, [clearStreamingFlushTimeout, html, isLoading, scheduleStreamingHtmlFlush]);

  useEffect(() => {
    return () => clearStreamingFlushTimeout();
  }, [clearStreamingFlushTimeout]);

  useEffect(() => {
    if (isLoading) {
      return;
    }
    // When the final srcDoc first meets a TeX delimiter, renderPreviewMath
    // returns it unrendered and kicks off the lazy KaTeX load. Re-render once
    // the chunk is available so embedded formulas appear. The promise resolves
    // immediately after the first load, so this is a no-op on later frames.
    let cancelled = false;
    void whenKatexReady()
      .then(() => {
        if (!cancelled) {
          setKatexReadyTick((tick) => tick + 1);
        }
      })
      .catch(() => {
        // The lazy KaTeX load failed (offline / chunk error). Nothing to tick:
        // the next render that sees a math delimiter will attempt the load
        // again, so the failure is not permanent.
      });
    return () => {
      cancelled = true;
    };
  }, [isLoading]);

  const flushStreamingHtmlOnBridgeReady = useCallback(() => {
    // Prefer refs so remount/load races always flush the latest streaming html.
    flushStreamingHtmlNow(true);
  }, [flushStreamingHtmlNow]);

  const copyToParentClipboard = useCallback(
    (text: string) => {
      // The sandboxed iframe lacks allow-same-origin, so navigator.clipboard
      // is unavailable there; the parent page writes to the clipboard instead.
      targetWindow.navigator.clipboard?.writeText(text).catch((error: unknown) => {
        logService.warn('Failed to copy Live Artifact text:', error);
      });
    },
    [targetWindow],
  );

  const handleBridgeResize = useCallback(
    (height: number) => {
      const nextHeight = normalizeFrameHeight(height);
      cacheFrameHeight(heightCacheKey, nextHeight);
      // While streaming, only the streaming key is written so the content
      // (final-html) cache is not polluted with intermediate frame heights.
      // The streaming key is not derived from the message content, so each
      // write replaces the same entry instead of churning the LRU.
      if (!isLoading && heightCacheKey !== contentHeightCacheKey) {
        cacheFrameHeight(contentHeightCacheKey, nextHeight);
      }
      if (streamingHeightCacheKey && heightCacheKey !== streamingHeightCacheKey) {
        cacheFrameHeight(streamingHeightCacheKey, nextHeight);
      }
      setFrameHeightState((currentState) =>
        currentState.heightCacheKey === heightCacheKey && currentState.height === nextHeight
          ? currentState
          : { heightCacheKey, height: nextHeight },
      );
    },
    [contentHeightCacheKey, heightCacheKey, isLoading, streamingHeightCacheKey],
  );

  useHtmlPreviewBridge({
    iframeRef,
    targetWindow,
    privilege: 'sanitized',
    handlers: {
      onReady: flushStreamingHtmlOnBridgeReady,
      onResize: handleBridgeResize,
      onCopy: copyToParentClipboard,
      onFollowUp,
    },
  });

  useEffect(() => {
    const handleClearSelection = () => {
      iframeRef.current?.contentWindow?.postMessage(
        {
          channel: HTML_PREVIEW_MESSAGE_CHANNEL,
          event: HTML_PREVIEW_CLEAR_SELECTION_EVENT,
        },
        '*',
      );
    };

    targetWindow.addEventListener(LIVE_ARTIFACT_CLEAR_SELECTION_EVENT, handleClearSelection);
    return () => targetWindow.removeEventListener(LIVE_ARTIFACT_CLEAR_SELECTION_EVENT, handleClearSelection);
  }, [targetWindow]);

  return (
    <div
      data-live-artifact-frame="true"
      data-artifact-source={html}
      className="group/artifact relative my-3 w-full overflow-visible"
    >
      <div
        data-live-artifact-viewport="true"
        className="relative overflow-hidden rounded-lg bg-transparent"
        style={{ height: frameHeight }}
      >
        <iframe
          ref={iframeRef}
          srcDoc={srcDoc}
          title={t('htmlPreviewTitle')}
          className="h-full w-full border-0 bg-transparent"
          // SECURITY: allow-same-origin is intentionally omitted (opaque origin).
          // allow-popups enables target="_blank" external links in Live Artifacts.
          sandbox={HTML_PREVIEW_SANDBOX.sanitized}
          allow="clipboard-write"
          scrolling="no"
          onLoad={() => {
            // Prefer refs so remount/load races always flush the latest streaming html.
            flushStreamingHtmlNow(true);
          }}
        />
      </div>
      {onOpenPreview && !isLoading && (
        <button
          type="button"
          className={`${SMALL_ICON_BUTTON_CLASS} absolute right-2 top-2 z-10 border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-primary)]/90 shadow-sm opacity-100 sm:opacity-0 sm:group-hover/artifact:opacity-100 sm:focus-visible:opacity-100 sm:group-focus-within/artifact:opacity-100`}
          title={t('htmlPreviewOpenLarger')}
          aria-label={t('htmlPreviewOpenLarger')}
          onClick={onOpenPreview}
        >
          <Maximize2 size={16} strokeWidth={2} />
        </button>
      )}
    </div>
  );
};
