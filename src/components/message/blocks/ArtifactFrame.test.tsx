import { act } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { logService } from '@/services/logService';
import { setupTestRenderer } from '@/test/render/renderer';
import { renderDotToSvgCached } from '@/features/graphviz/vizRuntime';
import {
  HTML_PREVIEW_CLEAR_SELECTION_EVENT,
  HTML_PREVIEW_COPY_EVENT,
  HTML_PREVIEW_DIAGNOSTIC_EVENT,
  HTML_PREVIEW_GRAPHVIZ_RENDER_REQUEST_EVENT,
  HTML_PREVIEW_GRAPHVIZ_RENDER_RESPONSE_EVENT,
  HTML_PREVIEW_MESSAGE_CHANNEL,
  HTML_PREVIEW_STREAM_RENDER_EVENT,
  loadKatex,
} from '@/utils/html-preview/previewDocument';
import { ArtifactFrame } from './ArtifactFrame';

vi.mock('@/features/graphviz/vizRuntime', () => ({
  renderDotToSvgCached: vi.fn(),
}));

// KaTeX is loaded lazily so the math chunk is not pulled into every markdown
// message. Tests that assert rendered `class="katex"` output need it in memory.
beforeAll(async () => {
  await loadKatex();
});

const createRect = (overrides: Partial<DOMRect> = {}): DOMRect =>
  ({
    width: 320,
    height: 180,
    top: 100,
    left: 50,
    right: 370,
    bottom: 280,
    x: 50,
    y: 100,
    toJSON: () => ({}),
    ...overrides,
  }) as DOMRect;

describe('ArtifactFrame', () => {
  const renderer = setupTestRenderer();

  beforeEach(() => {
    vi.mocked(renderDotToSvgCached).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('injects the configured base font size into static artifact documents', () => {
    act(() => {
      renderer.root.render(<ArtifactFrame html="<section><p>Artifact text</p></section>" baseFontSize={18} />);
    });

    const iframe = renderer.container.querySelector('iframe');

    expect(iframe?.getAttribute('srcdoc')).toContain('data-amc-live-artifact-base-font-size="true"');
    expect(iframe?.getAttribute('srcdoc')).toContain('--amc-live-artifact-font-size:18px');
  });

  it('offers a larger preview that keeps the sanitized Live Artifact engine', () => {
    const onOpenPreview = vi.fn();

    act(() => {
      renderer.root.render(
        <ArtifactFrame html="<section><p>Artifact text</p></section>" onOpenPreview={onOpenPreview} />,
      );
    });

    const openButton = renderer.container.querySelector('button[title="Open larger preview"]') as HTMLButtonElement;
    expect(openButton).not.toBeNull();

    act(() => {
      openButton.click();
    });

    expect(onOpenPreview).toHaveBeenCalledTimes(1);
  });

  it('hides the larger-preview action while the artifact is still streaming', () => {
    act(() => {
      renderer.root.render(
        <ArtifactFrame html="<section><p>Artifact text</p></section>" isLoading onOpenPreview={vi.fn()} />,
      );
    });

    expect(renderer.container.querySelector('button[title="Open larger preview"]')).toBeNull();
  });

  it('injects transparent Live Artifact theme tokens into static artifact documents', () => {
    act(() => {
      renderer.root.render(<ArtifactFrame html="<section><p>Artifact text</p></section>" themeId="onyx" />);
    });

    const iframe = renderer.container.querySelector('iframe');
    const srcDoc = iframe?.getAttribute('srcdoc') ?? '';

    expect(srcDoc).toContain('data-amc-live-artifact-theme="true"');
    expect(srcDoc).toContain(
      'html,body{margin:0;padding:0;height:auto!important;min-height:0!important;max-height:none!important;background:transparent',
    );
    expect(srcDoc).toContain('--amc-live-artifact-text:#f5f5f7');
    expect(srcDoc).toContain('--amc-live-artifact-surface:#1c1c20');
    expect(srcDoc).toContain('--amc-live-artifact-border:#2c2c34');
    expect(srcDoc).toContain('--amc-live-artifact-accent:#6ba3fc');
  });

  it('injects the configured base font size into streaming artifact documents', () => {
    act(() => {
      renderer.root.render(
        <ArtifactFrame html="<section><p>Artifact text</p></section>" baseFontSize={20} isLoading />,
      );
    });

    const iframe = renderer.container.querySelector('iframe');

    expect(iframe?.getAttribute('srcdoc')).toContain('data-amc-live-artifact-base-font-size="true"');
    expect(iframe?.getAttribute('srcdoc')).toContain('--amc-live-artifact-font-size:20px');
    expect(iframe?.getAttribute('srcdoc')).toContain('data-amc-stream-preview-root');
  });

  it('injects transparent Live Artifact theme tokens into streaming artifact documents', () => {
    act(() => {
      renderer.root.render(
        <ArtifactFrame html="<section><p>Artifact text</p></section>" themeId="graphite" isLoading />,
      );
    });

    const iframe = renderer.container.querySelector('iframe');
    const srcDoc = iframe?.getAttribute('srcdoc') ?? '';

    expect(srcDoc).toContain('data-amc-live-artifact-theme="true"');
    expect(srcDoc).toContain(
      'html,body{margin:0;padding:0;height:auto!important;min-height:0!important;max-height:none!important;background:transparent',
    );
    expect(srcDoc).toContain('--amc-live-artifact-text:#f2f2f4');
    expect(srcDoc).toContain('--amc-live-artifact-surface:#3c3c40');
    expect(srcDoc).toContain('--amc-live-artifact-border:#4c4c52');
    expect(srcDoc).toContain('--amc-live-artifact-accent:#6ba3fc');
    expect(srcDoc).toContain('data-amc-stream-preview-root');
  });

  it('relays iframe text selections to the parent selection toolbar event', () => {
    const handleSelection = vi.fn();
    window.addEventListener('amc-live-artifact-selection', handleSelection);

    try {
      act(() => {
        renderer.root.render(<ArtifactFrame html="<section><p>Artifact text</p></section>" />);
      });

      const iframe = renderer.container.querySelector('iframe');
      expect(iframe).not.toBeNull();
      iframe!.getBoundingClientRect = () => createRect();

      act(() => {
        window.dispatchEvent(
          new MessageEvent('message', {
            data: {
              channel: HTML_PREVIEW_MESSAGE_CHANNEL,
              event: 'selection',
              payload: {
                text: 'Artifact text',
                copyText: 'Artifact text',
                rect: {
                  top: 20,
                  left: 30,
                  width: 90,
                  height: 18,
                  bottom: 38,
                },
              },
            },
            source: iframe!.contentWindow,
            origin: 'null',
          }),
        );
      });

      expect(handleSelection).toHaveBeenCalledTimes(1);
      const event = handleSelection.mock.calls[0][0] as CustomEvent;
      expect(event.detail).toEqual({
        text: 'Artifact text',
        copyText: 'Artifact text',
        rect: {
          top: 120,
          left: 80,
          width: 90,
          height: 18,
          bottom: 138,
        },
      });
    } finally {
      window.removeEventListener('amc-live-artifact-selection', handleSelection);
    }
  });

  it('keeps streaming iframe srcdoc stable and posts html updates to the runner', () => {
    vi.useFakeTimers();

    act(() => {
      renderer.root.render(<ArtifactFrame html="<section>First chunk</section>" isLoading />);
    });

    const iframe = renderer.container.querySelector('iframe');
    expect(iframe).not.toBeNull();
    const initialSrcDoc = iframe!.getAttribute('srcdoc');
    expect(initialSrcDoc).toContain('data-amc-stream-preview-root');

    const postMessage = vi.fn();
    Object.defineProperty(iframe!, 'contentWindow', {
      configurable: true,
      value: { postMessage },
    });

    act(() => {
      renderer.root.render(<ArtifactFrame html="<section>Second chunk</section>" isLoading />);
    });

    expect(iframe!.getAttribute('srcdoc')).toBe(initialSrcDoc);
    expect(postMessage).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(iframe!.getAttribute('srcdoc')).toBe(initialSrcDoc);
    expect(postMessage).toHaveBeenCalledWith(
      {
        channel: HTML_PREVIEW_MESSAGE_CHANNEL,
        event: HTML_PREVIEW_STREAM_RENDER_EVENT,
        html: '<section>Second chunk</section>',
      },
      '*',
    );
  });

  it('reposts the latest streaming html when the sandboxed iframe reports ready', () => {
    act(() => {
      renderer.root.render(<ArtifactFrame html="<section>Ready payload</section>" isLoading />);
    });

    const iframe = renderer.container.querySelector('iframe');
    expect(iframe).not.toBeNull();
    const postMessage = vi.fn();
    Object.defineProperty(iframe!, 'contentWindow', {
      configurable: true,
      value: { postMessage },
    });

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            channel: HTML_PREVIEW_MESSAGE_CHANNEL,
            event: 'ready',
          },
          source: iframe!.contentWindow,
          origin: 'null',
        }),
      );
    });

    expect(postMessage).toHaveBeenCalledWith(
      {
        channel: HTML_PREVIEW_MESSAGE_CHANNEL,
        event: HTML_PREVIEW_STREAM_RENDER_EVENT,
        html: '<section>Ready payload</section>',
      },
      '*',
    );
  });

  it('retries posting streaming html after contentWindow becomes available', () => {
    vi.useFakeTimers();

    act(() => {
      renderer.root.render(<ArtifactFrame html="<section>Deferred chunk</section>" isLoading />);
    });

    const iframe = renderer.container.querySelector('iframe');
    expect(iframe).not.toBeNull();

    // First flush has no contentWindow yet.
    Object.defineProperty(iframe!, 'contentWindow', {
      configurable: true,
      value: null,
    });

    act(() => {
      vi.advanceTimersByTime(150);
    });

    const postMessage = vi.fn();
    Object.defineProperty(iframe!, 'contentWindow', {
      configurable: true,
      value: { postMessage },
    });

    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(postMessage).toHaveBeenCalledWith(
      {
        channel: HTML_PREVIEW_MESSAGE_CHANNEL,
        event: HTML_PREVIEW_STREAM_RENDER_EVENT,
        html: '<section>Deferred chunk</section>',
      },
      '*',
    );
  });

  it('posts KaTeX-rendered html updates while streaming formulas', () => {
    vi.useFakeTimers();

    act(() => {
      renderer.root.render(<ArtifactFrame html="<section>Starting</section>" isLoading />);
    });

    const iframe = renderer.container.querySelector('iframe');
    expect(iframe).not.toBeNull();
    const postMessage = vi.fn();
    Object.defineProperty(iframe!, 'contentWindow', {
      configurable: true,
      value: { postMessage },
    });

    act(() => {
      renderer.root.render(<ArtifactFrame html={String.raw`<section><p>Action \(a_t\)</p></section>`} isLoading />);
    });

    act(() => {
      vi.advanceTimersByTime(150);
    });

    const postedMessage = postMessage.mock.calls.at(-1)?.[0];
    expect(postedMessage).toMatchObject({
      channel: HTML_PREVIEW_MESSAGE_CHANNEL,
      event: HTML_PREVIEW_STREAM_RENDER_EVENT,
    });
    expect(postedMessage.html).toContain('class="katex"');
    expect(postedMessage.html).toContain('a_t');
    expect(postedMessage.html).toContain('data-amc-katex');
    expect(postedMessage.html).not.toContain(String.raw`\(a_t\)`);
  });

  it('flushes the latest streaming html during continuous updates', () => {
    vi.useFakeTimers();

    act(() => {
      renderer.root.render(<ArtifactFrame html="<section>Chunk 1</section>" isLoading />);
    });

    const iframe = renderer.container.querySelector('iframe');
    const postMessage = vi.fn();
    Object.defineProperty(iframe!, 'contentWindow', {
      configurable: true,
      value: { postMessage },
    });

    act(() => {
      renderer.root.render(<ArtifactFrame html="<section>Chunk 2</section>" isLoading />);
    });

    act(() => {
      vi.advanceTimersByTime(60);
    });

    act(() => {
      renderer.root.render(<ArtifactFrame html="<section>Chunk 3</section>" isLoading />);
    });

    act(() => {
      vi.advanceTimersByTime(60);
    });

    expect(postMessage).toHaveBeenCalledWith(
      {
        channel: HTML_PREVIEW_MESSAGE_CHANNEL,
        event: HTML_PREVIEW_STREAM_RENDER_EVENT,
        html: '<section>Chunk 3</section>',
      },
      '*',
    );
  });

  it('asks the sandboxed iframe to clear selection without reading cross-origin selection state', () => {
    const postMessage = vi.fn();
    const contentWindowStub = {
      postMessage,
      getSelection: vi.fn(() => {
        throw new DOMException('Blocked', 'SecurityError');
      }),
    } as unknown as Window;

    act(() => {
      renderer.root.render(<ArtifactFrame html="<section><p>Artifact text</p></section>" />);
    });

    const iframe = renderer.container.querySelector('iframe');
    Object.defineProperty(iframe!, 'contentWindow', {
      configurable: true,
      value: contentWindowStub,
    });

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
  });

  it('writes data-amc-copy text to the clipboard from the parent when the sandbox reports a copy event', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    act(() => {
      renderer.root.render(<ArtifactFrame html="<section><p>Artifact</p></section>" />);
    });

    const iframe = renderer.container.querySelector('iframe');

    await act(async () => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            channel: HTML_PREVIEW_MESSAGE_CHANNEL,
            event: HTML_PREVIEW_COPY_EVENT,
            payload: { text: 'npm install katex' },
          },
          source: iframe!.contentWindow,
          origin: 'null',
        }),
      );
    });

    expect(writeText).toHaveBeenCalledWith('npm install katex');
  });

  it('logs preview diagnostics reported by the sandboxed iframe', () => {
    const warnSpy = vi.spyOn(logService, 'warn').mockImplementation(() => {});

    try {
      act(() => {
        renderer.root.render(
          <ArtifactFrame html="<section><img src='https://example.com/missing.png' alt='Missing'></section>" />,
        );
      });

      const iframe = renderer.container.querySelector('iframe');

      act(() => {
        window.dispatchEvent(
          new MessageEvent('message', {
            data: {
              channel: HTML_PREVIEW_MESSAGE_CHANNEL,
              event: HTML_PREVIEW_DIAGNOSTIC_EVENT,
              payload: {
                type: 'resource-error',
                tagName: 'img',
                url: 'https://example.com/missing.png',
              },
            },
            source: iframe!.contentWindow,
            origin: 'null',
          }),
        );
      });

      expect(warnSpy).toHaveBeenCalledWith('Live Artifact preview diagnostic:', {
        type: 'resource-error',
        tagName: 'img',
        url: 'https://example.com/missing.png',
      });
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('renders graphviz on the parent page and posts the sanitized SVG reply to the iframe', async () => {
    vi.mocked(renderDotToSvgCached).mockResolvedValueOnce({
      ok: true,
      svg: '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>',
    });

    const postMessage = vi.fn();
    const iframeWindowStub = { postMessage } as unknown as Window;

    act(() => {
      renderer.root.render(<ArtifactFrame html="<div data-amc-graphviz='digraph { A -> B }'></div>" themeId="pearl" />);
    });

    const iframe = renderer.container.querySelector('iframe');
    Object.defineProperty(iframe!, 'contentWindow', {
      configurable: true,
      value: iframeWindowStub,
    });

    await act(async () => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            channel: HTML_PREVIEW_MESSAGE_CHANNEL,
            event: HTML_PREVIEW_GRAPHVIZ_RENDER_REQUEST_EVENT,
            payload: { id: 'amc-gv-1', dot: 'digraph { A -> B }' },
          },
          source: iframeWindowStub,
          origin: 'null',
        }),
      );
    });

    expect(renderDotToSvgCached).toHaveBeenCalledWith('digraph { A -> B }', { themeId: 'pearl' });
    expect(postMessage).toHaveBeenCalledWith(
      {
        channel: HTML_PREVIEW_MESSAGE_CHANNEL,
        event: HTML_PREVIEW_GRAPHVIZ_RENDER_RESPONSE_EVENT,
        payload: {
          id: 'amc-gv-1',
          ok: true,
          svg: '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>',
        },
      },
      '*',
    );
  });

  it('reports a render error back to the iframe when graphviz fails', async () => {
    vi.mocked(renderDotToSvgCached).mockResolvedValueOnce({ ok: false, error: 'too-large' });

    const postMessage = vi.fn();
    const iframeWindowStub = { postMessage } as unknown as Window;

    act(() => {
      renderer.root.render(<ArtifactFrame html="<div data-amc-graphviz='digraph { A -> B }'></div>" />);
    });

    const iframe = renderer.container.querySelector('iframe');
    Object.defineProperty(iframe!, 'contentWindow', {
      configurable: true,
      value: iframeWindowStub,
    });

    await act(async () => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            channel: HTML_PREVIEW_MESSAGE_CHANNEL,
            event: HTML_PREVIEW_GRAPHVIZ_RENDER_REQUEST_EVENT,
            payload: { id: 'amc-gv-2', dot: 'digraph { A -> B }' },
          },
          source: iframeWindowStub,
          origin: 'null',
        }),
      );
    });

    expect(postMessage).toHaveBeenCalledWith(
      {
        channel: HTML_PREVIEW_MESSAGE_CHANNEL,
        event: HTML_PREVIEW_GRAPHVIZ_RENDER_RESPONSE_EVENT,
        payload: { id: 'amc-gv-2', ok: false, error: 'too-large' },
      },
      '*',
    );
  });

  it('ignores graphviz requests with a malformed payload', async () => {
    const postMessage = vi.fn();
    const iframeWindowStub = { postMessage } as unknown as Window;

    act(() => {
      renderer.root.render(<ArtifactFrame html="<section>Text</section>" />);
    });

    const iframe = renderer.container.querySelector('iframe');
    Object.defineProperty(iframe!, 'contentWindow', {
      configurable: true,
      value: iframeWindowStub,
    });

    await act(async () => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            channel: HTML_PREVIEW_MESSAGE_CHANNEL,
            event: HTML_PREVIEW_GRAPHVIZ_RENDER_REQUEST_EVENT,
            payload: { id: 42 }, // missing dot
          },
          source: iframeWindowStub,
          origin: 'null',
        }),
      );
    });

    expect(renderDotToSvgCached).not.toHaveBeenCalled();
    expect(postMessage).not.toHaveBeenCalled();
  });
});
