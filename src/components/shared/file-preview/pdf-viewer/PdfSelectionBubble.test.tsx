import { act } from 'react';
import { setupProviderTestRenderer as setupTestRenderer } from '@/test/render/providerRenderer';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { PdfSelectionBubble } from './PdfSelectionBubble';
import * as clipboardUtils from '@/utils/clipboard';

describe('PdfSelectionBubble', () => {
  const renderer = setupTestRenderer({ providers: { language: 'en' } });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing when there is no active text selection', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    renderer.render(<PdfSelectionBubble containerRef={{ current: container }} />);
    expect(renderer.container.querySelector('[data-testid="pdf-selection-bubble"]')).toBeNull();

    container.remove();
  });

  it('renders bubble and handles copy and quote actions', async () => {
    const container = document.createElement('div');
    const textNode = document.createTextNode('Sample PDF text');
    container.appendChild(textNode);
    document.body.appendChild(container);

    const onQuote = vi.fn();
    const copySpy = vi.spyOn(clipboardUtils, 'copyTextToClipboard').mockResolvedValue(true);

    renderer.render(<PdfSelectionBubble containerRef={{ current: container }} onQuote={onQuote} />);

    // Mock window.getSelection
    const mockRange = {
      commonAncestorContainer: textNode,
      getBoundingClientRect: () => ({
        top: 200,
        bottom: 220,
        left: 100,
        right: 250,
        width: 150,
        height: 20,
      }),
    };

    const removeAllRanges = vi.fn();
    const mockSelection = {
      isCollapsed: false,
      rangeCount: 1,
      getRangeAt: () => mockRange,
      toString: () => 'Sample PDF text',
      removeAllRanges,
    };

    vi.spyOn(window, 'getSelection').mockReturnValue(mockSelection as unknown as Selection);

    // Trigger selection check
    await act(async () => {
      document.dispatchEvent(new Event('selectionchange'));
      // Wait for requestAnimationFrame
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const bubble = document.querySelector('[data-testid="pdf-selection-bubble"]');
    expect(bubble).not.toBeNull();

    // Click Quote
    const quoteButton = Array.from(bubble!.querySelectorAll('button')).find((b) =>
      b.getAttribute('aria-label')?.includes('Quote'),
    );
    expect(quoteButton).toBeDefined();

    await act(async () => {
      quoteButton!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    expect(onQuote).toHaveBeenCalledWith('Sample PDF text');
    expect(removeAllRanges).toHaveBeenCalled();

    // Click Copy on a re-opened selection
    await act(async () => {
      document.dispatchEvent(new Event('selectionchange'));
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const copyButton = Array.from(document.querySelectorAll('[data-testid="pdf-selection-bubble"] button')).find((b) =>
      b.getAttribute('aria-label')?.includes('Copy'),
    );
    expect(copyButton).toBeDefined();

    await act(async () => {
      copyButton!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    expect(copySpy).toHaveBeenCalledWith('Sample PDF text');

    container.remove();
  });
});
