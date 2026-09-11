import { useEffect, type RefObject } from 'react';

export interface UsePdfHotkeysProps {
  enabled?: boolean;
  containerRef: RefObject<HTMLElement | null>;
  onPrevPage: () => void;
  onNextPage: () => void;
  onFirstPage: () => void;
  onLastPage: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onRotate: () => void;
  onFitToWidth?: () => void;
  onToggleSidebar?: () => void;
}

export function usePdfHotkeys({
  enabled = true,
  containerRef,
  onPrevPage,
  onNextPage,
  onFirstPage,
  onLastPage,
  onZoomIn,
  onZoomOut,
  onRotate,
  onFitToWidth,
  onToggleSidebar,
}: UsePdfHotkeysProps) {
  useEffect(() => {
    if (!enabled) return;

    let isHovered = false;
    const container = containerRef.current;

    const handleMouseEnter = () => {
      isHovered = true;
    };
    const handleMouseLeave = () => {
      isHovered = false;
    };

    if (container) {
      container.addEventListener('mouseenter', handleMouseEnter);
      container.addEventListener('mouseleave', handleMouseLeave);
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInputFocused =
        activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement ||
        (activeEl instanceof HTMLElement && activeEl.isContentEditable);

      if (isInputFocused) return;

      const currentContainer = containerRef.current;
      const isContainerFocused =
        isHovered || currentContainer === activeEl || (currentContainer ? currentContainer.contains(activeEl) : false);

      if (!isContainerFocused) return;

      // Do not block system browser shortcuts when Ctrl / Meta / Alt is held
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const key = e.key.toLowerCase();

      if (e.key === 'ArrowLeft' || e.key === 'PageUp' || key === 'k') {
        e.preventDefault();
        onPrevPage();
      } else if (e.key === 'ArrowRight' || e.key === 'PageDown' || key === 'j') {
        e.preventDefault();
        onNextPage();
      } else if (e.key === 'Home') {
        e.preventDefault();
        onFirstPage();
      } else if (e.key === 'End') {
        e.preventDefault();
        onLastPage();
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        onZoomIn();
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        onZoomOut();
      } else if (key === 'r') {
        e.preventDefault();
        onRotate();
      } else if (key === 'w' && onFitToWidth) {
        e.preventDefault();
        onFitToWidth();
      } else if (key === 't' && onToggleSidebar) {
        e.preventDefault();
        onToggleSidebar();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      if (container) {
        container.removeEventListener('mouseenter', handleMouseEnter);
        container.removeEventListener('mouseleave', handleMouseLeave);
      }
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    enabled,
    containerRef,
    onPrevPage,
    onNextPage,
    onFirstPage,
    onLastPage,
    onZoomIn,
    onZoomOut,
    onRotate,
    onFitToWidth,
    onToggleSidebar,
  ]);
}
