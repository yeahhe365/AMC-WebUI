import { act } from 'react';
import { installTestAnimationFrameController, type TestAnimationFrameController } from '@/test/browser/animationFrames';
import { setupTestRenderer } from '@/test/render/renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSmoothStreaming } from './useSmoothStreaming';

const OUTPUT_SELECTOR = '[data-testid="stream-output"]';

const TestComponent = ({ text, isStreaming }: { text: string; isStreaming: boolean }) => {
  const displayedText = useSmoothStreaming(text, isStreaming);
  return <div data-testid="stream-output">{displayedText}</div>;
};

describe('useSmoothStreaming', () => {
  const renderer = setupTestRenderer();
  let animationFrames: TestAnimationFrameController;

  const flushUntilTextMatches = (expectedText: string, maxFrames = 20) => {
    for (let i = 0; i < maxFrames; i += 1) {
      if (renderer.container.querySelector(OUTPUT_SELECTOR)?.textContent === expectedText) {
        return;
      }

      if (!animationFrames.flushNextFrame()) {
        return;
      }
    }
  };

  beforeEach(() => {
    animationFrames = installTestAnimationFrameController();

    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: false,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stops scheduling animation frames after catching up to the current text', () => {
    act(() => {
      renderer.root.render(<TestComponent text="abc" isStreaming />);
    });

    expect(animationFrames.scheduledFrameCount).toBe(1);

    flushUntilTextMatches('abc');

    expect(renderer.container.querySelector(OUTPUT_SELECTOR)).toHaveTextContent('abc');
    expect(animationFrames.scheduledFrameCount).toBe(0);
  });

  it('restarts animation when new streamed text arrives after the previous text finished rendering', () => {
    act(() => {
      renderer.root.render(<TestComponent text="abc" isStreaming />);
    });

    flushUntilTextMatches('abc');

    expect(renderer.container.querySelector(OUTPUT_SELECTOR)).toHaveTextContent('abc');
    expect(animationFrames.scheduledFrameCount).toBe(0);

    act(() => {
      renderer.root.render(<TestComponent text="abcdef" isStreaming />);
    });

    expect(animationFrames.scheduledFrameCount).toBe(1);

    flushUntilTextMatches('abcdef');

    expect(renderer.container.querySelector(OUTPUT_SELECTOR)).toHaveTextContent('abcdef');
    expect(animationFrames.scheduledFrameCount).toBe(0);
  });

  it('grows markdown tables line-by-line instead of swapping the whole text while streaming', () => {
    // A table streams in. The bypass must not swap displayedText to the full
    // received text at once (that abrupt height jump is what makes Virtuoso
    // reposition). Instead it advances line-by-line until it catches up.
    const rows = Array.from({ length: 10 }, (_, i) => `| row ${i} | value ${i} |`).join('\n');
    const tableMarkdown = ['| Name | Score |', '| --- | --- |', rows].join('\n');

    act(() => {
      renderer.root.render(<TestComponent text={tableMarkdown} isStreaming />);
    });

    // The full table does not appear in the first committed frame (it is not
    // swapped in as one atomic unit). It grows across throttled frames and
    // finishes at the complete text.
    expect(renderer.container.querySelector(OUTPUT_SELECTOR)?.textContent).toBe('');

    // After a few frames only part of the table has appeared.
    for (let i = 0; i < 4; i += 1) {
      animationFrames.flushNextFrame();
    }
    const partialLength = renderer.container.querySelector(OUTPUT_SELECTOR)?.textContent?.length ?? 0;
    expect(partialLength).toBeGreaterThan(0);
    expect(partialLength).toBeLessThan(tableMarkdown.length);

    flushUntilTextMatches(tableMarkdown);

    expect(renderer.container.querySelector(OUTPUT_SELECTOR)?.textContent).toBe(tableMarkdown);
    expect(animationFrames.scheduledFrameCount).toBe(0);
  });

  it('does not jump from partial prose straight to the full text when a table appears mid-stream', () => {
    // Prose streams in char-by-char, then a markdown table head arrives. The
    // bypass must advance the displayed text line-by-line from where the prose
    // left off — not swap to the entire received text (which would re-render
    // plain-text lines into a <table> in one frame and shift the viewport).
    const prosePrefix = '这里是一段用于填满前置内容的说明文字。';
    const tableHead = '| 语言 | 并发模型 |\n| --- | --- |\n| Go | goroutine |';

    // First render: prose only, streaming char-by-char, fully caught up.
    act(() => {
      renderer.root.render(<TestComponent text={prosePrefix} isStreaming />);
    });
    flushUntilTextMatches(prosePrefix);
    expect(renderer.container.querySelector(OUTPUT_SELECTOR)?.textContent).toBe(prosePrefix);

    // The table head arrives appended to the prose. Detection of the GFM table
    // head switches the hook into bypass mode.
    act(() => {
      renderer.root.render(<TestComponent text={`${prosePrefix}\n\n${tableHead}`} isStreaming />);
    });

    // After a few animation frames only some new lines have been appended —
    // the display did not jump straight to the full received text (which would
    // re-render plain-text lines into a <table> in one frame and shift the
    // viewport).
    for (let i = 0; i < 4; i += 1) {
      animationFrames.flushNextFrame();
    }
    const displayedAfterTable = renderer.container.querySelector(OUTPUT_SELECTOR)?.textContent;
    expect(displayedAfterTable?.length ?? 0).toBeLessThan(`${prosePrefix}\n\n${tableHead}`.length);
    expect(displayedAfterTable?.startsWith(prosePrefix)).toBe(true);

    flushUntilTextMatches(`${prosePrefix}\n\n${tableHead}`);
    expect(renderer.container.querySelector(OUTPUT_SELECTOR)?.textContent).toBe(`${prosePrefix}\n\n${tableHead}`);
  });

  it('bypasses character-by-character animation for streaming Live Artifact html candidates', () => {
    const partialArtifact = '<div style="display:grid"><strong>Streaming artifact';

    act(() => {
      renderer.root.render(<TestComponent text={partialArtifact} isStreaming />);
    });

    expect(renderer.container.querySelector(OUTPUT_SELECTOR)?.textContent).toBe(partialArtifact);
    expect(animationFrames.scheduledFrameCount).toBe(0);
  });

  it('bypasses character-by-character animation for streaming fenced interaction artifacts', () => {
    const partialInteraction = '```amc-live-artifact-interaction\n{"instruction":"Collect","schema":{';

    act(() => {
      renderer.root.render(<TestComponent text={partialInteraction} isStreaming />);
    });

    expect(renderer.container.querySelector(OUTPUT_SELECTOR)?.textContent).toBe(partialInteraction);
    expect(animationFrames.scheduledFrameCount).toBe(0);
  });
});
