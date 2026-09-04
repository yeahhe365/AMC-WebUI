import { useEffect, type RefObject } from 'react';
import { logService } from '@/services/logService';
import { resolveHtmlPreviewBridgeEvent } from '@/utils/html-preview/previewParentBridge';
import type { HtmlPreviewPrivilege } from '@/utils/html-preview/previewPrivilege';
import type { LiveArtifactFollowupPayload } from '@/utils/live-artifacts/liveArtifactFollowup';
import {
  createRelayedLiveArtifactSelectionDetail,
  dispatchLiveArtifactSelection,
} from '@/utils/text-selection/liveArtifactSelection';

/**
 * Branch handlers for the HTML preview postMessage bridge. Every branch that
 * differs between consumers is injected; the branches whose behavior is part
 * of the protocol itself (selection relay, invalid-followup and diagnostic
 * logging) are owned by the hook so they cannot drift apart again.
 */
export interface HtmlPreviewBridgeHandlers {
  /** The iframe announced its document is ready. */
  onReady?: () => void;
  /** The iframe reported its content height. */
  onResize?: (height: number) => void;
  /**
   * The user dismissed the preview from inside the iframe. Consumers decide
   * whether Escape actually closes anything (e.g. ignore it while in true
   * fullscreen, or ignore it entirely for inline frames).
   */
  onEscape?: () => void;
  /** The sandboxed iframe asked the parent page to copy text on its behalf. */
  onCopy?: (text: string) => void;
  /** A valid Live Artifact follow-up instruction arrived from the iframe. */
  onFollowUp?: (payload: LiveArtifactFollowupPayload) => void;
}

interface UseHtmlPreviewBridgeOptions {
  iframeRef: RefObject<HTMLIFrameElement | null>;
  targetWindow: Window;
  privilege: HtmlPreviewPrivilege;
  /**
   * Gate the listener without unmounting the consumer (the preview modal only
   * listens while open). Defaults to always-on for inline frames.
   */
  enabled?: boolean;
  /**
   * Zoom scale applied when relaying selection rects into parent-page
   * coordinates. Omitted for unscaled inline frames.
   */
  selectionScale?: number;
  handlers: HtmlPreviewBridgeHandlers;
}

/**
 * Shared dispatch skeleton for the HTML preview iframe postMessage bridge.
 *
 * Security boundary: event source/origin filtering stays inside
 * `resolveHtmlPreviewBridgeEvent` (`event.source` must be the tracked iframe's
 * contentWindow, `event.origin` must pass `isHtmlPreviewMessageOriginAllowed`
 * for the given privilege). Consumers may only specialize what happens after a
 * message is authenticated — never the authentication itself.
 */
export const useHtmlPreviewBridge = ({
  iframeRef,
  targetWindow,
  privilege,
  enabled = true,
  selectionScale,
  handlers,
}: UseHtmlPreviewBridgeOptions) => {
  // Destructure so effect re-subscription tracks the individual handler
  // identities rather than the (usually fresh-per-render) container object.
  const { onReady, onResize, onEscape, onCopy, onFollowUp } = handlers;

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const handleMessage = (event: MessageEvent) => {
      const resolved = resolveHtmlPreviewBridgeEvent({
        event,
        iframeWindow: iframeRef.current?.contentWindow,
        privilege,
        parentOrigin: targetWindow.location.origin,
      });
      if (!resolved) {
        return;
      }

      if (resolved.kind === 'ready') {
        onReady?.();
        return;
      }

      if (resolved.kind === 'resize') {
        onResize?.(resolved.height);
        return;
      }

      if (resolved.kind === 'escape') {
        onEscape?.();
        return;
      }

      if (resolved.kind === 'selection') {
        // `undefined` scale falls back to the helper's default of 1, matching
        // consumers that relay unscaled inline-frame selections.
        dispatchLiveArtifactSelection(
          targetWindow,
          createRelayedLiveArtifactSelectionDetail(iframeRef.current, resolved.payload, selectionScale),
        );
        return;
      }

      if (resolved.kind === 'followup') {
        onFollowUp?.(resolved.payload);
        return;
      }

      if (resolved.kind === 'invalid-followup') {
        logService.warn('Ignored invalid Live Artifact follow-up payload.');
        return;
      }

      if (resolved.kind === 'copy') {
        onCopy?.(resolved.text);
        return;
      }

      if (resolved.kind === 'diagnostic') {
        logService.warn('Live Artifact preview diagnostic:', resolved.payload);
      }
    };

    targetWindow.addEventListener('message', handleMessage);
    return () => {
      targetWindow.removeEventListener('message', handleMessage);
    };
  }, [enabled, iframeRef, onCopy, onEscape, onFollowUp, onReady, onResize, privilege, selectionScale, targetWindow]);
};
