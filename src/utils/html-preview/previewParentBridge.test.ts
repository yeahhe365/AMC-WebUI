import { describe, expect, it } from 'vitest';
import { HTML_PREVIEW_MESSAGE_CHANNEL } from './previewMessageProtocol';
import { resolveHtmlPreviewBridgeEvent } from './previewParentBridge';

const iframeWindow = {} as Window;
const parentOrigin = 'https://app.example';

const messageEvent = (overrides: { data?: unknown; origin?: string; source?: Window | null }): MessageEvent =>
  ({
    data: overrides.data,
    origin: overrides.origin ?? 'null',
    source: overrides.source === undefined ? iframeWindow : overrides.source,
  }) as MessageEvent;

describe('resolveHtmlPreviewBridgeEvent', () => {
  it('drops follow-up events from unrestricted demo previews', () => {
    const resolved = resolveHtmlPreviewBridgeEvent({
      event: messageEvent({
        data: {
          channel: HTML_PREVIEW_MESSAGE_CHANNEL,
          event: 'followup',
          payload: { instruction: 'Continue' },
        },
      }),
      iframeWindow,
      privilege: 'unrestricted',
      parentOrigin,
    });

    expect(resolved).toBeNull();
  });

  it('forwards follow-up events only from sanitized Live Artifact previews', () => {
    const resolved = resolveHtmlPreviewBridgeEvent({
      event: messageEvent({
        data: {
          channel: HTML_PREVIEW_MESSAGE_CHANNEL,
          event: 'followup',
          payload: { instruction: 'Continue', state: { selected: 'B' } },
        },
      }),
      iframeWindow,
      privilege: 'sanitized',
      parentOrigin,
    });

    expect(resolved).toEqual({
      kind: 'followup',
      payload: { instruction: 'Continue', state: { selected: 'B' } },
    });
  });

  it('accepts graphviz requests from unrestricted same-origin side-panel previews', () => {
    const resolved = resolveHtmlPreviewBridgeEvent({
      event: messageEvent({
        origin: parentOrigin,
        data: {
          channel: HTML_PREVIEW_MESSAGE_CHANNEL,
          event: 'graphviz-render-request',
          payload: { id: 'g1', dot: 'digraph { A -> B }' },
        },
      }),
      iframeWindow,
      privilege: 'unrestricted',
      parentOrigin,
    });

    expect(resolved).toEqual({
      kind: 'graphviz-request',
      id: 'g1',
      dot: 'digraph { A -> B }',
    });
  });

  it('rejects graphviz requests that are not from the preview iframe', () => {
    const resolved = resolveHtmlPreviewBridgeEvent({
      event: messageEvent({
        source: {} as Window,
        data: {
          channel: HTML_PREVIEW_MESSAGE_CHANNEL,
          event: 'graphviz-render-request',
          payload: { id: 'g1', dot: 'digraph { A -> B }' },
        },
      }),
      iframeWindow,
      privilege: 'unrestricted',
      parentOrigin,
    });

    expect(resolved).toBeNull();
  });
});
