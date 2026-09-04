import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Copy,
  Check,
  CornerRightDown,
  Quote,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  BookOpen,
  Languages,
  List,
} from 'lucide-react';
import { useWindowContext } from '@/contexts/WindowContext';
import { useI18n } from '@/contexts/I18nContext';
import { useSettingsStore } from '@/stores/settingsStore';
import { useSelectionAsk } from '@/hooks/text-selection/useSelectionAsk';
import { resolveAskPanelDockSide, type AskPanelDockSide } from '@/utils/text-selection/askPanelDocking';
import { formatSelectionAskModelLabel } from '@/utils/text-selection/selectionAskDisplay';
import { MathMarkdownRenderer } from '@/components/message/MathMarkdownRenderer';

interface SelectionAskPanelProps {
  selectedText: string;
  anchorRect: DOMRect | null;
  onClose: () => void;
  onInsert?: (text: string) => void;
  onQuote?: (text: string) => void;
}

const PANEL_DEFAULT_WIDTH = 560;
const PANEL_DEFAULT_HEIGHT = 420;
const PANEL_MIN_WIDTH = 340;
const PANEL_MIN_HEIGHT = 320;
const PANEL_MAX_HEIGHT_CAP = 520;
const VIEWPORT_PADDING = 12;
const DOCK_HANDLE_WIDTH = 22;
const DOCK_HANDLE_HEIGHT = 56;
/** 指针位移小于该值视为单击而非拖拽，不触发贴边吸附 */
const DOCK_DRAG_MIN_MOVE = 6;
const PANEL_Z_INDEX = 'z-[10000]';
const STORAGE_KEY = 'amc-selection-ask-panel-size';

type PanelSize = { width: number; height: number };
type ResizeDir = 'e' | 'w' | 'n' | 's' | 'se' | 'sw' | 'ne' | 'nw';

/** 主对话发送按钮同款品牌蓝，保持全局 CTA 一致 */
const SEND_BUTTON_BG = 'bg-[#3964FE] hover:bg-[#3358e0] dark:bg-[#679EFE] dark:hover:bg-[#5a8de0]';

const clampSizeToViewport = (size: PanelSize, vw: number, vh: number): PanelSize => ({
  width: Math.max(PANEL_MIN_WIDTH, Math.min(size.width, vw - VIEWPORT_PADDING * 2)),
  height: Math.max(PANEL_MIN_HEIGHT, Math.min(size.height, vh - VIEWPORT_PADDING * 2, PANEL_MAX_HEIGHT_CAP)),
});

const readPersistedSize = (vw: number, vh: number): PanelSize | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PanelSize>;
    if (typeof parsed.width !== 'number' || typeof parsed.height !== 'number') return null;
    return clampSizeToViewport({ width: parsed.width, height: parsed.height }, vw, vh);
  } catch {
    return null;
  }
};

export const SelectionAskPanel: React.FC<SelectionAskPanelProps> = ({
  selectedText,
  anchorRect,
  onClose,
  onInsert,
  onQuote,
}) => {
  const { t, language } = useI18n();
  const { document: targetDocument, window: targetWindow } = useWindowContext();
  const themeId = useSettingsStore((state) => state.currentTheme.id);
  const selectionAskModelId = useSettingsStore((state) => state.appSettings.selectionAskModelId);
  const selectionAskProviderId = useSettingsStore((state) => state.appSettings.selectionAskProviderId);
  const { answer, isLoading, error, ask, cancel, reset } = useSelectionAsk();
  const [question, setQuestion] = useState('');
  const [isCopied, setIsCopied] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isPreviewExpanded, setIsPreviewExpanded] = useState(false);
  const [isPreviewClamped, setIsPreviewClamped] = useState(false);
  const [isResizing, setIsResizing] = useState<ResizeDir | null>(null);
  // 贴边停靠：非 null 时面板收起，仅渲染边缘把手，悬停把手展开（展开后保持，直到再次拖近边缘）
  const [docked, setDocked] = useState<AskPanelDockSide | null>(null);
  const [dockedTop, setDockedTop] = useState(0);
  const [size, setSize] = useState<PanelSize>(() => {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1920;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 1080;
    const persisted = readPersistedSize(vw, vh);
    if (persisted) return persisted;
    return {
      width: Math.min(PANEL_DEFAULT_WIDTH, vw - VIEWPORT_PADDING * 2),
      height: Math.min(PANEL_DEFAULT_HEIGHT, vh - VIEWPORT_PADDING * 2),
    };
  });
  const panelRef = useRef<HTMLDivElement>(null);
  const answerContainerRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLParagraphElement>(null);
  const dragState = useRef<{
    offsetX: number;
    offsetY: number;
    startX: number;
    startY: number;
    pointerId?: number;
    capturedEl?: HTMLElement;
  } | null>(null);
  const resizeState = useRef<{
    dir: ResizeDir;
    startX: number;
    startY: number;
    startW: number;
    startH: number;
    startTop: number;
    startLeft: number;
    pointerId: number;
    capturedEl: HTMLElement;
  } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const shouldAutoScrollRef = useRef(true);

  // 持久化尺寸
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(size));
    } catch {
      // ignore quota
    }
  }, [size]);

  // 视口变化时 clamp 已持久化的尺寸
  useEffect(() => {
    const onResize = () => {
      setSize((prev) => clampSizeToViewport(prev, targetWindow.innerWidth, targetWindow.innerHeight));
    };
    targetWindow.addEventListener('resize', onResize);
    targetWindow.visualViewport?.addEventListener('resize', onResize);
    return () => {
      targetWindow.removeEventListener('resize', onResize);
      targetWindow.visualViewport?.removeEventListener('resize', onResize);
    };
  }, [targetWindow]);

  // 卸载时 abort
  useEffect(() => {
    return () => {
      cancel();
    };
  }, [cancel]);

  // 面板开着时再次"询问"会换锚点：清掉上一轮问答与未发送的问题，
  // 避免旧答案被当成新选区内容的回答（锚点对象在打开期间身份稳定，不会误触发）
  const lastAnchorRef = useRef<DOMRect | null>(anchorRect);
  useEffect(() => {
    if (lastAnchorRef.current === anchorRect) return;
    lastAnchorRef.current = anchorRect;
    reset();
    setQuestion('');
  }, [anchorRect, reset]);

  // Initial positioning — 用当前 size 的实际宽高
  useLayoutEffect(() => {
    const vw = targetWindow.innerWidth;
    const vh = targetWindow.innerHeight;
    const clampedSize = clampSizeToViewport(size, vw, vh);
    const width = clampedSize.width;
    const height = clampedSize.height;
    let top: number;
    let left: number;
    if (anchorRect) {
      const anchorCenterX = anchorRect.left + anchorRect.width / 2;
      left = Math.round(anchorCenterX - width / 2);
      top = Math.round(anchorRect.bottom + 12);
      if (top + height > vh - VIEWPORT_PADDING) {
        const flippedTop = anchorRect.top - height - 12;
        if (flippedTop >= VIEWPORT_PADDING) top = flippedTop;
        else top = vh - height - VIEWPORT_PADDING;
      }
    } else {
      left = Math.round((vw - width) / 2);
      top = Math.round((vh - height) / 2);
    }
    left = Math.max(VIEWPORT_PADDING, Math.min(left, vw - width - VIEWPORT_PADDING));
    top = Math.max(VIEWPORT_PADDING, Math.min(top, vh - height - VIEWPORT_PADDING));
    setPosition({ top, left });
    if (clampedSize.width !== size.width || clampedSize.height !== size.height) {
      setSize(clampedSize);
    }
    // 仅锚点/视口变化时重定位，size 变化不重定位
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reposition only on anchor/viewport changes; size updates must not reposition
  }, [anchorRect, targetWindow]);

  // Clamp position on resize。注意不能在 effect 里以 panelRef.current 为空提前 return：
  // 挂载时 position 还是 null、面板未渲染，提前返回会导致监听永远挂不上（面板渲染后 effect 不会重跑）。
  const isPanelRendered = position !== null && docked === null;
  useEffect(() => {
    if (!isPanelRendered) return;
    const clamp = () => {
      const el = panelRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const vw = targetWindow.innerWidth;
      const vh = targetWindow.innerHeight;
      setPosition((prev) => {
        if (!prev) return prev;
        let { top, left } = prev;
        if (left + rect.width > vw - VIEWPORT_PADDING) left = vw - rect.width - VIEWPORT_PADDING;
        if (top + rect.height > vh - VIEWPORT_PADDING) top = vh - rect.height - VIEWPORT_PADDING;
        if (left < VIEWPORT_PADDING) left = VIEWPORT_PADDING;
        if (top < VIEWPORT_PADDING) top = VIEWPORT_PADDING;
        if (left === prev.left && top === prev.top) return prev;
        return { top, left };
      });
    };
    clamp();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => clamp()) : null;
    if (panelRef.current) ro?.observe(panelRef.current);
    targetWindow.addEventListener('resize', clamp);
    targetWindow.visualViewport?.addEventListener('resize', clamp);
    return () => {
      ro?.disconnect();
      targetWindow.removeEventListener('resize', clamp);
      targetWindow.visualViewport?.removeEventListener('resize', clamp);
    };
  }, [isPanelRendered, targetWindow]);

  // 停靠状态下视口变化时，把手垂直位置重新 clamp
  useEffect(() => {
    if (!docked) return;
    const reclampHandle = () => {
      setDockedTop((prev) =>
        Math.round(
          Math.max(VIEWPORT_PADDING, Math.min(prev, targetWindow.innerHeight - size.height - VIEWPORT_PADDING)),
        ),
      );
    };
    targetWindow.addEventListener('resize', reclampHandle);
    targetWindow.visualViewport?.addEventListener('resize', reclampHandle);
    return () => {
      targetWindow.removeEventListener('resize', reclampHandle);
      targetWindow.visualViewport?.removeEventListener('resize', reclampHandle);
    };
  }, [docked, size.height, targetWindow]);

  useEffect(() => {
    const id = targetWindow.setTimeout(() => textareaRef.current?.focus(), 100);
    return () => targetWindow.clearTimeout(id);
  }, [targetWindow]);

  useEffect(() => {
    if (!isCopied) return;
    const id = targetWindow.setTimeout(() => setIsCopied(false), 1200);
    return () => targetWindow.clearTimeout(id);
  }, [isCopied, targetWindow]);

  useEffect(() => {
    const el = answerContainerRef.current;
    if (!el) return;
    if (!shouldAutoScrollRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [answer]);

  // 实测预览是否被 line-clamp 截断（字符数估算行数不可靠），决定“展开”入口显隐
  // 兜底：ResizeObserver 在 headless/离屏或未完成布局时可能不触发，故同时按字符数判断
  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const fallbackClamped = selectedText.length > 90;
    const check = () => {
      const measuredClamped = el.scrollHeight > el.clientHeight + 1;
      setIsPreviewClamped(measuredClamped || fallbackClamped);
    };
    check();
    // 下一帧再测一次，确保 line-clamp 样式已生效
    const raf = targetWindow.requestAnimationFrame(check);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(check) : null;
    ro?.observe(el);
    return () => {
      targetWindow.cancelAnimationFrame(raf);
      ro?.disconnect();
    };
  }, [selectedText, isPreviewExpanded, targetWindow]);

  const handleAsk = useCallback(
    (q: string) => {
      const trimmed = q.trim();
      if (!trimmed || !selectedText.trim()) return;
      shouldAutoScrollRef.current = true;
      ask(selectedText, trimmed);
    },
    [ask, selectedText],
  );

  const handleSubmit = useCallback(() => {
    if (!question.trim() || isLoading) return;
    handleAsk(question);
  }, [question, isLoading, handleAsk]);

  const handleQuick = useCallback(
    (type: 'explain' | 'translate' | 'summarize') => {
      const isZh = language === 'zh';
      const map: Record<string, string> = {
        explain: isZh ? '请解释这段内容' : 'Explain this selection',
        translate: isZh ? '请翻译这段内容' : 'Translate this selection',
        summarize: isZh ? '请总结这段内容' : 'Summarize this selection',
      };
      const q = map[type];
      setQuestion(q);
      handleAsk(q);
      targetWindow.setTimeout(() => textareaRef.current?.focus(), 0);
    },
    [handleAsk, language, targetWindow],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    },
    [handleSubmit, onClose],
  );

  const handleCopyAnswer = useCallback(async () => {
    if (!answer) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(answer);
        setIsCopied(true);
        return;
      }
    } catch {
      // fallback
    }
    try {
      const ta = targetDocument.createElement('textarea');
      ta.value = answer;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      targetDocument.body.appendChild(ta);
      ta.select();
      targetDocument.execCommand('copy');
      ta.remove();
      setIsCopied(true);
    } catch {
      // ignore
    }
  }, [answer, targetDocument]);

  const handleInsertAnswer = useCallback(() => {
    if (!answer || !onInsert) return;
    onInsert(answer);
  }, [answer, onInsert]);

  const handleQuoteAnswer = useCallback(() => {
    if (!answer || !onQuote) return;
    onQuote(answer);
  }, [answer, onQuote]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    // 拖拽柄是整个 header，但按钮点击必须优先 — 否则 header 抢走 pointer capture，按钮收不到 click
    const target = e.target as HTMLElement | null;
    if (target?.closest('button')) return;
    if (e.button !== 0) return;
    if (!panelRef.current) return;
    const rect = panelRef.current.getBoundingClientRect();
    dragState.current = {
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      startX: e.clientX,
      startY: e.clientY,
      pointerId: e.pointerId,
      capturedEl: e.currentTarget as HTMLElement,
    };
    setIsDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!dragState.current || !isDragging) return;
      const vw = targetWindow.innerWidth;
      const vh = targetWindow.innerHeight;
      const el = panelRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      let left = e.clientX - dragState.current.offsetX;
      let top = e.clientY - dragState.current.offsetY;
      left = Math.max(VIEWPORT_PADDING, Math.min(left, vw - rect.width - VIEWPORT_PADDING));
      top = Math.max(VIEWPORT_PADDING, Math.min(top, vh - rect.height - VIEWPORT_PADDING));
      setPosition({ top, left });
    },
    [isDragging, targetWindow],
  );

  const handlePointerUp = useCallback(
    (e: PointerEvent) => {
      const st = dragState.current;
      if (st?.capturedEl && st.pointerId !== undefined) {
        try {
          st.capturedEl.releasePointerCapture(st.pointerId);
        } catch {
          // ignore
        }
      }
      // 位移过小说明是单击标题栏而非拖拽：面板恢复原位即可，不触发贴边吸附
      const moved = st ? Math.hypot(e.clientX - st.startX, e.clientY - st.startY) : Number.POSITIVE_INFINITY;
      dragState.current = null;
      setIsDragging(false);
      if (moved < DOCK_DRAG_MIN_MOVE) return;

      // 拖拽结束时贴边吸附
      const el = panelRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const side = resolveAskPanelDockSide(rect.left, rect.right, targetWindow.innerWidth);
      if (!side) return;
      setDockedTop(
        Math.round(
          Math.max(VIEWPORT_PADDING, Math.min(rect.top, targetWindow.innerHeight - rect.height - VIEWPORT_PADDING)),
        ),
      );
      setDocked(side);
    },
    [targetWindow],
  );

  // 从停靠状态展开：恢复到停靠前那一侧的完整位置，之后保持展开，直到再次拖近边缘。
  // focusTextarea：键盘 Tab / 点击展开时把焦点送进输入框；悬停展开不抢焦点（面板卸载过，
  // textarea 是新节点，必须等重渲染后再聚焦）。已在展开态时（如悬停已展开后的补发 click）只补焦点。
  const expandFromDock = useCallback(
    (focusTextarea?: boolean) => {
      if (focusTextarea) {
        targetWindow.setTimeout(() => textareaRef.current?.focus(), 0);
      }
      if (!docked) return;
      const vw = targetWindow.innerWidth;
      const vh = targetWindow.innerHeight;
      const clampedSize = clampSizeToViewport(size, vw, vh);
      setPosition({
        top: Math.round(Math.max(VIEWPORT_PADDING, Math.min(dockedTop, vh - clampedSize.height - VIEWPORT_PADDING))),
        left: Math.round(docked === 'right' ? vw - clampedSize.width - VIEWPORT_PADDING : VIEWPORT_PADDING),
      });
      setDocked(null);
    },
    [docked, dockedTop, size, targetWindow],
  );

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: PointerEvent) => handlePointerMove(e);
    const onUp = (e: PointerEvent) => handlePointerUp(e);
    targetWindow.addEventListener('pointermove', onMove);
    targetWindow.addEventListener('pointerup', onUp);
    return () => {
      targetWindow.removeEventListener('pointermove', onMove);
      targetWindow.removeEventListener('pointerup', onUp);
    };
  }, [isDragging, handlePointerMove, handlePointerUp, targetWindow]);

  // Resize handling
  const handleResizePointerDown = useCallback(
    (dir: ResizeDir) => (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!panelRef.current || !position) return;
      const el = e.currentTarget as HTMLElement;
      el.setPointerCapture(e.pointerId);
      resizeState.current = {
        dir,
        startX: e.clientX,
        startY: e.clientY,
        startW: size.width,
        startH: size.height,
        startTop: position.top,
        startLeft: position.left,
        pointerId: e.pointerId,
        capturedEl: el,
      };
      setIsResizing(dir);
    },
    [position, size],
  );

  const handleResizePointerMove = useCallback(
    (e: PointerEvent) => {
      const st = resizeState.current;
      if (!st) return;
      const vw = targetWindow.innerWidth;
      const vh = targetWindow.innerHeight;
      const dx = e.clientX - st.startX;
      const dy = e.clientY - st.startY;
      let newW = st.startW;
      let newH = st.startH;
      let newTop = st.startTop;
      let newLeft = st.startLeft;

      if (st.dir.includes('e')) newW = st.startW + dx;
      if (st.dir.includes('w')) {
        newW = st.startW - dx;
        newLeft = st.startLeft + dx;
      }
      if (st.dir.includes('s')) newH = st.startH + dy;
      if (st.dir.includes('n')) {
        newH = st.startH - dy;
        newTop = st.startTop + dy;
      }

      newW = Math.max(PANEL_MIN_WIDTH, Math.min(newW, vw - VIEWPORT_PADDING * 2));
      newH = Math.max(PANEL_MIN_HEIGHT, Math.min(newH, vh - VIEWPORT_PADDING * 2, PANEL_MAX_HEIGHT_CAP));

      if (st.dir.includes('w')) {
        const maxLeft = st.startLeft + st.startW - PANEL_MIN_WIDTH;
        newLeft = Math.max(VIEWPORT_PADDING, Math.min(newLeft, maxLeft));
        if (newW !== st.startW - (newLeft - st.startLeft)) {
          newW = st.startW - (newLeft - st.startLeft);
        }
        // 反推出的宽度必须重新套上限，否则左缘贴边时宽度会越过视口
        newW = Math.max(PANEL_MIN_WIDTH, Math.min(newW, vw - VIEWPORT_PADDING * 2));
        newLeft = Math.max(VIEWPORT_PADDING, Math.min(newLeft, vw - newW - VIEWPORT_PADDING));
      }
      if (st.dir.includes('n')) {
        const maxTop = st.startTop + st.startH - PANEL_MIN_HEIGHT;
        newTop = Math.max(VIEWPORT_PADDING, Math.min(newTop, maxTop));
        if (newH !== st.startH - (newTop - st.startTop)) {
          newH = st.startH - (newTop - st.startTop);
        }
        // 反推出的高度必须重新套上限（含 PANEL_MAX_HEIGHT_CAP），否则上缘拖到视口顶部时高度会超出上限
        newH = Math.max(PANEL_MIN_HEIGHT, Math.min(newH, vh - VIEWPORT_PADDING * 2, PANEL_MAX_HEIGHT_CAP));
        newTop = Math.max(VIEWPORT_PADDING, Math.min(newTop, vh - newH - VIEWPORT_PADDING));
      }
      if (st.dir.includes('e') && !st.dir.includes('w')) {
        newW = Math.min(newW, vw - st.startLeft - VIEWPORT_PADDING);
      }
      if (st.dir.includes('s') && !st.dir.includes('n')) {
        newH = Math.min(newH, vh - st.startTop - VIEWPORT_PADDING);
      }

      setSize({ width: Math.round(newW), height: Math.round(newH) });
      if (st.dir.includes('w') || st.dir.includes('n')) {
        setPosition({ top: Math.round(newTop), left: Math.round(newLeft) });
      }
    },
    [targetWindow],
  );

  const handleResizePointerUp = useCallback(() => {
    const st = resizeState.current;
    if (st?.capturedEl) {
      try {
        st.capturedEl.releasePointerCapture(st.pointerId);
      } catch {
        // ignore
      }
    }
    resizeState.current = null;
    setIsResizing(null);
  }, []);

  useEffect(() => {
    if (!isResizing) return;
    const onMove = (e: PointerEvent) => handleResizePointerMove(e);
    const onUp = () => handleResizePointerUp();
    targetWindow.addEventListener('pointermove', onMove);
    targetWindow.addEventListener('pointerup', onUp);
    return () => {
      targetWindow.removeEventListener('pointermove', onMove);
      targetWindow.removeEventListener('pointerup', onUp);
    };
  }, [isResizing, handleResizePointerMove, handleResizePointerUp, targetWindow]);

  const handleResetSize = useCallback(() => {
    const vw = targetWindow.innerWidth;
    const vh = targetWindow.innerHeight;
    setSize(clampSizeToViewport({ width: PANEL_DEFAULT_WIDTH, height: PANEL_DEFAULT_HEIGHT }, vw, vh));
  }, [targetWindow]);

  useEffect(() => {
    const isEditableElement = (el: Element | null): boolean =>
      el instanceof HTMLElement && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (e.defaultPrevented) return;
      const active = targetDocument.activeElement;

      // 停靠状态下面板已卸载：焦点不在任何可编辑元素里时，Escape 直接关闭整个询问会话
      if (docked) {
        if (isEditableElement(active)) return;
        e.stopPropagation();
        onClose();
        return;
      }

      if (panelRef.current && active && panelRef.current.contains(active)) {
        e.stopPropagation();
        onClose();
      } else if (!panelRef.current?.contains(active as Node | null)) {
        return;
      }
    };
    targetDocument.addEventListener('keydown', onKey);
    return () => targetDocument.removeEventListener('keydown', onKey);
  }, [docked, onClose, targetDocument]);

  const handleAnswerScroll = useCallback(() => {
    const el = answerContainerRef.current;
    if (!el) return;
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    shouldAutoScrollRef.current = distanceToBottom < 80;
  }, []);

  // Accepts both change and input events so the textarea can share one handler.
  const handleTextareaInput = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement> | React.FormEvent<HTMLTextAreaElement>) => {
      const el = e.currentTarget;
      setQuestion(el.value);
      el.style.height = 'auto';
      const maxH = 96;
      el.style.height = `${Math.min(el.scrollHeight, maxH)}px`;
      el.style.overflowY = el.scrollHeight > maxH ? 'auto' : 'hidden';
    },
    [],
  );

  const hasAnswer = !!answer;
  const showEmptyState = !hasAnswer && !isLoading && !error;

  if (!position) return null;

  if (docked) {
    const handleTop = Math.round(
      Math.max(
        VIEWPORT_PADDING,
        Math.min(
          dockedTop + size.height / 2 - DOCK_HANDLE_HEIGHT / 2,
          targetWindow.innerHeight - DOCK_HANDLE_HEIGHT - VIEWPORT_PADDING,
        ),
      ),
    );
    const isRight = docked === 'right';
    return createPortal(
      <button
        type="button"
        className={`fixed ${PANEL_Z_INDEX} flex items-center justify-center border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-primary)] text-[var(--theme-text-secondary)] shadow-[0_6px_20px_rgba(0,0,0,0.18)] backdrop-blur-xl transition-colors hover:bg-[var(--theme-bg-tertiary)] hover:text-[var(--theme-text-primary)]`}
        style={{
          top: handleTop,
          width: DOCK_HANDLE_WIDTH,
          height: DOCK_HANDLE_HEIGHT,
          ...(isRight ? { right: 0, borderRadius: '10px 0 0 10px' } : { left: 0, borderRadius: '0 10px 10px 0' }),
        }}
        onMouseEnter={() => expandFromDock()}
        onFocus={() => expandFromDock(true)}
        onClick={() => expandFromDock(true)}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
        aria-label={t('ask')}
        title={t('askDockHandleHint')}
      >
        {/* 常显品牌色条：贴边收起后把手要有足够的视觉存在感，避免找不到面板 */}
        <span
          aria-hidden
          className={`absolute top-2.5 bottom-2.5 w-[3px] rounded-full bg-[var(--theme-text-link)] opacity-80 ${
            isRight ? 'right-1' : 'left-1'
          }`}
        />
        {isRight ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
        {(isLoading || error) && (
          <span
            aria-hidden
            className={`absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full ${
              error ? 'bg-[var(--theme-text-danger)]' : 'animate-pulse bg-[var(--theme-text-link)]'
            }`}
          />
        )}
      </button>,
      targetDocument.body,
    );
  }

  const ghostPill =
    'flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium text-[var(--theme-text-secondary)] transition-colors hover:bg-[var(--theme-bg-tertiary)] hover:text-[var(--theme-text-primary)] disabled:opacity-50 disabled:pointer-events-none';

  return createPortal(
    <>
      <div
        ref={panelRef}
        className={`fixed ${PANEL_Z_INDEX} flex flex-col overflow-hidden rounded-[20px] border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-primary)]/95 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.14)]`}
        style={{
          top: position.top,
          left: position.left,
          width: size.width,
          height: size.height,
          animation: 'askPanelIn 0.22s var(--ease-out-expo) both',
        }}
        role="dialog"
        aria-label={t('ask')}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div
          className="flex h-11 shrink-0 items-center gap-2 border-b border-[var(--theme-border-primary)] px-3.5 select-none"
          onPointerDown={handlePointerDown}
          style={{ cursor: isDragging ? 'grabbing' : 'grab', touchAction: 'none' }}
        >
          <span className="text-sm font-semibold text-[var(--theme-text-primary)]">{t('ask')}</span>
          {selectionAskModelId ? (
            <span
              className="max-w-[160px] truncate rounded-full bg-[var(--theme-bg-secondary)] px-2 py-0.5 text-xs font-medium text-[var(--theme-text-secondary)]"
              title={
                selectionAskProviderId ? `${selectionAskModelId} · ${selectionAskProviderId}` : selectionAskModelId
              }
            >
              {formatSelectionAskModelLabel(selectionAskModelId)}
            </span>
          ) : (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-[var(--theme-bg-secondary)] px-2 py-0.5 text-xs font-medium text-[var(--theme-text-secondary)]"
              title={t('selectionAskModelNotConfigured')}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--theme-text-danger)]" />
              {t('selectionAskModelNotConfigured')}
            </span>
          )}
          <div className="flex-1" />
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={handleResetSize}
            className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
              isResizing || isDragging
                ? 'text-[var(--theme-text-primary)]'
                : 'text-[var(--theme-text-tertiary)] hover:bg-[var(--theme-bg-tertiary)] hover:text-[var(--theme-text-primary)]'
            }`}
            title={t('askResizeHint')}
            aria-label={t('askResetSize')}
          >
            <RotateCcw size={13} />
          </button>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--theme-text-tertiary)] transition-colors hover:bg-[var(--theme-bg-tertiary)] hover:text-[var(--theme-text-primary)]"
            aria-label={t('close')}
          >
            <X size={15} />
          </button>
        </div>

        <div
          ref={answerContainerRef}
          onScroll={handleAnswerScroll}
          className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 py-3"
        >
          <div className="mb-3 shrink-0 rounded-xl bg-[var(--theme-bg-secondary)]/70 px-3 py-2">
            <p
              ref={previewRef}
              className={`${isPreviewExpanded ? '' : 'line-clamp-2'} whitespace-pre-wrap break-words text-xs leading-relaxed text-[var(--theme-text-primary)]`}
            >
              {selectedText}
            </p>
            {(isPreviewExpanded || isPreviewClamped || selectedText.length > 90) && (
              <button
                onClick={() => setIsPreviewExpanded((v) => !v)}
                className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-[var(--theme-text-link)] hover:underline"
              >
                {isPreviewExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                {isPreviewExpanded ? t('collapse') : `${t('expand')} · ${selectedText.length}`}
              </button>
            )}
          </div>

          {showEmptyState && (
            <div className="flex flex-1 flex-col items-center justify-center gap-2.5 py-2">
              {(
                [
                  ['explain', t('askExplain'), BookOpen],
                  ['translate', t('askTranslate'), Languages],
                  ['summarize', t('askSummarize'), List],
                ] as const
              ).map(([key, label, Icon]) => (
                <button
                  key={key}
                  onClick={() => handleQuick(key)}
                  className="group flex w-full max-w-[340px] items-center gap-3 rounded-xl border border-[var(--theme-border-primary)] bg-[var(--theme-bg-secondary)]/50 px-4 py-3 text-left transition-all hover:border-[var(--theme-border-focus)]/40 hover:bg-[var(--theme-bg-tertiary)]"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--theme-bg-accent)]/10 text-[var(--theme-text-link)] transition-colors group-hover:bg-[var(--theme-bg-accent)]/20">
                    <Icon size={16} />
                  </span>
                  <span className="text-sm font-medium text-[var(--theme-text-primary)]">{label}</span>
                </button>
              ))}
            </div>
          )}

          {isLoading && !hasAnswer && (
            <div className="flex items-center justify-center gap-2.5 pb-6 pt-2 text-sm text-[var(--theme-text-secondary)]">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--theme-text-link)] border-t-transparent" />
              {t('askThinking')}
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-[var(--theme-text-danger)]/20 bg-[var(--theme-bg-error-message)] px-3.5 py-3">
              <p className="text-sm leading-relaxed text-[var(--theme-text-danger)]">{error}</p>
              <button
                onClick={() => question.trim() && handleAsk(question)}
                disabled={!question.trim()}
                className="mt-2.5 rounded-full bg-[var(--theme-bg-danger)] px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[var(--theme-bg-danger-hover)] disabled:opacity-50 disabled:pointer-events-none"
              >
                {t('retryButtonTitle')}
              </button>
            </div>
          )}

          {hasAnswer && (
            <div className="prose prose-sm max-w-none dark:prose-invert prose-p:leading-relaxed prose-pre:overflow-auto prose-pre:bg-[var(--theme-bg-code-block)]">
              <MathMarkdownRenderer
                content={answer}
                isLoading={isLoading}
                onImageClick={() => {}}
                onOpenHtmlPreview={() => {}}
                expandCodeBlocksByDefault={false}
                isMermaidRenderingEnabled={true}
                isGraphvizRenderingEnabled={true}
                themeId={themeId}
                onOpenSidePanel={() => {}}
              />
              {isLoading && (
                <span className="ml-0.5 inline-flex translate-y-[-1px] items-center gap-0.5 align-middle">
                  {[0, 120, 240].map((delay) => (
                    <span
                      key={delay}
                      className="h-1 w-1 animate-bounce rounded-full bg-[var(--theme-text-link)]"
                      style={{ animationDelay: `-${delay}ms` }}
                    />
                  ))}
                </span>
              )}
            </div>
          )}
        </div>

        {hasAnswer && (
          <div className="flex shrink-0 items-center gap-0.5 border-t border-[var(--theme-border-primary)] px-2.5 py-1.5">
            <button onClick={handleCopyAnswer} className={ghostPill}>
              {isCopied ? <Check size={13} className="text-[var(--theme-text-success)]" /> : <Copy size={13} />}
              {isCopied ? t('copied') : t('askCopyAnswer')}
            </button>
            {onInsert && (
              <button onClick={handleInsertAnswer} className={ghostPill}>
                <CornerRightDown size={13} />
                {t('askInsertAnswer')}
              </button>
            )}
            {onQuote && (
              <button onClick={handleQuoteAnswer} className={ghostPill}>
                <Quote size={13} />
                {t('quote')}
              </button>
            )}
          </div>
        )}

        <div className="shrink-0 border-t border-[var(--theme-border-primary)] bg-[var(--theme-bg-secondary)]/60 p-2.5">
          {hasAnswer && (
            <div className="mb-2 flex flex-wrap gap-1">
              {(
                [
                  ['explain', t('askExplain')],
                  ['translate', t('askTranslate')],
                  ['summarize', t('askSummarize')],
                ] as const
              ).map(([key, label]) => (
                <button key={key} onClick={() => handleQuick(key)} disabled={isLoading} className={ghostPill}>
                  {label}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={question}
              onChange={handleTextareaInput}
              onKeyDown={handleKeyDown}
              rows={1}
              disabled={isLoading}
              placeholder={isLoading ? t('askThinking') : t('askPlaceholder')}
              className="max-h-24 min-h-[40px] flex-1 resize-none overflow-y-hidden rounded-2xl border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-input)] px-3.5 py-2.5 text-sm text-[var(--theme-text-primary)] outline-none transition-colors placeholder:text-[var(--theme-text-tertiary)] focus:border-[var(--theme-border-focus)] disabled:cursor-not-allowed disabled:opacity-60"
              style={{ fieldSizing: 'content' } as React.CSSProperties}
            />
            {isLoading ? (
              <button
                onClick={cancel}
                className={`grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full text-white transition-colors ${'bg-[var(--theme-bg-danger)] hover:bg-[var(--theme-bg-danger-hover)]'}`}
                aria-label={t('retryAndStopButtonTitle')}
                title={t('retryAndStopButtonTitle')}
                style={{ transform: 'translateY(-2px)' }}
              >
                <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
                  <rect x="3" y="3" width="10" height="10" rx="3" fill="currentColor" />
                </svg>
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!question.trim()}
                className={`grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${SEND_BUTTON_BG}`}
                aria-label={t('askSend')}
                style={{ transform: 'translateY(-2px)' }}
              >
                <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
                  <path
                    d="M8.3125 0.980183C8.66767 1.0531 8.97902 1.20418 9.2627 1.43233C9.48724 1.61297 9.73029 1.85793 9.97949 2.10714L14.707 6.83468L13.293 8.24874L9 3.95577V15.0417H7V3.95577L2.70703 8.24874L1.29297 6.83468L6.02051 2.10714C6.26971 1.85793 6.51277 1.61297 6.7373 1.43233C6.97662 1.23986 7.28445 1.04402 7.6875 0.980183C7.8973 0.947006 8.1031 0.95516 8.3125 0.980183Z"
                    fill="currentColor"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* 把手仅作视觉指示，命中区在面板外侧热区；内缩 4px 防圆角裁剪 */}
        <div
          aria-hidden
          className={`pointer-events-none absolute bottom-1 right-1 flex h-4 w-4 items-end justify-end p-0.5 transition-opacity ${
            isResizing === 'se'
              ? 'text-[var(--theme-text-link)] opacity-100'
              : 'text-[var(--theme-text-tertiary)] opacity-70'
          }`}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
            <path
              d="M9 1 L9 9 L1 9"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>

      {/* 热区是面板兄弟节点、跨边框（外 6 内 1）：放面板内会盖住右缘滚动条 */}
      {(
        [
          // 边缘热区内侧只伸入 1px：右缘 5px 滚动条占据 [right-6, right-1]，
          // 内侧再深就会盖住滚动条导致拖不动。
          // 两端只留 5px 给角部热区（角区为角点 ±5px 的 10×10），保证边缘与角部无缝衔接、没有光标死区
          [
            'n',
            { top: position.top - 6, left: position.left + 5, width: size.width - 10, height: 7 },
            'cursor-n-resize',
          ],
          [
            's',
            { top: position.top + size.height - 1, left: position.left + 5, width: size.width - 10, height: 7 },
            'cursor-s-resize',
          ],
          [
            'e',
            { top: position.top + 5, left: position.left + size.width - 1, width: 7, height: size.height - 10 },
            'cursor-e-resize',
          ],
          [
            'w',
            { top: position.top + 5, left: position.left - 6, width: 7, height: size.height - 10 },
            'cursor-w-resize',
          ],
        ] as const
      ).map(([dir, hitStyle, cursor]) => (
        <div
          key={dir}
          onPointerDown={handleResizePointerDown(dir)}
          className={`fixed z-[10000] ${cursor} touch-none`}
          style={hitStyle}
        />
      ))}
      {(
        [
          ['ne', position.top - 5, position.left + size.width - 5, 'cursor-ne-resize'],
          ['nw', position.top - 5, position.left - 5, 'cursor-nw-resize'],
          ['sw', position.top + size.height - 5, position.left - 5, 'cursor-sw-resize'],
          ['se', position.top + size.height - 5, position.left + size.width - 5, 'cursor-se-resize'],
        ] as const
      ).map(([dir, hitTop, hitLeft, cursor]) => (
        <div
          key={dir}
          onPointerDown={handleResizePointerDown(dir)}
          onDoubleClick={dir === 'se' ? handleResetSize : undefined}
          title={dir === 'se' ? t('askResizeHint') : undefined}
          aria-label={dir === 'se' ? t('askResetSize') : undefined}
          className={`fixed z-[10000] ${cursor} touch-none`}
          style={{ top: hitTop, left: hitLeft, width: 10, height: 10 }}
        />
      ))}
    </>,
    targetDocument.body,
  );
};
