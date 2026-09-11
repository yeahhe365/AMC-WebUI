import React, { useEffect, useState, useMemo, type RefObject } from 'react';
import { Quote, Copy, Check, X } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { useChatStore } from '@/stores/chatStore';
import { copyTextToClipboard } from '@/utils/clipboard';
import { toastSuccess } from '@/stores/toastStore';

interface PdfSelectionState {
  text: string;
  rect: DOMRect;
}

interface PdfSelectionBubbleProps {
  containerRef: RefObject<HTMLElement | null>;
  onQuote?: (text: string) => void;
}

export const PdfSelectionBubble: React.FC<PdfSelectionBubbleProps> = ({ containerRef, onQuote }) => {
  const { t } = useI18n();
  const [selectionState, setSelectionState] = useState<PdfSelectionState | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  const clearSelection = () => {
    if (typeof window !== 'undefined') {
      window.getSelection()?.removeAllRanges();
    }
    setSelectionState(null);
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let rafId: number | null = null;

    const checkSelection = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
        setSelectionState(null);
        return;
      }

      const range = selection.getRangeAt(0);
      const commonAncestor = range.commonAncestorContainer;

      if (!container.contains(commonAncestor)) {
        setSelectionState(null);
        return;
      }

      const text = selection.toString().trim();
      if (!text) {
        setSelectionState(null);
        return;
      }

      const rect = range.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        setSelectionState(null);
        return;
      }

      setSelectionState({ text, rect });
    };

    const scheduleCheck = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(checkSelection);
    };

    document.addEventListener('selectionchange', scheduleCheck);
    container.addEventListener('scroll', scheduleCheck, { passive: true });
    window.addEventListener('resize', scheduleCheck);

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      document.removeEventListener('selectionchange', scheduleCheck);
      container.removeEventListener('scroll', scheduleCheck);
      window.removeEventListener('resize', scheduleCheck);
    };
  }, [containerRef]);

  const computedPosition = useMemo(() => {
    if (!selectionState) return null;
    const { rect } = selectionState;
    const viewportWidth = window.innerWidth;
    const bubbleHalfWidth = 100;
    const padding = 16;

    let left = rect.left + rect.width / 2;
    if (left - bubbleHalfWidth < padding) {
      left = padding + bubbleHalfWidth;
    } else if (left + bubbleHalfWidth > viewportWidth - padding) {
      left = viewportWidth - padding - bubbleHalfWidth;
    }

    let top = rect.top - 46;
    if (top < 56) {
      top = rect.bottom + 10;
    }

    return { top, left };
  }, [selectionState]);

  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!selectionState) return;

    const success = await copyTextToClipboard(selectionState.text);
    if (success) {
      setIsCopied(true);
      toastSuccess(t('copied'));
      setTimeout(() => {
        setIsCopied(false);
        clearSelection();
      }, 1000);
    }
  };

  const handleQuote = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!selectionState) return;

    if (onQuote) {
      onQuote(selectionState.text);
    } else {
      useChatStore.getState().setCommandedInput({
        text: selectionState.text,
        id: Date.now(),
        mode: 'quote',
      });
    }

    toastSuccess(t('quote'));
    clearSelection();
  };

  if (!selectionState || !computedPosition) return null;

  return (
    <div
      data-testid="pdf-selection-bubble"
      className="fixed z-50 flex items-center gap-1 rounded-full border border-white/20 bg-[#121316]/95 px-2 py-1 shadow-2xl backdrop-blur-md transition-all duration-150 select-none animate-in fade-in zoom-in-95"
      style={{
        top: `${computedPosition.top}px`,
        left: `${computedPosition.left}px`,
        transform: 'translateX(-50%)',
      }}
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <button
        type="button"
        onMouseDown={handleQuote}
        className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-white/90 hover:text-white hover:bg-white/15 rounded-full transition-colors active:scale-95 cursor-pointer"
        title={t('quote')}
        aria-label={t('quote')}
      >
        <Quote size={13} className="text-sky-400" />
        <span>{t('quote')}</span>
      </button>

      <div className="w-px h-3 bg-white/20 mx-0.5" />

      <button
        type="button"
        onMouseDown={handleCopy}
        className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-white/90 hover:text-white hover:bg-white/15 rounded-full transition-colors active:scale-95 cursor-pointer"
        title={isCopied ? t('copied') : t('copy')}
        aria-label={isCopied ? t('copied') : t('copy')}
      >
        {isCopied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} className="text-white/70" />}
        <span>{isCopied ? t('copied') : t('copy')}</span>
      </button>

      <div className="w-px h-3 bg-white/20 mx-0.5" />

      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          clearSelection();
        }}
        className="p-1 text-white/40 hover:text-white hover:bg-white/15 rounded-full transition-colors active:scale-95 cursor-pointer"
        title={t('close')}
        aria-label={t('close')}
      >
        <X size={12} />
      </button>
    </div>
  );
};
