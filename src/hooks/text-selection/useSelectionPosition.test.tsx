import { act, type RefObject } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSelectionPosition } from './useSelectionPosition';
import { renderHook } from '@/test/render/renderer';
import { renderHookWithProviders } from '@/test/render/providerRenderer';

const createRect = (overrides: Partial<DOMRect> = {}): DOMRect =>
  ({
    width: 50,
    height: 20,
    top: 100,
    left: 200,
    right: 250,
    bottom: 120,
    x: 200,
    y: 100,
    toJSON: () => ({}),
    ...overrides,
  }) as DOMRect;

const createToolbarRef = () => {
  const toolbarRef = { current: document.createElement('div') } as RefObject<HTMLDivElement>;
  toolbarRef.current!.getBoundingClientRect = () => createRect({ width: 100 });
  return toolbarRef;
};

const selectNode = (node: Node) => {
  const range = document.createRange();
  range.selectNode(node);
  range.getBoundingClientRect = () => createRect();

  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);

  act(() => {
    document.dispatchEvent(new Event('selectionchange'));
  });

  return selection;
};

const createIsolatedWindowContext = () => {
  const iframe = document.createElement('iframe');
  document.body.appendChild(iframe);
  const targetWindow = iframe.contentWindow!;
  const targetDocument = targetWindow.document;
  targetDocument.body.innerHTML = '';

  return {
    targetWindow,
    targetDocument,
    cleanup: () => iframe.remove(),
  };
};

const selectNodeInDocument = (node: Node, targetDocument: Document, targetWindow: Window) => {
  const range = targetDocument.createRange();
  range.selectNode(node);
  range.getBoundingClientRect = () => createRect();

  const selection = targetWindow.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);

  act(() => {
    targetDocument.dispatchEvent(new Event('selectionchange'));
  });

  return selection;
};

afterEach(() => {
  window.getSelection()?.removeAllRanges();
});

describe('useSelectionPosition', () => {
  it('reads text selection from the WindowProvider document', async () => {
    const { targetWindow, targetDocument, cleanup } = createIsolatedWindowContext();
    const host = targetDocument.createElement('div');
    const strong = targetDocument.createElement('strong');
    strong.textContent = 'hello from pip';
    host.appendChild(strong);
    targetDocument.body.appendChild(host);

    const toolbarRef = {
      current: targetDocument.createElement('div'),
    } as RefObject<HTMLDivElement>;
    toolbarRef.current!.getBoundingClientRect = () => createRect({ width: 100 });

    const { result, unmount } = renderHookWithProviders(
      () =>
        useSelectionPosition({
          containerRef: host,
          isAudioActive: false,
          toolbarRef,
        }),
      {
        window: targetWindow,
        document: targetDocument,
      },
    );

    selectNodeInDocument(strong, targetDocument, targetWindow);

    await vi.waitFor(() => {
      expect(result.current.selectedText).toBe('**hello from pip**');
      expect(result.current.position).not.toBeNull();
    });

    targetWindow.getSelection()?.removeAllRanges();
    unmount();
    cleanup();
  });

  it('does not crash when the container is temporarily null', () => {
    const textNode = document.createTextNode('hello world');
    document.body.appendChild(textNode);

    const toolbarRef = createToolbarRef();

    const { unmount } = renderHook(() =>
      useSelectionPosition({
        containerRef: null,
        isAudioActive: false,
        toolbarRef,
      }),
    );

    const range = document.createRange();
    range.selectNodeContents(textNode);
    range.getBoundingClientRect = () => createRect();

    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    expect(() => {
      act(() => {
        document.dispatchEvent(new Event('selectionchange'));
      });
    }).not.toThrow();

    unmount();
  });

  it('supports a direct HTMLElement container reference', async () => {
    const host = document.createElement('div');
    const textNode = document.createTextNode('hello world');
    host.appendChild(textNode);
    document.body.appendChild(host);

    const toolbarRef = createToolbarRef();

    const { result, unmount } = renderHook(() =>
      useSelectionPosition({
        containerRef: host,
        isAudioActive: false,
        toolbarRef,
      }),
    );

    const range = document.createRange();
    range.selectNodeContents(textNode);
    range.getBoundingClientRect = () => createRect();

    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    act(() => {
      document.dispatchEvent(new Event('selectionchange'));
    });

    await vi.waitFor(() => {
      expect(result.current.selectedText).toBe('hello world');
      expect(result.current.position).not.toBeNull();
    });

    unmount();
  });

  it('copies markdown text to the clipboard on global copy', async () => {
    const host = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = 'hello world';
    host.appendChild(strong);
    document.body.appendChild(host);

    const toolbarRef = createToolbarRef();
    const { result, unmount } = renderHook(() =>
      useSelectionPosition({
        containerRef: host,
        isAudioActive: false,
        toolbarRef,
      }),
    );

    selectNode(strong);

    await vi.waitFor(() => {
      expect(result.current.selectedText).toBe('**hello world**');
    });

    const setData = vi.fn();
    const copyEvent = new Event('copy', { bubbles: true, cancelable: true });
    Object.defineProperty(copyEvent, 'clipboardData', {
      configurable: true,
      value: { setData },
    });

    act(() => {
      document.dispatchEvent(copyEvent);
    });

    expect(copyEvent.defaultPrevented).toBe(true);
    expect(setData).toHaveBeenCalledWith('text/plain', '**hello world**');

    unmount();
  });

  it('copies plain selected text on global copy when formatting preservation is disabled', async () => {
    const host = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = 'hello world';
    host.appendChild(strong);
    document.body.appendChild(host);

    const toolbarRef = createToolbarRef();
    const { result, unmount } = renderHook(() =>
      useSelectionPosition({
        containerRef: host,
        isAudioActive: false,
        toolbarRef,
        preserveFormattingOnCopy: false,
      }),
    );

    selectNode(strong);

    await vi.waitFor(() => {
      expect(result.current.selectedText).toBe('**hello world**');
    });

    const setData = vi.fn();
    const copyEvent = new Event('copy', { bubbles: true, cancelable: true });
    Object.defineProperty(copyEvent, 'clipboardData', {
      configurable: true,
      value: { setData },
    });

    act(() => {
      document.dispatchEvent(copyEvent);
    });

    expect(copyEvent.defaultPrevented).toBe(true);
    expect(setData).toHaveBeenCalledWith('text/plain', 'hello world');

    unmount();
  });

  it('excludes non-selectable UI chrome from formatted and plain selection text', async () => {
    const host = document.createElement('div');
    const chrome = document.createElement('span');
    chrome.className = 'select-none';
    chrome.textContent = 'Python Copy';
    const strong = document.createElement('strong');
    strong.textContent = 'hello world';
    host.append(chrome, strong);
    document.body.appendChild(host);

    const toolbarRef = createToolbarRef();
    const { result, unmount } = renderHook(() =>
      useSelectionPosition({
        containerRef: host,
        isAudioActive: false,
        toolbarRef,
        preserveFormattingOnCopy: false,
      }),
    );

    const range = document.createRange();
    range.selectNodeContents(host);
    range.getBoundingClientRect = () => createRect();

    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    act(() => {
      document.dispatchEvent(new Event('selectionchange'));
    });

    await vi.waitFor(() => {
      expect(result.current.selectedText).toBe('**hello world**');
      expect(result.current.selectedCopyText).toBe('hello world');
    });

    unmount();
  });

  it('keeps selected code block text plain so partial code copies preserve indentation and operators', async () => {
    const host = document.createElement('div');
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    const selectedCode = [
      'for (int i = 1; i <= limit; i++) {',
      '    if (i % 2 == 0) {',
      '        System.out.println(i + " 是偶数");',
      '    } else {',
      '        System.out.println(i + " 是奇数");',
      '    }',
      '    sum += i;',
    ].join('\n');
    const firstSpan = document.createElement('span');
    firstSpan.textContent = selectedCode;
    code.appendChild(firstSpan);
    pre.appendChild(code);
    host.appendChild(pre);
    document.body.appendChild(host);

    const toolbarRef = createToolbarRef();
    const { result, unmount } = renderHook(() =>
      useSelectionPosition({
        containerRef: host,
        isAudioActive: false,
        toolbarRef,
      }),
    );

    const range = document.createRange();
    range.selectNodeContents(firstSpan);
    range.getBoundingClientRect = () => createRect();

    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    act(() => {
      document.dispatchEvent(new Event('selectionchange'));
    });

    await vi.waitFor(() => {
      expect(result.current.selectedCopyText).toBe(selectedCode);
      expect(result.current.selectedCopyText).not.toContain('\\=');
    });

    unmount();
  });

  it('notifies when global copy uses the selected markdown text', async () => {
    const host = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = 'hello world';
    host.appendChild(strong);
    document.body.appendChild(host);

    const onCopySuccess = vi.fn();
    const toolbarRef = createToolbarRef();
    const { result, unmount } = renderHook(() =>
      useSelectionPosition({
        containerRef: host,
        isAudioActive: false,
        toolbarRef,
        onCopySuccess,
      }),
    );

    selectNode(strong);
    await vi.waitFor(() => {
      expect(result.current.selectedText).toBe('**hello world**');
    });

    const copyEvent = new Event('copy', { bubbles: true, cancelable: true });
    Object.defineProperty(copyEvent, 'clipboardData', {
      configurable: true,
      value: { setData: vi.fn() },
    });

    act(() => {
      document.dispatchEvent(copyEvent);
    });

    await vi.waitFor(() => {
      expect(onCopySuccess).toHaveBeenCalledWith('**hello world**');
    });

    unmount();
  });

  it('does not override copy while an editable field is focused', () => {
    const host = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = 'hello world';
    host.appendChild(strong);
    document.body.appendChild(host);

    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    textarea.focus();

    const toolbarRef = createToolbarRef();
    const { unmount } = renderHook(() =>
      useSelectionPosition({
        containerRef: host,
        isAudioActive: false,
        toolbarRef,
      }),
    );

    selectNode(strong);

    const setData = vi.fn();
    const copyEvent = new Event('copy', { bubbles: true, cancelable: true });
    Object.defineProperty(copyEvent, 'clipboardData', {
      configurable: true,
      value: { setData },
    });

    act(() => {
      document.dispatchEvent(copyEvent);
    });

    expect(document.activeElement).toBe(textarea);
    expect(copyEvent.defaultPrevented).toBe(false);
    expect(setData).not.toHaveBeenCalled();

    unmount();
  });

  it('clears cached selected text when selection moves outside the container', async () => {
    const host = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = 'hello world';
    host.appendChild(strong);
    document.body.appendChild(host);

    const outside = document.createElement('div');
    outside.textContent = 'outside';
    document.body.appendChild(outside);

    const toolbarRef = createToolbarRef();
    const { result, unmount } = renderHook(() =>
      useSelectionPosition({
        containerRef: host,
        isAudioActive: false,
        toolbarRef,
      }),
    );

    selectNode(strong);
    await vi.waitFor(() => {
      expect(result.current.selectedText).toBe('**hello world**');
    });

    selectNode(outside);

    await vi.waitFor(() => {
      expect(result.current.selectedText).toBe('');
      expect(result.current.position).toBeNull();
    });

    unmount();
  });

  const flushAnimationFrame = async () => {
    await act(async () => {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
    });
  };

  it('makes plain selected text available as soon as the toolbar is positioned', () => {
    const host = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = 'hello world';
    host.appendChild(strong);
    document.body.appendChild(host);

    const toolbarRef = createToolbarRef();
    const { result, unmount } = renderHook(() =>
      useSelectionPosition({
        containerRef: host,
        isAudioActive: false,
        toolbarRef,
      }),
    );

    selectNode(strong);

    expect(result.current.position).not.toBeNull();
    expect(result.current.selectedSpeechText).toBe('hello world');
    expect(result.current.selectedText).toBe('hello world');

    unmount();
  });

  it('preserves the toolbar anchor while audio playback is active', async () => {
    const host = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = 'hello world';
    host.appendChild(strong);
    document.body.appendChild(host);

    const toolbarRef = createToolbarRef();
    let isAudioActive = false;

    const { result, rerender, unmount } = renderHook(() =>
      useSelectionPosition({
        containerRef: host,
        isAudioActive,
        toolbarRef,
      }),
    );

    selectNode(strong);

    await vi.waitFor(() => {
      expect(result.current.selectedText).toBe('**hello world**');
      expect(result.current.position).not.toBeNull();
    });

    isAudioActive = true;
    rerender(() =>
      useSelectionPosition({
        containerRef: host,
        isAudioActive,
        toolbarRef,
      }),
    );

    window.getSelection()?.removeAllRanges();
    act(() => {
      document.dispatchEvent(new Event('selectionchange'));
    });

    expect(result.current.selectedText).toBe('**hello world**');
    expect(result.current.position).not.toBeNull();

    unmount();
  });

  it('preserves the toolbar when mouseup collapses the selection while audio is active', async () => {
    const host = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = 'hello world';
    host.appendChild(strong);
    document.body.appendChild(host);

    const toolbarRef = createToolbarRef();
    let isAudioActive = false;

    const { result, rerender, unmount } = renderHook(() =>
      useSelectionPosition({
        containerRef: host,
        isAudioActive,
        toolbarRef,
      }),
    );

    selectNode(strong);

    await vi.waitFor(() => {
      expect(result.current.selectedText).toBe('**hello world**');
      expect(result.current.position).not.toBeNull();
    });

    isAudioActive = true;
    rerender(() =>
      useSelectionPosition({
        containerRef: host,
        isAudioActive,
        toolbarRef,
      }),
    );

    window.getSelection()?.removeAllRanges();
    act(() => {
      document.dispatchEvent(new Event('mouseup'));
    });
    await flushAnimationFrame();

    expect(result.current.selectedText).toBe('**hello world**');
    expect(result.current.position).not.toBeNull();

    unmount();
  });

  it('preserves the toolbar when selection collapses before isAudioActive re-renders', async () => {
    const host = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = 'hello world';
    host.appendChild(strong);
    document.body.appendChild(host);

    const toolbarRef = createToolbarRef();
    const isAudioActiveRef = { current: false };

    const { result, unmount } = renderHook(() =>
      useSelectionPosition({
        containerRef: host,
        isAudioActive: false,
        isAudioActiveRef,
        toolbarRef,
      }),
    );

    selectNode(strong);

    await vi.waitFor(() => {
      expect(result.current.selectedText).toBe('**hello world**');
      expect(result.current.position).not.toBeNull();
    });

    isAudioActiveRef.current = true;
    window.getSelection()?.removeAllRanges();
    act(() => {
      document.dispatchEvent(new Event('selectionchange'));
      document.dispatchEvent(new Event('mouseup'));
    });
    await flushAnimationFrame();

    expect(result.current.selectedText).toBe('**hello world**');
    expect(result.current.position).not.toBeNull();

    unmount();
  });

  it('reads text selection relayed from a Live Artifact iframe', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);

    const toolbarRef = createToolbarRef();
    const { result, unmount } = renderHook(() =>
      useSelectionPosition({
        containerRef: host,
        isAudioActive: false,
        toolbarRef,
      }),
    );

    act(() => {
      window.dispatchEvent(
        new CustomEvent('amc-live-artifact-selection', {
          detail: {
            text: 'artifact text',
            copyText: 'artifact text',
            rect: {
              top: 160,
              left: 240,
              width: 80,
              height: 20,
              bottom: 180,
            },
          },
        }),
      );
    });

    expect(result.current.selectedText).toBe('artifact text');
    expect(result.current.selectedSpeechText).toBe('artifact text');
    expect(result.current.selectedCopyText).toBe('artifact text');
    expect(result.current.position).toEqual({ top: 110, left: 280 });

    unmount();
  });

  it('re-clamps the toolbar position after the toolbar ref becomes available', async () => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 390,
    });

    const host = document.createElement('div');
    const textNode = document.createTextNode('hello world');
    host.appendChild(textNode);
    document.body.appendChild(host);

    const toolbarRef = { current: null } as { current: HTMLDivElement | null };

    const { result, rerender, unmount } = renderHook(() =>
      useSelectionPosition({
        containerRef: host,
        isAudioActive: false,
        toolbarRef: toolbarRef as RefObject<HTMLDivElement>,
      }),
    );

    const range = document.createRange();
    range.selectNodeContents(textNode);
    range.getBoundingClientRect = () =>
      createRect({
        width: 80,
        left: 300,
        right: 380,
      });

    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    act(() => {
      document.dispatchEvent(new Event('selectionchange'));
    });

    await vi.waitFor(() => {
      expect(result.current.position).toEqual({ top: 50, left: 340 });
    });

    const toolbar = document.createElement('div');
    toolbar.getBoundingClientRect = () => createRect({ width: 280, height: 44 });
    toolbarRef.current = toolbar;

    rerender(() =>
      useSelectionPosition({
        containerRef: host,
        isAudioActive: false,
        toolbarRef: toolbarRef as RefObject<HTMLDivElement>,
      }),
    );

    await vi.waitFor(() => {
      expect(result.current.position).toEqual({ top: 50, left: 240 });
    });

    unmount();
  });
});
