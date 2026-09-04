import { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback, type RefObject } from 'react';
import { useWindowContext } from '@/contexts/WindowContext';
import { copySelectionTextToClipboardEvent } from '@/utils/text-selection/selectionClipboard';
import {
  dispatchLiveArtifactClearSelection,
  isLiveArtifactSelectionDetail,
  LIVE_ARTIFACT_SELECTION_EVENT,
} from '@/utils/text-selection/liveArtifactSelection';

type ContainerRefLike = RefObject<HTMLElement> | HTMLElement | null;
type SelectionBounds = Pick<DOMRect, 'top' | 'left' | 'width' | 'height' | 'bottom'>;

interface UseSelectionPositionProps {
  containerRef: ContainerRefLike;
  isAudioActive: boolean;
  /** Synchronous hold flag so TTS can pin the toolbar before React re-renders. */
  isAudioActiveRef?: RefObject<boolean>;
  toolbarRef: RefObject<HTMLDivElement>;
  onCopySuccess?: (text: string) => void;
  preserveFormattingOnCopy?: boolean;
}

const resolveContainerElement = (containerRef: ContainerRefLike): HTMLElement | null => {
  if (!containerRef) return null;
  if ('current' in containerRef) return containerRef.current;
  return containerRef;
};

const isEditableElement = (element: Element | null): boolean => {
  if (!element) return false;

  const HTMLElementCtor = element.ownerDocument.defaultView?.HTMLElement ?? HTMLElement;
  if (!(element instanceof HTMLElementCtor)) return false;
  const htmlElement = element as HTMLElement;

  return htmlElement.tagName === 'INPUT' || htmlElement.tagName === 'TEXTAREA' || htmlElement.isContentEditable;
};

const SELECTION_EXCLUDED_SELECTOR = '.select-none, [data-selection-copy="exclude"]';

const cloneSelectionContent = (range: Range, targetDocument: Document): HTMLDivElement => {
  const container = targetDocument.createElement('div');
  container.appendChild(range.cloneContents());

  container.querySelectorAll(SELECTION_EXCLUDED_SELECTOR).forEach((element) => {
    element.remove();
  });

  return container;
};

const getPlainSelectionText = (container: HTMLElement): string =>
  (container.innerText || container.textContent || '').trim();

const getElementForNode = (node: Node): Element | null => {
  if (node.nodeType === Node.ELEMENT_NODE) {
    return node as Element;
  }

  return node.parentElement;
};

const getContainingCodeBlock = (node: Node): Element | null => {
  const element = getElementForNode(node);
  return element?.closest('pre, code') ?? null;
};

const isCodeSelection = (range: Range): boolean => {
  const startCodeBlock = getContainingCodeBlock(range.startContainer);
  const endCodeBlock = getContainingCodeBlock(range.endContainer);

  return Boolean(
    startCodeBlock &&
    endCodeBlock &&
    (startCodeBlock === endCodeBlock || startCodeBlock.contains(endCodeBlock) || endCodeBlock.contains(startCodeBlock)),
  );
};

export const useSelectionPosition = ({
  containerRef,
  isAudioActive,
  isAudioActiveRef,
  toolbarRef,
  onCopySuccess,
  preserveFormattingOnCopy = true,
}: UseSelectionPositionProps) => {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [selectedText, setSelectedText] = useState('');
  const [selectedSpeechText, setSelectedSpeechText] = useState('');
  const [selectedCopyText, setSelectedCopyText] = useState('');
  const [toolbarElement, setToolbarElement] = useState<HTMLDivElement | null>(null);
  const [toolbarSize, setToolbarSize] = useState<{ width: number; height: number } | null>(null);
  const selectionBoundsRef = useRef<SelectionBounds | null>(null);
  const selectedTextRef = useRef('');
  const selectedPlainTextRef = useRef('');
  const selectionRequestIdRef = useRef(0);
  const toolbarNode = toolbarRef.current;
  const { document: targetDocument, window: targetWindow } = useWindowContext();

  const isSelectionHeld = useCallback(
    () => Boolean(isAudioActive || isAudioActiveRef?.current),
    [isAudioActive, isAudioActiveRef],
  );

  const clearSelectionState = useCallback(() => {
    selectionRequestIdRef.current += 1;
    setPosition(null);
    selectionBoundsRef.current = null;
    selectedTextRef.current = '';
    selectedPlainTextRef.current = '';
    setSelectedText('');
    setSelectedSpeechText('');
    setSelectedCopyText('');
  }, []);

  // Monitor selection changes
  useEffect(() => {
    // Validate the current selection within the message container. Returns the
    // range when a toolbar-worthy selection exists, null otherwise (caller
    // decides whether to clear the toolbar state).
    const getValidSelectionRange = (): Range | null => {
      const selection = targetWindow.getSelection();
      if (!selection || selection.isCollapsed || !selection.rangeCount) {
        return null;
      }

      const range = selection.getRangeAt(0);
      const commonAncestor = range.commonAncestorContainer;

      // Context checks
      const containerEl = resolveContainerElement(containerRef);
      if (containerEl && !containerEl.contains(commonAncestor)) {
        return null;
      }

      const targetElement =
        commonAncestor.nodeType === 1 ? (commonAncestor as HTMLElement) : commonAncestor.parentElement;
      if (isEditableElement(targetElement)) {
        return null;
      }

      return range;
    };

    const selectionVersionRef = { current: -1 };

    // Extract the selection content (clone subtree, strip .select-none, convert
    // to markdown). Coalesced with a rAF so a per-frame `selectionchange` burst
    // during a long drag runs it exactly once per frame, and the position-only
    // pass below (which re-renders the toolbar per frame) keeps the heavy clone
    // off the hot path.
    const runSelectionExtraction = () => {
      const range = getValidSelectionRange();
      if (!range) {
        if (!isSelectionHeld()) {
          clearSelectionState();
        }
        return;
      }

      if (isSelectionHeld()) {
        return;
      }

      const requestId = (selectionRequestIdRef.current += 1);

      const container = cloneSelectionContent(range, targetDocument);
      const html = container.innerHTML;
      const rangeIsCodeSelection = isCodeSelection(range);
      const cleanedPlainText = getPlainSelectionText(container);
      const plainText = rangeIsCodeSelection
        ? (targetWindow.getSelection()?.toString() || cleanedPlainText).trim()
        : cleanedPlainText;

      if (!plainText) {
        clearSelectionState();
        return;
      }

      const rect = range.getBoundingClientRect();
      const applySelectionState = (text: string) => {
        if (requestId !== selectionRequestIdRef.current) {
          return;
        }

        const nextText = text || plainText;
        if (!nextText) {
          clearSelectionState();
          return;
        }

        selectionBoundsRef.current = rect;
        selectedTextRef.current = nextText;
        selectedPlainTextRef.current = plainText;

        setPosition({
          top: rect.top - 50,
          left: rect.left + rect.width / 2,
        });
        setSelectedText(nextText);
        setSelectedSpeechText(plainText);
        setSelectedCopyText(preserveFormattingOnCopy ? nextText : plainText || nextText);
      };

      if (rangeIsCodeSelection) {
        applySelectionState(plainText);
        return;
      }

      void (async () => {
        const { convertHtmlToMarkdown } = await import('@/utils/htmlToMarkdown');
        applySelectionState(convertHtmlToMarkdown(html).trim());
      })();
    };

    let extractionFrame: number | null = null;
    const scheduleSelectionExtraction = () => {
      if (extractionFrame !== null) {
        return;
      }
      extractionFrame = targetWindow.requestAnimationFrame(() => {
        extractionFrame = null;
        runSelectionExtraction();
      });
    };
    const cancelScheduledExtraction = () => {
      if (extractionFrame !== null) {
        targetWindow.cancelAnimationFrame(extractionFrame);
        extractionFrame = null;
      }
    };

    // Live, lightweight pass: the toolbar position follows the selection on
    // every change, but the content extraction is coalesced (rAF) and cached by
    // version — dragging within the same selected range re-runs the cheap
    // position pass without re-cloning the DOM.
    const seedImmediateSelectionText = (range: Range) => {
      const immediatePlain = (targetWindow.getSelection()?.toString() || range.toString() || '').trim();
      if (!immediatePlain) {
        return;
      }

      selectedPlainTextRef.current = immediatePlain;
      if (!selectedTextRef.current) {
        selectedTextRef.current = immediatePlain;
        setSelectedText(immediatePlain);
        setSelectedCopyText(immediatePlain);
      }
      setSelectedSpeechText(immediatePlain);
    };

    const handleSelectionChange = () => {
      selectionVersionRef.current += 1;
      const version = selectionVersionRef.current;

      if (isSelectionHeld()) {
        return;
      }

      const range = getValidSelectionRange();
      if (!range) {
        clearSelectionState();
        return;
      }

      const rect = range.getBoundingClientRect();
      selectionBoundsRef.current = rect;
      setPosition({
        top: rect.top - 50,
        left: rect.left + rect.width / 2,
      });
      seedImmediateSelectionText(range);

      scheduleSelectionExtraction();
      if (version !== selectionVersionRef.current) {
        return;
      }
    };

    targetDocument.addEventListener('selectionchange', handleSelectionChange);
    targetDocument.addEventListener('mouseup', scheduleSelectionExtraction);
    targetDocument.addEventListener('keyup', scheduleSelectionExtraction);

    return () => {
      targetDocument.removeEventListener('selectionchange', handleSelectionChange);
      targetDocument.removeEventListener('mouseup', scheduleSelectionExtraction);
      targetDocument.removeEventListener('keyup', scheduleSelectionExtraction);
      cancelScheduledExtraction();
    };
  }, [clearSelectionState, containerRef, isSelectionHeld, preserveFormattingOnCopy, targetDocument, targetWindow]);

  useEffect(() => {
    const handleLiveArtifactSelection = (event: Event) => {
      if (isSelectionHeld()) {
        return;
      }

      const detail = (event as CustomEvent<unknown>).detail;
      if (!isLiveArtifactSelectionDetail(detail)) {
        clearSelectionState();
        return;
      }

      const copyText = detail.copyText || detail.text;
      selectionBoundsRef.current = detail.rect;
      selectedTextRef.current = detail.text;
      selectedPlainTextRef.current = copyText;
      setPosition({
        top: detail.rect.top - 50,
        left: detail.rect.left + detail.rect.width / 2,
      });
      setSelectedText(detail.text);
      setSelectedSpeechText(copyText || detail.text);
      setSelectedCopyText(copyText);
    };

    targetWindow.addEventListener(LIVE_ARTIFACT_SELECTION_EVENT, handleLiveArtifactSelection);
    return () => targetWindow.removeEventListener(LIVE_ARTIFACT_SELECTION_EVENT, handleLiveArtifactSelection);
  }, [clearSelectionState, isSelectionHeld, targetWindow]);

  useEffect(() => {
    const handleCopy = (e: ClipboardEvent) => {
      if (isSelectionHeld()) {
        return;
      }

      const activeElement = targetDocument.activeElement;
      if (isEditableElement(activeElement)) {
        return;
      }

      const text = preserveFormattingOnCopy
        ? selectedTextRef.current
        : selectedPlainTextRef.current || selectedTextRef.current;
      if (copySelectionTextToClipboardEvent(e, text)) {
        onCopySuccess?.(text);
      }
    };

    targetDocument.addEventListener('copy', handleCopy);
    return () => targetDocument.removeEventListener('copy', handleCopy);
  }, [isSelectionHeld, onCopySuccess, preserveFormattingOnCopy, targetDocument]);

  useLayoutEffect(() => {
    if (!position) {
      if (toolbarElement !== null) {
        setToolbarElement(null);
      }
      if (toolbarSize !== null) {
        setToolbarSize(null);
      }
      return;
    }

    if (toolbarNode !== toolbarElement) {
      setToolbarElement(toolbarNode);
    }
  }, [position, toolbarElement, toolbarNode, toolbarSize]);

  useLayoutEffect(() => {
    if (!position || !toolbarElement) {
      return;
    }

    const updateToolbarSize = () => {
      const rect = toolbarElement.getBoundingClientRect();
      const nextSize = {
        width: rect.width,
        height: rect.height,
      };

      setToolbarSize((prev) => {
        if (prev && prev.width === nextSize.width && prev.height === nextSize.height) {
          return prev;
        }

        return nextSize;
      });
    };

    updateToolbarSize();

    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => updateToolbarSize()) : null;

    resizeObserver?.observe(toolbarElement);
    targetWindow.addEventListener('resize', updateToolbarSize);
    targetWindow.visualViewport?.addEventListener('resize', updateToolbarSize);
    targetWindow.visualViewport?.addEventListener('scroll', updateToolbarSize);

    return () => {
      resizeObserver?.disconnect();
      targetWindow.removeEventListener('resize', updateToolbarSize);
      targetWindow.visualViewport?.removeEventListener('resize', updateToolbarSize);
      targetWindow.visualViewport?.removeEventListener('scroll', updateToolbarSize);
    };
  }, [position, toolbarElement, targetWindow]);

  const clampedPosition = useMemo(() => {
    if (!position || !toolbarSize) return position;

    const { width, height } = toolbarSize;
    const viewportWidth = targetWindow.innerWidth;
    const viewportHeight = targetWindow.innerHeight;
    const padding = 10;

    let correctedLeft = position.left;
    let correctedTop = position.top;
    const halfWidth = width / 2;

    // Horizontal
    if (correctedLeft - halfWidth < padding) correctedLeft = padding + halfWidth;
    if (correctedLeft + halfWidth > viewportWidth - padding) correctedLeft = viewportWidth - padding - halfWidth;

    // Vertical
    if (correctedTop < padding) {
      if (selectionBoundsRef.current) {
        const belowPos = selectionBoundsRef.current.bottom + 10;
        if (belowPos + height < viewportHeight - padding) {
          correctedTop = belowPos;
        } else {
          correctedTop = padding;
        }
      } else {
        correctedTop = padding;
      }
    }
    if (correctedTop + height > viewportHeight - padding) {
      correctedTop = viewportHeight - padding - height;
    }

    if (Math.abs(correctedLeft - position.left) > 1 || Math.abs(correctedTop - position.top) > 1) {
      return { left: correctedLeft, top: correctedTop };
    }

    return position;
  }, [position, toolbarSize, targetWindow.innerHeight, targetWindow.innerWidth]);

  const clearSelection = () => {
    targetWindow.getSelection()?.removeAllRanges();
    dispatchLiveArtifactClearSelection(targetWindow);
    clearSelectionState();
  };

  const selectionRect = (() => {
    const bounds = selectionBoundsRef.current;
    if (!bounds) return null;
    try {
      const DomRectCtor = (targetWindow as Window & typeof globalThis).DOMRect;
      if (typeof DomRectCtor === 'function') {
        return new DomRectCtor(bounds.left, bounds.top, bounds.width, bounds.height);
      }
    } catch {
      // fall through to plain object
    }
    return {
      top: bounds.top,
      left: bounds.left,
      width: bounds.width,
      height: bounds.height,
      bottom: bounds.bottom,
      right: bounds.left + bounds.width,
      x: bounds.left,
      y: bounds.top,
      toJSON() {
        return bounds;
      },
    } as DOMRect;
  })();

  return {
    position: clampedPosition,
    setPosition,
    selectedText,
    selectedSpeechText,
    selectedCopyText,
    selectionRect,
    clearSelection,
  };
};
