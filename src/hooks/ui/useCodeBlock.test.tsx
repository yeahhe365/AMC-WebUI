import { act, type MutableRefObject } from 'react';
import { setupTestRenderer } from '@/test/render/renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCodeBlock } from './useCodeBlock';

interface Measurements {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

const TestCodeBlock = ({
  text,
  measurements,
  className = 'language-ts',
}: {
  text: string;
  measurements: Measurements;
  className?: string;
}) => {
  const { preRef, showPreview, finalLanguage } = useCodeBlock({
    children: <code>{text}</code>,
    className,
    expandCodeBlocksByDefault: false,
    onOpenHtmlPreview: () => {},
    onOpenSidePanel: () => {},
  });

  return (
    <pre
      data-show-preview={String(showPreview)}
      data-language={finalLanguage}
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
});
