import { useEffect, type RefObject } from 'react';
import { useWindowContext } from '@/contexts/WindowContext';
import { renderDotToSvgCached } from '@/features/graphviz/vizRuntime';
import {
  createHtmlPreviewGraphvizResponseMessage,
  resolveHtmlPreviewBridgeEvent,
} from '@/utils/html-preview/previewParentBridge';
import type { HtmlPreviewPrivilege } from '@/utils/html-preview/previewPrivilege';

interface UseHtmlPreviewGraphvizRelayOptions {
  iframeRef: RefObject<HTMLIFrameElement | null>;
  privilege: HtmlPreviewPrivilege;
  themeId?: string;
  enabled?: boolean;
}

export const useHtmlPreviewGraphvizRelay = ({
  iframeRef,
  privilege,
  themeId,
  enabled = true,
}: UseHtmlPreviewGraphvizRelayOptions) => {
  const { window: targetWindow } = useWindowContext();

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const handleMessage = (event: MessageEvent) => {
      const iframeWindow = iframeRef.current?.contentWindow;
      const resolved = resolveHtmlPreviewBridgeEvent({
        event,
        iframeWindow,
        privilege,
        parentOrigin: targetWindow.location.origin,
      });
      if (resolved?.kind !== 'graphviz-request') {
        return;
      }

      void renderDotToSvgCached(resolved.dot, { themeId }).then((result) => {
        iframeWindow?.postMessage(
          createHtmlPreviewGraphvizResponseMessage(
            resolved.id,
            result.ok ? { ok: true, svg: result.svg } : { ok: false, error: result.error },
          ),
          '*',
        );
      });
    };

    targetWindow.addEventListener('message', handleMessage);
    return () => {
      targetWindow.removeEventListener('message', handleMessage);
    };
  }, [enabled, iframeRef, privilege, targetWindow, themeId]);
};
