import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type TransitionEvent as ReactTransitionEvent,
} from 'react';
import { useResizeDrag } from '@/hooks/useResizeDrag';
import { getChatInputMinHeight, getCompactChatInputMinHeight } from './chatInputSizing';
// useTimer optional: if project has no such hook, wrap window.setTimeout, key is ignored
const CHAT_INPUT_EXPANDED_MAX_HEIGHT = 'max(220px, 50vh)';
const CHAT_INPUT_COLLAPSED_MAX_HEIGHT = 'max(220px, 40vh)';
const HEIGHT_TRANSITION_MS = 260;
const STEP = 16;
type Options = {
  fontSize: number;
  isExpanded: boolean;
  onExpandedChange: (b: boolean) => void;
  focusEditor: () => void;
  minHeight?: number;
  setTimeoutTimer?: (k: string, fn: () => void, ms: number) => void;
};
function getViewportRelativeHeightPx(minH: number, ratio: number) {
  return Math.max(minH, Math.round(window.innerHeight * ratio));
}
function getExpandedHeightPx(minH: number) {
  return Math.max(minH, getViewportRelativeHeightPx(220, 0.5));
}
function clampHeight(h: number, minH: number, maxH: number) {
  return Math.min(maxH, Math.max(minH, Math.round(h)));
}
function getCollapsedHeightPx(frame: HTMLDivElement, minH: number) {
  const ta = frame.querySelector('textarea[data-chat-input-textarea="true"], .composer-tiptap') as HTMLElement | null;
  let ch = frame.scrollHeight || minH;
  const maxCollapsed = getViewportRelativeHeightPx(220, 0.4);
  if (ta) {
    const ph = ta.style.height,
      pm = ta.style.maxHeight;
    try {
      ta.style.height = 'auto';
      ta.style.maxHeight = 'none';
      ch = ta.scrollHeight || ch;
    } finally {
      ta.style.height = ph;
      ta.style.maxHeight = pm;
    }
  }
  return Math.max(minH, Math.min(ch, maxCollapsed));
}
export interface ChatInputEditorContentStyle extends CSSProperties {
  '--composer-editor-padding'?: string;
  '--composer-editor-min-height'?: string;
  '--composer-editor-font-size'?: string;
  '--composer-editor-line-height'?: string;
  '--composer-editor-max-height'?: string;
  '--composer-editor-overflow-y'?: 'auto' | 'hidden';
  '--composer-editor-height'?: 'auto' | '100%';
}

function getEditorContentStyle(
  fontSize: number,
  isExpanded: boolean,
  manual: number | null,
  compact = false,
): ChatInputEditorContentStyle {
  const minHeight = compact ? getCompactChatInputMinHeight(fontSize) : getChatInputMinHeight(fontSize);
  const hasCustom = isExpanded || manual !== null;
  const isFixed = compact || hasCustom;
  const maxHeight = compact
    ? `${minHeight}px`
    : isExpanded
      ? CHAT_INPUT_EXPANDED_MAX_HEIGHT
      : manual !== null
        ? `${manual}px`
        : CHAT_INPUT_COLLAPSED_MAX_HEIGHT;
  return {
    height: compact ? minHeight : hasCustom ? '100%' : undefined,
    minHeight,
    '--composer-editor-padding': compact ? '3px 0' : '6px 44px 0 15px',
    '--composer-editor-min-height': `${minHeight}px`,
    '--composer-editor-font-size': `${fontSize}px`,
    '--composer-editor-line-height': '1.4',
    '--composer-editor-max-height': maxHeight,
    '--composer-editor-overflow-y': compact ? 'hidden' : 'auto',
    '--composer-editor-height': isFixed ? '100%' : 'auto',
  };
}
const EDITOR_ELEMENT_STYLE = [
  'max-height: var(--composer-editor-max-height) !important',
  'overflow-y: var(--composer-editor-overflow-y)',
  'height: var(--composer-editor-height)',
].join('; ');
export function useChatInputExpandSizing({
  fontSize,
  isExpanded,
  onExpandedChange,
  focusEditor,
  minHeight: minHeightProp,
  setTimeoutTimer,
}: Options) {
  const minHeight = minHeightProp ?? getChatInputMinHeight(fontSize);
  const compactMinHeight = getCompactChatInputMinHeight(fontSize);
  const maxHeight = useMemo(() => getExpandedHeightPx(minHeight), [minHeight]);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const animRef = useRef<number | null>(null);
  const pendingRef = useRef<boolean | null>(null);
  const dragRef = useRef({ startClientY: 0, startHeight: 0, collapseExpanded: false });
  const [animatedHeight, setAnimatedHeight] = useState<string | null>(null);
  const [manualHeight, setManualHeight] = useState<number | null>(null);
  const isAnimating = animatedHeight !== null;
  const hasCustomHeight = isExpanded || manualHeight !== null || isAnimating;
  const clearAnim = useCallback(() => {
    if (animRef.current !== null) {
      cancelAnimationFrame(animRef.current);
      animRef.current = null;
    }
  }, []);
  const clearAfter = useCallback(() => {
    const fn = () => {
      setAnimatedHeight(null);
      pendingRef.current = null;
    };
    if (setTimeoutTimer) setTimeoutTimer('chatInputFrame', fn, HEIGHT_TRANSITION_MS + 80);
    else window.setTimeout(fn, HEIGHT_TRANSITION_MS + 80);
  }, [setTimeoutTimer]);
  const getCurrentHeight = useCallback(
    () => frameRef.current?.offsetHeight ?? (isExpanded ? maxHeight : (manualHeight ?? minHeight)),
    [isExpanded, manualHeight, maxHeight, minHeight],
  );
  const setClamped = useCallback(
    (h: number) => {
      clearAnim();
      pendingRef.current = null;
      setAnimatedHeight(null);
      setManualHeight(clampHeight(h, minHeight, maxHeight));
    },
    [clearAnim, maxHeight, minHeight],
  );
  const handleResizeMove = useCallback(
    (e: MouseEvent) => {
      const d = dragRef.current;
      if (d.collapseExpanded) {
        d.collapseExpanded = false;
        onExpandedChange(false);
      }
      setClamped(d.startHeight + d.startClientY - e.clientY);
    },
    [onExpandedChange, setClamped],
  );
  const { isResizing, startResizing } = useResizeDrag({ onMove: handleResizeMove, cursor: 'row-resize' });
  const startResize = useCallback(
    (e: ReactMouseEvent) => {
      dragRef.current = { startClientY: e.clientY, startHeight: getCurrentHeight(), collapseExpanded: isExpanded };
      startResizing(e);
    },
    [getCurrentHeight, isExpanded, startResizing],
  );
  const handleResizeKeyDown = useCallback(
    (e: ReactKeyboardEvent) => {
      const cur = getCurrentHeight();
      let n: number | null = null;
      switch (e.key) {
        case 'ArrowUp':
          n = cur + STEP;
          break;
        case 'ArrowDown':
          n = cur - STEP;
          break;
        case 'Home':
          n = minHeight;
          break;
        case 'End':
          n = maxHeight;
          break;
      }
      if (n === null) return;
      e.preventDefault();
      if (isExpanded) onExpandedChange(false);
      setClamped(n);
    },
    [getCurrentHeight, isExpanded, maxHeight, minHeight, onExpandedChange, setClamped],
  );
  const toggleExpanded = useCallback(
    (next?: boolean) => {
      const t = typeof next === 'boolean' ? next : !isExpanded;
      const f = frameRef.current;
      if (f) {
        clearAnim();
        setAnimatedHeight(`${f.offsetHeight || minHeight}px`);
        pendingRef.current = t;
      }
      if (!t) setManualHeight(null);
      onExpandedChange(t);
      focusEditor();
    },
    [clearAnim, focusEditor, isExpanded, minHeight, onExpandedChange],
  );
  useEffect(() => {
    const f = frameRef.current;
    if (!f || pendingRef.current !== isExpanded) return;
    const th = isExpanded ? getExpandedHeightPx(minHeight) : getCollapsedHeightPx(f, minHeight);
    clearAnim();
    animRef.current = requestAnimationFrame(() => {
      setAnimatedHeight(`${th}px`);
      animRef.current = null;
    });
    clearAfter();
  }, [clearAfter, clearAnim, isExpanded, minHeight]);
  useEffect(() => clearAnim, [clearAnim]);
  const handleTransitionEnd = useCallback((e: ReactTransitionEvent<HTMLDivElement>) => {
    if (e.propertyName && e.propertyName !== 'height') return;
    setAnimatedHeight(null);
    pendingRef.current = null;
  }, []);
  const restoreDefaultHeight = useCallback(() => {
    const f = frameRef.current;
    clearAnim();
    pendingRef.current = null;
    if (!f) {
      setManualHeight(null);
      onExpandedChange(false);
      focusEditor();
      return;
    }
    const start = f.offsetHeight || getCurrentHeight();
    const target = getCollapsedHeightPx(f, minHeight);
    setAnimatedHeight(`${start}px`);
    animRef.current = requestAnimationFrame(() => {
      setManualHeight(null);
      onExpandedChange(false);
      setAnimatedHeight(`${target}px`);
      animRef.current = null;
    });
    clearAfter();
    focusEditor();
  }, [clearAfter, clearAnim, focusEditor, getCurrentHeight, minHeight, onExpandedChange]);
  const resolvedFrameHeight =
    animatedHeight ??
    (isExpanded ? CHAT_INPUT_EXPANDED_MAX_HEIGHT : manualHeight !== null ? `${manualHeight}px` : undefined);
  const frameStyle = useMemo<CSSProperties>(
    () => ({
      height: resolvedFrameHeight,
      minHeight,
      overflow: 'hidden',
      transition: isResizing ? 'none' : `height ${HEIGHT_TRANSITION_MS}ms cubic-bezier(0, 0, 0.2, 1)`,
    }),
    [isResizing, minHeight, resolvedFrameHeight],
  );
  const compactFrameStyle = useMemo<CSSProperties>(
    () => ({ height: compactMinHeight, minHeight: compactMinHeight, overflow: 'hidden', transitionDuration: '0ms' }),
    [compactMinHeight],
  );
  const editorContentStyle = useMemo(
    () => getEditorContentStyle(fontSize, isExpanded || isAnimating, manualHeight),
    [fontSize, isExpanded, isAnimating, manualHeight],
  );
  const compactEditorContentStyle = useMemo(() => getEditorContentStyle(fontSize, false, null, true), [fontSize]);
  return {
    frameRef,
    frameStyle,
    compactFrameStyle,
    editorContentStyle,
    compactEditorContentStyle,
    editorElementStyle: EDITOR_ELEMENT_STYLE,
    minHeight,
    maxHeight,
    isResizing,
    startResize,
    handleResizeKeyDown,
    handleTransitionEnd,
    toggleExpanded,
    restoreDefaultHeight,
    hasCustomHeight,
    resizeHandleValue: isExpanded ? maxHeight : (manualHeight ?? minHeight),
  };
}
