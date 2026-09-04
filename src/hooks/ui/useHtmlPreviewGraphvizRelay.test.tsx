import { act, type PropsWithChildren, type RefObject } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WindowProvider } from '@/contexts/WindowContext';
import { renderDotToSvgCached } from '@/features/graphviz/vizRuntime';
import {
  HTML_PREVIEW_GRAPHVIZ_RENDER_RESPONSE_EVENT,
  HTML_PREVIEW_MESSAGE_CHANNEL,
} from '@/utils/html-preview/previewDocument';
import { renderHook } from '@/test/render/renderer';
import { useHtmlPreviewGraphvizRelay } from './useHtmlPreviewGraphvizRelay';

vi.mock('@/features/graphviz/vizRuntime', () => ({
  renderDotToSvgCached: vi.fn(),
}));

const GraphvizRelayWrapper = ({ children }: PropsWithChildren) => (
  <WindowProvider window={window} document={document}>
    {children}
  </WindowProvider>
);

describe('useHtmlPreviewGraphvizRelay', () => {
  beforeEach(() => {
    vi.mocked(renderDotToSvgCached).mockReset();
  });

  it('relays graphviz layout for unrestricted same-origin preview iframes', async () => {
    vi.mocked(renderDotToSvgCached).mockResolvedValue({ ok: true, svg: '<svg></svg>' });
    const postMessage = vi.fn();
    const contentWindowStub = { postMessage } as unknown as Window;
    const iframe = document.createElement('iframe');
    Object.defineProperty(iframe, 'contentWindow', {
      value: contentWindowStub,
      configurable: true,
    });
    const iframeRef = { current: iframe } as RefObject<HTMLIFrameElement>;

    const { unmount } = renderHook(
      () =>
        useHtmlPreviewGraphvizRelay({
          iframeRef,
          privilege: 'unrestricted',
          themeId: 'pearl',
        }),
      { attachToDocument: true, wrapper: GraphvizRelayWrapper },
    );

    await act(async () => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            channel: HTML_PREVIEW_MESSAGE_CHANNEL,
            event: 'graphviz-render-request',
            payload: { id: 'g1', dot: 'digraph { A -> B }' },
          },
          origin: window.location.origin,
          source: contentWindowStub,
        }),
      );
      await Promise.resolve();
    });

    expect(renderDotToSvgCached).toHaveBeenCalledWith('digraph { A -> B }', { themeId: 'pearl' });
    expect(postMessage).toHaveBeenCalledWith(
      {
        channel: HTML_PREVIEW_MESSAGE_CHANNEL,
        event: HTML_PREVIEW_GRAPHVIZ_RENDER_RESPONSE_EVENT,
        payload: { id: 'g1', ok: true, svg: '<svg></svg>' },
      },
      '*',
    );

    unmount();
  });
});
