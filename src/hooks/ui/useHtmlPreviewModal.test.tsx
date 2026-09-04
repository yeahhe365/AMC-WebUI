import { act, type PropsWithChildren, type RefObject } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { logService } from '@/services/logService';
import { WindowProvider } from '@/contexts/WindowContext';
import { useHtmlPreviewModal } from './useHtmlPreviewModal';
import {
  HTML_PREVIEW_CLEAR_SELECTION_EVENT,
  HTML_PREVIEW_DIAGNOSTIC_EVENT,
  HTML_PREVIEW_MESSAGE_CHANNEL,
} from '@/utils/html-preview/previewDocument';
import { renderHook } from '@/test/render/renderer';

const exportElementAsPngMock = vi.hoisted(() => vi.fn(async () => {}));

vi.mock('./useFullscreen', () => ({
  useFullscreen: () => ({
    enterFullscreen: vi.fn(),
    exitFullscreen: vi.fn(),
  }),
}));

vi.mock('@/utils/export/image', () => ({
  exportElementAsPng: exportElementAsPngMock,
}));

const HtmlPreviewWrapper = ({ children }: PropsWithChildren) => (
  <WindowProvider window={window} document={document}>
    {children}
  </WindowProvider>
);

describe('useHtmlPreviewModal', () => {
  beforeEach(() => {
    exportElementAsPngMock.mockClear();
  });

  it('tracks iframe readiness from bridge messages', () => {
    const iframe = document.createElement('iframe');
    const contentWindowStub = {} as Window;
    Object.defineProperty(iframe, 'contentWindow', {
      value: contentWindowStub,
      configurable: true,
    });
    const iframeRef = { current: iframe } as RefObject<HTMLIFrameElement>;

    const { result, unmount } = renderHook(
      () =>
        useHtmlPreviewModal({
          isOpen: true,
          onClose: vi.fn(),
          htmlContent: '<html><body>Hello</body></html>',
          iframeRef,
        }),
      { attachToDocument: true, wrapper: HtmlPreviewWrapper },
    );

    expect(result.current.isPreviewReady).toBe(false);

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { channel: HTML_PREVIEW_MESSAGE_CHANNEL, event: 'ready' },
          origin: 'null',
          source: contentWindowStub,
        }),
      );
    });

    expect(result.current.isPreviewReady).toBe(true);

    unmount();
  });

  it('accepts ready messages from same-origin unrestricted previews', () => {
    const iframe = document.createElement('iframe');
    const contentWindowStub = {} as Window;
    Object.defineProperty(iframe, 'contentWindow', {
      value: contentWindowStub,
      configurable: true,
    });
    const iframeRef = { current: iframe } as RefObject<HTMLIFrameElement>;

    const { result, unmount } = renderHook(
      () =>
        useHtmlPreviewModal({
          isOpen: true,
          onClose: vi.fn(),
          htmlContent: '<html><body>Hello</body></html>',
          iframeRef,
        }),
      { attachToDocument: true, wrapper: HtmlPreviewWrapper },
    );

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { channel: HTML_PREVIEW_MESSAGE_CHANNEL, event: 'ready' },
          origin: window.location.origin,
          source: contentWindowStub,
        }),
      );
    });

    expect(result.current.isPreviewReady).toBe(true);

    unmount();
  });

  it('closes the preview when the sandboxed iframe reports Escape', () => {
    const onClose = vi.fn();
    const iframe = document.createElement('iframe');
    const contentWindowStub = {} as Window;
    Object.defineProperty(iframe, 'contentWindow', {
      value: contentWindowStub,
      configurable: true,
    });
    const iframeRef = { current: iframe } as RefObject<HTMLIFrameElement>;

    const { unmount } = renderHook(
      () =>
        useHtmlPreviewModal({
          isOpen: true,
          onClose,
          htmlContent: '<html><body>Hello</body></html>',
          iframeRef,
        }),
      { attachToDocument: true, wrapper: HtmlPreviewWrapper },
    );

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { channel: HTML_PREVIEW_MESSAGE_CHANNEL, event: 'escape' },
          origin: 'null',
          source: contentWindowStub,
        }),
      );
    });

    expect(onClose).toHaveBeenCalledTimes(1);

    unmount();
  });

  it('forwards valid Live Artifact follow-up payloads from the preview iframe only', () => {
    const onLiveArtifactFollowUp = vi.fn();
    const iframe = document.createElement('iframe');
    const contentWindowStub = {} as Window;
    Object.defineProperty(iframe, 'contentWindow', {
      value: contentWindowStub,
      configurable: true,
    });
    const iframeRef = { current: iframe } as RefObject<HTMLIFrameElement>;

    const { unmount } = renderHook(
      () =>
        useHtmlPreviewModal({
          isOpen: true,
          onClose: vi.fn(),
          htmlContent: '<html><body>Hello</body></html>',
          iframeRef,
          privilege: 'sanitized',
          onLiveArtifactFollowUp,
        }),
      { attachToDocument: true, wrapper: HtmlPreviewWrapper },
    );

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            channel: HTML_PREVIEW_MESSAGE_CHANNEL,
            event: 'followup',
            payload: { instruction: 'Continue', state: { selected: 'B' } },
          },
          source: window,
        }),
      );
    });

    expect(onLiveArtifactFollowUp).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            channel: HTML_PREVIEW_MESSAGE_CHANNEL,
            event: 'followup',
            payload: { instruction: 'Continue', state: { selected: 'B' } },
          },
          origin: 'null',
          source: contentWindowStub,
        }),
      );
    });

    expect(onLiveArtifactFollowUp).toHaveBeenCalledWith({
      instruction: 'Continue',
      state: { selected: 'B' },
    });

    unmount();
  });

  it('does not forward Live Artifact follow-up payloads from unrestricted demo previews', () => {
    const onLiveArtifactFollowUp = vi.fn();
    const iframe = document.createElement('iframe');
    const contentWindowStub = {} as Window;
    Object.defineProperty(iframe, 'contentWindow', {
      value: contentWindowStub,
      configurable: true,
    });
    const iframeRef = { current: iframe } as RefObject<HTMLIFrameElement>;

    const { unmount } = renderHook(
      () =>
        useHtmlPreviewModal({
          isOpen: true,
          onClose: vi.fn(),
          htmlContent: '<html><body>Hello</body></html>',
          iframeRef,
          privilege: 'unrestricted',
          onLiveArtifactFollowUp,
        }),
      { attachToDocument: true, wrapper: HtmlPreviewWrapper },
    );

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            channel: HTML_PREVIEW_MESSAGE_CHANNEL,
            event: 'followup',
            payload: { instruction: 'Continue', state: { selected: 'B' } },
          },
          origin: 'null',
          source: contentWindowStub,
        }),
      );
    });

    expect(onLiveArtifactFollowUp).not.toHaveBeenCalled();

    unmount();
  });

  it('relays iframe text selections to the parent selection toolbar event', () => {
    const iframe = document.createElement('iframe');
    const contentWindowStub = {} as Window;
    Object.defineProperty(iframe, 'contentWindow', {
      value: contentWindowStub,
      configurable: true,
    });
    iframe.getBoundingClientRect = () =>
      ({
        top: 100,
        left: 50,
        width: 320,
        height: 180,
        bottom: 280,
        right: 370,
        x: 50,
        y: 100,
        toJSON: () => ({}),
      }) as DOMRect;
    const iframeRef = { current: iframe } as RefObject<HTMLIFrameElement>;
    const handleSelection = vi.fn();
    window.addEventListener('amc-live-artifact-selection', handleSelection);

    try {
      const { unmount } = renderHook(
        () =>
          useHtmlPreviewModal({
            isOpen: true,
            onClose: vi.fn(),
            htmlContent: '<html><body>Hello</body></html>',
            iframeRef,
          }),
        { attachToDocument: true, wrapper: HtmlPreviewWrapper },
      );

      act(() => {
        window.dispatchEvent(
          new MessageEvent('message', {
            data: {
              channel: HTML_PREVIEW_MESSAGE_CHANNEL,
              event: 'selection',
              payload: {
                text: 'Preview text',
                copyText: 'Preview text',
                rect: {
                  top: 20,
                  left: 30,
                  width: 90,
                  height: 18,
                  bottom: 38,
                },
              },
            },
            origin: 'null',
            source: contentWindowStub,
          }),
        );
      });

      expect(handleSelection).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: {
            text: 'Preview text',
            copyText: 'Preview text',
            rect: {
              top: 120,
              left: 80,
              width: 90,
              height: 18,
              bottom: 138,
            },
          },
        }),
      );

      unmount();
    } finally {
      window.removeEventListener('amc-live-artifact-selection', handleSelection);
    }
  });

  it('asks the sandboxed iframe to clear selection without reading cross-origin selection state', () => {
    const postMessage = vi.fn();
    const contentWindowStub = {
      postMessage,
      getSelection: vi.fn(() => {
        throw new DOMException('Blocked', 'SecurityError');
      }),
    } as unknown as Window;
    const iframe = document.createElement('iframe');
    Object.defineProperty(iframe, 'contentWindow', {
      value: contentWindowStub,
      configurable: true,
    });
    const iframeRef = { current: iframe } as RefObject<HTMLIFrameElement>;

    const { unmount } = renderHook(
      () =>
        useHtmlPreviewModal({
          isOpen: true,
          onClose: vi.fn(),
          htmlContent: '<html><body>Hello</body></html>',
          iframeRef,
        }),
      { attachToDocument: true, wrapper: HtmlPreviewWrapper },
    );

    act(() => {
      window.dispatchEvent(new CustomEvent('amc-live-artifact-clear-selection'));
    });

    expect(contentWindowStub.getSelection).not.toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledWith(
      {
        channel: HTML_PREVIEW_MESSAGE_CHANNEL,
        event: HTML_PREVIEW_CLEAR_SELECTION_EVENT,
      },
      '*',
    );

    unmount();
  });

  it('logs preview diagnostics from the current modal iframe only', () => {
    const warnSpy = vi.spyOn(logService, 'warn').mockImplementation(() => {});
    const iframe = document.createElement('iframe');
    const contentWindowStub = {} as Window;
    Object.defineProperty(iframe, 'contentWindow', {
      value: contentWindowStub,
      configurable: true,
    });
    const iframeRef = { current: iframe } as RefObject<HTMLIFrameElement>;

    try {
      const { unmount } = renderHook(
        () =>
          useHtmlPreviewModal({
            isOpen: true,
            onClose: vi.fn(),
            htmlContent: '<html><body>Hello</body></html>',
            iframeRef,
          }),
        { attachToDocument: true, wrapper: HtmlPreviewWrapper },
      );

      act(() => {
        window.dispatchEvent(
          new MessageEvent('message', {
            data: {
              channel: HTML_PREVIEW_MESSAGE_CHANNEL,
              event: HTML_PREVIEW_DIAGNOSTIC_EVENT,
              payload: { type: 'csp-violation', blockedURI: 'https://cdn.example/app.js' },
            },
            source: window,
          }),
        );
      });

      expect(warnSpy).not.toHaveBeenCalled();

      act(() => {
        window.dispatchEvent(
          new MessageEvent('message', {
            data: {
              channel: HTML_PREVIEW_MESSAGE_CHANNEL,
              event: HTML_PREVIEW_DIAGNOSTIC_EVENT,
              payload: { type: 'csp-violation', blockedURI: 'https://cdn.example/app.js' },
            },
            origin: 'null',
            source: contentWindowStub,
          }),
        );
      });

      expect(warnSpy).toHaveBeenCalledWith('Live Artifact preview diagnostic:', {
        type: 'csp-violation',
        blockedURI: 'https://cdn.example/app.js',
      });

      unmount();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('captures the current iframe document when taking a screenshot', async () => {
    const iframe = document.createElement('iframe');
    const iframeDocument = document.implementation.createHTMLDocument('Preview');
    iframeDocument.body.innerHTML = '<main data-current-preview="true">Rendered app state</main>';
    const contentWindowStub = {} as Window;
    Object.defineProperty(iframe, 'contentWindow', {
      value: contentWindowStub,
      configurable: true,
    });
    Object.defineProperty(iframe, 'contentDocument', {
      value: iframeDocument,
      configurable: true,
    });
    const iframeRef = { current: iframe } as RefObject<HTMLIFrameElement>;

    const { result, unmount } = renderHook(
      () =>
        useHtmlPreviewModal({
          isOpen: true,
          onClose: vi.fn(),
          htmlContent: '<html><body>Original source</body></html>',
          iframeRef,
        }),
      { attachToDocument: true, wrapper: HtmlPreviewWrapper },
    );

    await act(async () => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { channel: HTML_PREVIEW_MESSAGE_CHANNEL, event: 'ready' },
          origin: 'null',
          source: contentWindowStub,
        }),
      );
    });

    await act(async () => {
      await result.current.handleScreenshot();
    });

    expect(exportElementAsPngMock).toHaveBeenCalledWith(
      iframeDocument.body,
      'HTML Preview-screenshot.png',
      expect.objectContaining({ scale: 2 }),
    );

    unmount();
  });
});
