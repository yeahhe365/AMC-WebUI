import React, { forwardRef, useCallback, useLayoutEffect, useRef, useState, type MutableRefObject } from 'react';
import { createPortal } from 'react-dom';
import { useWindowContext } from '@/contexts/WindowContext';
import { Z_INDEX_TOPMOST_OVERLAY } from '@/constants/layout';

interface ToolbarContainerProps {
  children: React.ReactNode;
  position: { top: number; left: number };
  isDragging: boolean;
}

const VIEWPORT_PADDING = 10;

const getToolbarRenderPosition = (
  position: { top: number; left: number },
  rect: Pick<DOMRect, 'width' | 'height'>,
  viewportWidth: number,
  viewportHeight: number,
) => {
  const maxLeft = Math.max(VIEWPORT_PADDING, viewportWidth - VIEWPORT_PADDING - rect.width);
  const maxTop = Math.max(VIEWPORT_PADDING, viewportHeight - VIEWPORT_PADDING - rect.height);

  return {
    left: Math.min(Math.max(Math.round(position.left - rect.width / 2), VIEWPORT_PADDING), maxLeft),
    top: Math.min(Math.max(Math.round(position.top), VIEWPORT_PADDING), maxTop),
  };
};

export const ToolbarContainer = forwardRef<HTMLDivElement, ToolbarContainerProps>(
  ({ children, position, isDragging }, ref) => {
    const localRef = useRef<HTMLDivElement | null>(null);
    const [renderPosition, setRenderPosition] = useState(position);
    const { document: targetDocument, window: targetWindow } = useWindowContext();

    const handleRef = useCallback(
      (node: HTMLDivElement | null) => {
        localRef.current = node;

        if (typeof ref === 'function') {
          ref(node);
          return;
        }

        if (ref) {
          (ref as MutableRefObject<HTMLDivElement | null>).current = node;
        }
      },
      [ref],
    );

    useLayoutEffect(() => {
      const clampToViewport = () => {
        const toolbar = localRef.current;
        if (!toolbar) {
          setRenderPosition({
            left: Math.round(position.left),
            top: Math.round(position.top),
          });
          return;
        }

        const rect = toolbar.getBoundingClientRect();
        const nextPosition = getToolbarRenderPosition(
          position,
          rect,
          targetWindow.innerWidth,
          targetWindow.innerHeight,
        );

        setRenderPosition((prev) => {
          if (prev.left === nextPosition.left && prev.top === nextPosition.top) {
            return prev;
          }

          return nextPosition;
        });
      };

      clampToViewport();

      const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => clampToViewport()) : null;

      if (localRef.current) {
        resizeObserver?.observe(localRef.current);
      }

      targetWindow.addEventListener('resize', clampToViewport);
      targetWindow.visualViewport?.addEventListener('resize', clampToViewport);
      targetWindow.visualViewport?.addEventListener('scroll', clampToViewport);

      return () => {
        resizeObserver?.disconnect();
        targetWindow.removeEventListener('resize', clampToViewport);
        targetWindow.visualViewport?.removeEventListener('resize', clampToViewport);
        targetWindow.visualViewport?.removeEventListener('scroll', clampToViewport);
      };
    }, [children, position, targetWindow]);

    return createPortal(
      <div
        ref={handleRef}
        className={`fixed ${Z_INDEX_TOPMOST_OVERLAY} flex max-w-[calc(100vw-20px)] items-center gap-0 overflow-x-auto rounded-full border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-secondary)] p-px shadow-lg pointer-events-auto no-scrollbar select-none`}
        onMouseUp={(event) => event.stopPropagation()}
        style={{
          top: renderPosition.top,
          left: renderPosition.left,
          animation: 'fadeIn 0.2s var(--ease-out-expo) both',
          transition: isDragging ? 'none' : 'opacity 0.2s',
        }}
      >
        {children}
      </div>,
      targetDocument.body,
    );
  },
);

ToolbarContainer.displayName = 'ToolbarContainer';
