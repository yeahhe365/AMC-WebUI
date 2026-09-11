import { act, type MutableRefObject } from 'react';
import { setupTestRenderer } from '@/test/render/renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useCodeBlock,
  clearCodeBlockExpandedCache,
  readCachedCodeBlockExpanded,
  writeCachedCodeBlockExpanded,
  getCodeBlockExpandedCacheKey,
} from './useCodeBlock';

const triggerDownloadMock = vi.hoisted(() => vi.fn());
vi.mock('@/utils/export/core', async () => {
  const actual = await vi.importActual<typeof import('@/utils/export/core')>('@/utils/export/core');
  return {
    ...actual,
    triggerDownload: triggerDownloadMock,
  };
});

interface Measurements {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

const TestCodeBlock = ({
  text,
  measurements,
  className = 'language-ts',
  cacheKey,
  messageId,
  isLoading = false,
  onDownloadRef,
  onToggleWrapRef,
  onToggleExpandRef,
}: {
  text: string;
  measurements: Measurements;
  className?: string;
  cacheKey?: string;
  messageId?: string;
  isLoading?: boolean;
  onDownloadRef?: MutableRefObject<(() => void) | null>;
  onToggleWrapRef?: MutableRefObject<(() => void) | null>;
  onToggleExpandRef?: MutableRefObject<(() => void) | null>;
}) => {
  const {
    preRef,
    showPreview,
    finalLanguage,
    fenceFilename,
    lineCount,
    handleDownload,
    isDownloaded,
    isWrapped,
    handleToggleWrap,
    isExpanded,
    isOverflowing,
    handleToggleExpand,
  } = useCodeBlock({
    children: <code>{text}</code>,
    className,
    cacheKey,
    messageId,
    expandCodeBlocksByDefault: false,
    onOpenHtmlPreview: () => {},
    onOpenSidePanel: () => {},
    isLoading,
  });

  if (onDownloadRef) {
    onDownloadRef.current = handleDownload;
  }
  if (onToggleWrapRef) {
    onToggleWrapRef.current = handleToggleWrap;
  }
  if (onToggleExpandRef) {
    onToggleExpandRef.current = handleToggleExpand;
  }

  return (
    <pre
      data-show-preview={String(showPreview)}
      data-language={finalLanguage}
      data-fence-filename={fenceFilename ?? ''}
      data-line-count={String(lineCount)}
      data-downloaded={String(isDownloaded)}
      data-wrapped={String(isWrapped)}
      data-expanded={String(isExpanded)}
      data-overflowing={String(isOverflowing)}
      ref={(node) => {
        (preRef as MutableRefObject<HTMLPreElement | null>).current = node;

        if (node && !(node as HTMLPreElement & { __measured?: boolean }).__measured) {
          Object.defineProperties(node, {
            scrollTop: {
              configurable: true,
              get: () => measurements.scrollTop,
              set: (value: number) => {
                measurements.scrollTop = value;
              },
            },
            scrollHeight: {
              configurable: true,
              get: () => measurements.scrollHeight,
            },
            clientHeight: {
              configurable: true,
              get: () => measurements.clientHeight,
            },
          });

          (node as HTMLPreElement & { __measured?: boolean }).__measured = true;
        }
      }}
    >
      <code>{text}</code>
    </pre>
  );
};

describe('useCodeBlock', () => {
  const renderer = setupTestRenderer();
  let measurements: Measurements;

  beforeEach(() => {
    clearCodeBlockExpandedCache();
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(16);
      return 1;
    });

    measurements = {
      scrollTop: 0,
      scrollHeight: 400,
      clientHeight: 100,
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('auto-follows a growing collapsed block to its bottom', () => {
    act(() => {
      renderer.root.render(<TestCodeBlock text={'a'.repeat(400)} measurements={measurements} />);
    });

    measurements.scrollHeight = 500;

    act(() => {
      renderer.root.render(<TestCodeBlock text={'b'.repeat(500)} measurements={measurements} />);
    });

    expect(measurements.scrollTop).toBe(500);

    measurements.scrollHeight = 700;

    act(() => {
      renderer.root.render(<TestCodeBlock text={'c'.repeat(700)} measurements={measurements} />);
    });

    expect(measurements.scrollTop).toBe(700);
  });

  it('keeps a long static block pinned to the top on mount', () => {
    // prevTextLength starts at 0: a finished block (history) must not auto-scroll
    // to its bottom — only actively growing streams follow.
    act(() => {
      renderer.root.render(<TestCodeBlock text={'x'.repeat(600)} measurements={measurements} />);
    });

    expect(measurements.scrollTop).toBe(0);
  });

  it('auto-follows once a block grows past the collapse threshold', () => {
    measurements.scrollHeight = 100; // below the 320px collapse threshold

    act(() => {
      renderer.root.render(<TestCodeBlock text={'a'.repeat(100)} measurements={measurements} />);
    });

    expect(measurements.scrollTop).toBe(0);

    measurements.scrollHeight = 500;

    act(() => {
      renderer.root.render(<TestCodeBlock text={'b'.repeat(500)} measurements={measurements} />);
    });

    expect(measurements.scrollTop).toBe(500);
  });

  it('does not expose html preview controls for embedded html inside javascript code', () => {
    act(() => {
      renderer.root.render(
        <TestCodeBlock
          text={'const template = `<html><body>Hello</body></html>`;'}
          measurements={measurements}
          className="language-js"
        />,
      );
    });

    const pre = renderer.container.querySelector('pre');
    expect(pre?.dataset.showPreview).toBe('false');
    expect(pre?.dataset.language).toBe('js');
  });

  it('does not treat generic xml blocks as previewable html', () => {
    act(() => {
      renderer.root.render(
        <TestCodeBlock text={'<note><to>Jane</to></note>'} measurements={measurements} className="language-xml" />,
      );
    });

    const pre = renderer.container.querySelector('pre');
    expect(pre?.dataset.showPreview).toBe('false');
    expect(pre?.dataset.language).toBe('xml');
  });

  it('downloads SVG with detected title and sets isDownloaded feedback', () => {
    triggerDownloadMock.mockClear();
    const downloadRef = { current: null as (() => void) | null };

    act(() => {
      renderer.root.render(
        <TestCodeBlock
          text={'<svg viewBox="0 0 100 100"><title>Network Diagram</title><circle cx="50" cy="50" r="10" /></svg>'}
          measurements={measurements}
          className="language-svg"
          onDownloadRef={downloadRef}
        />,
      );
    });

    expect(downloadRef.current).toBeTypeOf('function');

    act(() => {
      downloadRef.current?.();
    });

    expect(triggerDownloadMock).toHaveBeenCalledTimes(1);
    const [downloadUrl, filename] = triggerDownloadMock.mock.calls[0];
    expect(filename).toBe('Network Diagram.svg');
    expect(downloadUrl).toMatch(/^blob:/);

    const pre = renderer.container.querySelector('pre');
    expect(pre?.dataset.downloaded).toBe('true');

    act(() => {
      vi.advanceTimersByTime(2100);
    });

    expect(pre?.dataset.downloaded).toBe('false');
  });

  it('repairs incomplete SVG during download', () => {
    triggerDownloadMock.mockClear();
    const downloadRef = { current: null as (() => void) | null };

    act(() => {
      renderer.root.render(
        <TestCodeBlock
          text={'<svg viewBox="0 0 100 100"><defs><linearGradient id="g1"><stop offset="0%" stop-color="#fff" />'}
          measurements={measurements}
          className="language-svg"
          onDownloadRef={downloadRef}
        />,
      );
    });

    act(() => {
      downloadRef.current?.();
    });

    expect(triggerDownloadMock).toHaveBeenCalledTimes(1);
    const [, filename] = triggerDownloadMock.mock.calls[0];
    expect(filename).toBe('vector-graphic.svg');
  });

  it('detects filename from comment in python script', () => {
    triggerDownloadMock.mockClear();
    const downloadRef = { current: null as (() => void) | null };

    act(() => {
      renderer.root.render(
        <TestCodeBlock
          text={'# filename: process_data.py\ndef run(): pass'}
          measurements={measurements}
          className="language-python"
          onDownloadRef={downloadRef}
        />,
      );
    });

    act(() => {
      downloadRef.current?.();
    });

    expect(triggerDownloadMock).toHaveBeenCalledWith(expect.any(String), 'process_data.py');
  });

  it('toggles isWrapped state when handleToggleWrap is called', () => {
    const wrapRef = { current: null as (() => void) | null };

    act(() => {
      renderer.root.render(
        <TestCodeBlock
          text={'const x = 1;'}
          measurements={measurements}
          className="language-typescript"
          onToggleWrapRef={wrapRef}
        />,
      );
    });

    const pre = renderer.container.querySelector('pre');
    expect(pre?.dataset.wrapped).toBe('false');

    act(() => {
      wrapRef.current?.();
    });
    expect(pre?.dataset.wrapped).toBe('true');

    act(() => {
      wrapRef.current?.();
    });
    expect(pre?.dataset.wrapped).toBe('false');
  });

  it('automatically expands a collapsed code block when user selects multiple lines', () => {
    measurements.scrollHeight = 500; // triggers overflow / collapse

    act(() => {
      renderer.root.render(
        <TestCodeBlock
          text={'line 1\nline 2\nline 3\nline 4\nline 5\nline 6\nline 7\nline 8\nline 9\nline 10'}
          measurements={measurements}
          className="language-text"
        />,
      );
    });

    const pre = renderer.container.querySelector('pre')!;
    const code = pre.querySelector('code')!;
    expect(pre.dataset.expanded).toBe('false');

    // Single-line selection should NOT expand
    const getSelectionMock = vi.fn().mockReturnValue({
      rangeCount: 1,
      isCollapsed: false,
      getRangeAt: () => ({ commonAncestorContainer: code }),
      toString: () => 'line 1',
    });
    vi.stubGlobal('getSelection', getSelectionMock);

    act(() => {
      document.dispatchEvent(new Event('selectionchange'));
    });
    expect(pre.dataset.expanded).toBe('false');

    // Multi-line selection inside code block SHOULD expand
    getSelectionMock.mockReturnValue({
      rangeCount: 1,
      isCollapsed: false,
      getRangeAt: () => ({ commonAncestorContainer: code }),
      toString: () => 'line 1\nline 2\nline 3',
    });

    act(() => {
      document.dispatchEvent(new Event('selectionchange'));
    });
    expect(pre.dataset.expanded).toBe('true');
  });

  it('extracts fenceFilename correctly from language className', () => {
    act(() => {
      renderer.root.render(
        <TestCodeBlock text={'print("hello")'} measurements={measurements} className="language-python:server.py" />,
      );
    });

    const pre = renderer.container.querySelector('pre');
    expect(pre?.dataset.language).toBe('python');
    expect(pre?.dataset.fenceFilename).toBe('server.py');
  });

  it('clears active selection inside the block when collapsing', () => {
    measurements.scrollHeight = 500;
    const expandRef = { current: null as (() => void) | null };

    act(() => {
      renderer.root.render(
        <TestCodeBlock
          text={'line 1\nline 2\nline 3\nline 4\nline 5'}
          measurements={measurements}
          className="language-text"
          onToggleExpandRef={expandRef}
        />,
      );
    });

    const pre = renderer.container.querySelector('pre')!;
    const removeAllRangesMock = vi.fn();
    const getSelectionMock = vi.fn().mockReturnValue({
      rangeCount: 1,
      isCollapsed: false,
      getRangeAt: () => ({
        commonAncestorContainer: pre,
        startContainer: pre,
        endContainer: pre,
      }),
      toString: () => 'line 1\nline 2',
      removeAllRanges: removeAllRangesMock,
    });
    vi.stubGlobal('getSelection', getSelectionMock);

    // Expand
    act(() => {
      expandRef.current?.();
    });
    expect(pre.dataset.expanded).toBe('true');

    // Collapse
    act(() => {
      expandRef.current?.();
    });
    expect(pre.dataset.expanded).toBe('false');
    expect(removeAllRangesMock).toHaveBeenCalledTimes(1);
  });

  it('correctly calculates and exposes lineCount', () => {
    act(() => {
      renderer.root.render(
        <TestCodeBlock text={'line 1\nline 2\nline 3\nline 4'} measurements={measurements} className="language-ts" />,
      );
    });

    const pre = renderer.container.querySelector('pre');
    expect(pre?.dataset.lineCount).toBe('4');
  });

  it('does not collapse a code block within tolerance threshold (320px + 48px buffer)', () => {
    measurements.scrollHeight = 340; // 340 <= 320 + 48, so should not overflow

    act(() => {
      renderer.root.render(
        <TestCodeBlock text={'line 1\nline 2\nline 3'} measurements={measurements} className="language-ts" />,
      );
    });

    const pre = renderer.container.querySelector('pre');
    expect(pre?.dataset.overflowing).toBe('false');

    // Height past tolerance (e.g. 400 > 368) does overflow
    measurements.scrollHeight = 400;
    act(() => {
      renderer.root.render(
        <TestCodeBlock
          text={'line 1\nline 2\nline 3\nline 4\nline 5'}
          measurements={measurements}
          className="language-ts"
        />,
      );
    });
    expect(pre?.dataset.overflowing).toBe('true');
  });

  it('smoothly resets scroll position to top when streaming completes', () => {
    measurements.scrollHeight = 500;
    measurements.scrollTop = 500;

    act(() => {
      renderer.root.render(
        <TestCodeBlock text={'a'.repeat(500)} measurements={measurements} className="language-ts" isLoading={true} />,
      );
    });

    const pre = renderer.container.querySelector('pre')!;
    const scrollToMock = vi.fn();
    pre.scrollTo = scrollToMock;

    // Stream completes: isLoading becomes false
    act(() => {
      renderer.root.render(
        <TestCodeBlock text={'a'.repeat(500)} measurements={measurements} className="language-ts" isLoading={false} />,
      );
    });

    expect(scrollToMock).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });

  it('correctly calculates lineCount for multi-line code', () => {
    act(() => {
      renderer.root.render(
        <TestCodeBlock
          text={'const a = 1;\nconst b = 2;\nconst c = 3;'}
          measurements={measurements}
          className="language-ts"
        />,
      );
    });

    const pre = renderer.container.querySelector('pre');
    expect(pre?.dataset.lineCount).toBe('3');
  });

  it('persists expanded state across unmount and remount when cacheKey is provided', () => {
    measurements.scrollHeight = 500;
    measurements.clientHeight = 320;

    let toggleExpand: (() => void) | null = null;
    const onToggleExpandRef = { current: null as (() => void) | null };

    // 1. Initial mount with cacheKey
    act(() => {
      renderer.root.render(
        <TestCodeBlock
          text={'line1\nline2\nline3\nline4\nline5'}
          measurements={measurements}
          className="language-ts"
          cacheKey="msg-123:code-0"
          onToggleExpandRef={onToggleExpandRef}
        />,
      );
    });

    const pre = renderer.container.querySelector('pre');
    expect(pre?.dataset.expanded).toBe('false');

    // 2. User expands the block
    toggleExpand = onToggleExpandRef.current;
    expect(toggleExpand).not.toBeNull();
    act(() => {
      toggleExpand!();
    });
    expect(renderer.container.querySelector('pre')?.dataset.expanded).toBe('true');

    // 3. Simulate unmount (scrolled out of view by virtual list)
    act(() => {
      renderer.root.render(<div data-testid="empty" />);
    });
    expect(renderer.container.querySelector('pre')).toBeNull();

    // 4. Remount with same cacheKey (scrolled back into view)
    act(() => {
      renderer.root.render(
        <TestCodeBlock
          text={'line1\nline2\nline3\nline4\nline5'}
          measurements={measurements}
          className="language-ts"
          cacheKey="msg-123:code-0"
          onToggleExpandRef={onToggleExpandRef}
        />,
      );
    });

    // Should still be expanded!
    expect(renderer.container.querySelector('pre')?.dataset.expanded).toBe('true');

    // 5. User collapses it
    toggleExpand = onToggleExpandRef.current;
    act(() => {
      toggleExpand!();
    });
    expect(renderer.container.querySelector('pre')?.dataset.expanded).toBe('false');

    // 6. Unmount and remount again
    act(() => {
      renderer.root.render(<div data-testid="empty" />);
    });
    act(() => {
      renderer.root.render(
        <TestCodeBlock
          text={'line1\nline2\nline3\nline4\nline5'}
          measurements={measurements}
          className="language-ts"
          cacheKey="msg-123:code-0"
        />,
      );
    });

    // Should remain collapsed!
    expect(renderer.container.querySelector('pre')?.dataset.expanded).toBe('false');
  });

  it('correctly generates and caches keys via helpers', () => {
    // getCodeBlockExpandedCacheKey priority
    expect(getCodeBlockExpandedCacheKey('custom-key', 'msg-1', 'code text')).toBe('custom-key');
    expect(getCodeBlockExpandedCacheKey(undefined, 'msg-1', 'code text')).toContain('msg-1:9:');
    expect(getCodeBlockExpandedCacheKey(undefined, undefined, 'some code')).toContain('code:9:');
    expect(getCodeBlockExpandedCacheKey(undefined, undefined, undefined)).toBeUndefined();

    // read/write/clear
    writeCachedCodeBlockExpanded('key-1', true);
    expect(readCachedCodeBlockExpanded('key-1')).toBe(true);

    writeCachedCodeBlockExpanded('key-1', false);
    expect(readCachedCodeBlockExpanded('key-1')).toBe(false);

    clearCodeBlockExpandedCache();
    expect(readCachedCodeBlockExpanded('key-1')).toBeUndefined();
  });
});
