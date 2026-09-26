import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

const POINTER_GRACE_MS = 150;
const ANCHOR_GAP = 8;
const VIEWPORT_MARGIN = 8;

export interface HoverCardProps {
  anchor: ReactNode;
  content: ReactNode;
  openDelayMs?: number;
  disabled?: boolean;
  copyText?: string;
  copyLabel?: string;
  copiedLabel?: string;
  className?: string;
}

export const HoverCard: React.FC<HoverCardProps> = ({
  anchor,
  content,
  openDelayMs = 800,
  disabled = false,
  copyText,
  copyLabel = 'Copy',
  copiedLabel = 'Copied!',
  className = '',
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; maxWidth?: number } | null>(null);

  const clearOpenTimer = () => {
    if (openTimerRef.current !== null) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
  };

  const clearCloseTimer = () => {
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const clearCopyTimer = () => {
    if (copyTimerRef.current !== null) {
      clearTimeout(copyTimerRef.current);
      copyTimerRef.current = null;
    }
    setCopied(false);
  };

  const close = useCallback(() => {
    clearOpenTimer();
    clearCloseTimer();
    clearCopyTimer();
    setIsOpen(false);
  }, []);

  const armClose = useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      close();
    }, POINTER_GRACE_MS);
  }, [close]);

  useEffect(() => {
    if (disabled && isOpen) {
      close();
    }
  }, [disabled, isOpen, close]);

  useEffect(() => {
    return () => {
      clearOpenTimer();
      clearCloseTimer();
      clearCopyTimer();
    };
  }, []);

  const calculatePosition = useCallback(() => {
    const wrapper = rootRef.current;
    if (!wrapper) return null;
    const target =
      wrapper.closest('li') ||
      (wrapper.firstElementChild as HTMLElement) ||
      wrapper;
    let r = target.getBoundingClientRect();
    if (r.width === 0 && r.height === 0 && wrapper.firstElementChild) {
      r = (wrapper.firstElementChild as HTMLElement).getBoundingClientRect();
    }
    if (r.width === 0 && r.height === 0 && wrapper.parentElement) {
      r = wrapper.parentElement.getBoundingClientRect();
    }

    const card = cardRef.current;
    const h = card?.offsetHeight ?? 90;
    const w = card?.offsetWidth ?? 260;

    let left = r.right + ANCHOR_GAP;
    if (left + w > window.innerWidth - VIEWPORT_MARGIN) {
      if (r.left - w - ANCHOR_GAP >= VIEWPORT_MARGIN) {
        left = r.left - w - ANCHOR_GAP;
      } else {
        left = Math.max(VIEWPORT_MARGIN, window.innerWidth - w - VIEWPORT_MARGIN);
      }
    }

    let top = r.top;
    if (top + h > window.innerHeight - VIEWPORT_MARGIN) {
      top = Math.max(VIEWPORT_MARGIN, window.innerHeight - h - VIEWPORT_MARGIN);
    } else {
      top = Math.max(VIEWPORT_MARGIN, top);
    }

    return { left, top, maxWidth: Math.min(360, window.innerWidth - 32) };
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) {
      setPos(null);
      return;
    }

    const updatePosition = () => {
      const nextPos = calculatePosition();
      if (nextPos) {
        setPos(nextPos);
      }
    };

    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isOpen, calculatePosition]);

  useLayoutEffect(() => {
    if (!isOpen || pos === null) return;
    const card = cardRef.current;
    if (!card) return;
    const h = card.offsetHeight;
    if (pos.top + h > window.innerHeight - VIEWPORT_MARGIN) {
      const adjustedTop = Math.max(VIEWPORT_MARGIN, window.innerHeight - h - VIEWPORT_MARGIN);
      if (adjustedTop !== pos.top) {
        setPos((prev) => (prev ? { ...prev, top: adjustedTop } : null));
      }
    }
  }, [isOpen, pos]);

  const handleCopy = async (e: React.MouseEvent | React.KeyboardEvent) => {
    if (!copyText || copied) return;
    e.stopPropagation();
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(copyText);
      }
      setCopied(true);
      if (copyTimerRef.current !== null) {
        clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = setTimeout(() => {
        setCopied(false);
      }, 1200);
    } catch {
      // ignore
    }
  };

  const copyable = Boolean(copyText);

  const cardNode = isOpen && pos !== null && !disabled && (
    <div
      ref={cardRef}
      role={copyable ? 'button' : 'tooltip'}
      tabIndex={copyable ? 0 : undefined}
      aria-label={copyable ? `${copyLabel}: ${copyText}` : undefined}
      onPointerEnter={clearCloseTimer}
      onPointerLeave={armClose}
      onClick={copyable ? handleCopy : undefined}
      onKeyDown={
        copyable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleCopy(e);
              }
            }
          : undefined
      }
      style={{
        position: 'fixed',
        left: pos.left,
        top: pos.top,
        maxWidth: pos.maxWidth ?? 360,
        zIndex: 9999,
      }}
      className={`rounded-xl border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-primary)] p-3 text-xs text-[var(--theme-text-primary)] shadow-2xl backdrop-blur-md transition-opacity duration-100 animate-in fade-in cursor-pointer select-none group ${className}`}
    >
      {copied ? (
        <div className="flex items-center gap-1.5 py-1 text-center justify-center font-medium text-[var(--theme-text-link)]">
          <span>{copiedLabel}</span>
        </div>
      ) : (
        content
      )}
    </div>
  );

  return (
    <div
      ref={rootRef}
      className="block w-full min-w-0"
      onPointerEnter={() => {
        if (disabled) return;
        clearCloseTimer();
        clearOpenTimer();
        openTimerRef.current = setTimeout(() => {
          const initialPos = calculatePosition();
          if (initialPos) {
            setPos(initialPos);
          }
          setIsOpen(true);
        }, openDelayMs);
      }}
      onPointerLeave={() => {
        clearOpenTimer();
        if (isOpen) {
          armClose();
        }
      }}
    >
      {anchor}
      {typeof document !== 'undefined' && cardNode && createPortal(cardNode, document.body)}
    </div>
  );
};
