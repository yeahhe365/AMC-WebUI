import {
  type LiveArtifactFollowupPayload,
  normalizeLiveArtifactFollowupPayload,
} from '@/utils/live-artifacts/liveArtifactFollowup';
import {
  HTML_PREVIEW_COPY_EVENT,
  HTML_PREVIEW_DIAGNOSTIC_EVENT,
  HTML_PREVIEW_GRAPHVIZ_RENDER_REQUEST_EVENT,
  HTML_PREVIEW_GRAPHVIZ_RENDER_RESPONSE_EVENT,
  HTML_PREVIEW_MESSAGE_CHANNEL,
} from './previewMessageProtocol';
import { isHtmlPreviewMessageOriginAllowed, type HtmlPreviewPrivilege } from './previewPrivilege';

type HtmlPreviewBridgeData = {
  channel?: string;
  event?: string;
  payload?: unknown;
  height?: number;
};

type HtmlPreviewBridgeResolution =
  | { kind: 'ready' }
  | { kind: 'resize'; height: number }
  | { kind: 'escape' }
  | { kind: 'followup'; payload: LiveArtifactFollowupPayload }
  | { kind: 'invalid-followup' }
  | { kind: 'selection'; payload: unknown }
  | { kind: 'copy'; text: string }
  | { kind: 'diagnostic'; payload: unknown }
  | { kind: 'graphviz-request'; id: string; dot: string };

export const resolveHtmlPreviewBridgeEvent = ({
  event,
  iframeWindow,
  privilege,
  parentOrigin,
}: {
  event: MessageEvent;
  iframeWindow: Window | null | undefined;
  privilege: HtmlPreviewPrivilege;
  parentOrigin: string;
}): HtmlPreviewBridgeResolution | null => {
  if (!iframeWindow || event.source !== iframeWindow) {
    return null;
  }

  if (!isHtmlPreviewMessageOriginAllowed(event.origin, privilege, parentOrigin)) {
    return null;
  }

  const data = event.data as HtmlPreviewBridgeData | null;
  if (!data || data.channel !== HTML_PREVIEW_MESSAGE_CHANNEL || typeof data.event !== 'string') {
    return null;
  }

  switch (data.event) {
    case 'ready':
      return { kind: 'ready' };
    case 'resize': {
      if (typeof data.height !== 'number' || !Number.isFinite(data.height)) {
        return null;
      }
      return { kind: 'resize', height: data.height };
    }
    case 'escape':
      return { kind: 'escape' };
    case 'followup': {
      if (privilege !== 'sanitized') {
        return null;
      }
      const payload = normalizeLiveArtifactFollowupPayload(data.payload);
      return payload ? { kind: 'followup', payload } : { kind: 'invalid-followup' };
    }
    case 'selection':
      return { kind: 'selection', payload: data.payload };
    case HTML_PREVIEW_COPY_EVENT: {
      const text =
        data.payload && typeof data.payload === 'object' && 'text' in data.payload
          ? (data.payload as { text?: unknown }).text
          : undefined;
      if (typeof text !== 'string' || !text.trim()) {
        return null;
      }
      return { kind: 'copy', text };
    }
    case HTML_PREVIEW_DIAGNOSTIC_EVENT:
      return { kind: 'diagnostic', payload: data.payload };
    case HTML_PREVIEW_GRAPHVIZ_RENDER_REQUEST_EVENT: {
      const payload = data.payload;
      if (
        !payload ||
        typeof payload !== 'object' ||
        typeof (payload as { id?: unknown }).id !== 'string' ||
        typeof (payload as { dot?: unknown }).dot !== 'string'
      ) {
        return null;
      }
      const { id, dot } = payload as { id: string; dot: string };
      return { kind: 'graphviz-request', id, dot };
    }
    default:
      return null;
  }
};

export const createHtmlPreviewGraphvizResponseMessage = (
  id: string,
  result: { ok: true; svg: string } | { ok: false; error: string },
) => ({
  channel: HTML_PREVIEW_MESSAGE_CHANNEL,
  event: HTML_PREVIEW_GRAPHVIZ_RENDER_RESPONSE_EVENT,
  payload: result.ok ? { id, ok: true as const, svg: result.svg } : { id, ok: false as const, error: result.error },
});
