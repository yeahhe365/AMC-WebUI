import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';

export interface VirtualSourceViewerProps {
  content: string;
  highlightLine?: number | null;
  onHighlightLineConsumed?: () => void;
  className?: string;
}

const GUTTER_WIDTH_PX = 56;

export const VirtualSourceViewer: React.FC<VirtualSourceViewerProps> = ({
  content,
  highlightLine = null,
  onHighlightLineConsumed,
  className = '',
}) => {
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const [activeHighlight, setActiveHighlight] = useState<number | null>(null);

  const lines = useMemo(() => content.split(/\r\n|\r|\n/), [content]);

  useEffect(() => {
    if (highlightLine === null || highlightLine < 0 || !virtuosoRef.current) return;

    setActiveHighlight(highlightLine);
    virtuosoRef.current.scrollToIndex({
      index: highlightLine,
      align: 'center',
      behavior: 'smooth',
    });
    onHighlightLineConsumed?.();

    const timer = setTimeout(() => {
      setActiveHighlight(null);
    }, 2000);

    return () => clearTimeout(timer);
  }, [highlightLine, onHighlightLineConsumed]);

  return (
    <div className={`h-full w-full relative bg-[var(--theme-bg-primary)] ${className}`}>
      <div
        className="absolute left-0 top-0 bottom-0 pointer-events-none border-r border-[var(--theme-border-secondary)] bg-[var(--theme-bg-secondary)]/30 z-0"
        style={{ width: GUTTER_WIDTH_PX }}
      />
      <Virtuoso
        ref={virtuosoRef}
        data={lines}
        className="h-full custom-scrollbar"
        computeItemKey={(index) => index}
        initialItemCount={Math.min(lines.length, 100)}
        itemContent={(index, line) => {
          const isHighlighted = (activeHighlight ?? highlightLine) === index;
          return (
            <div
              className={`flex items-stretch transition-colors duration-300 ${
                isHighlighted
                  ? 'bg-[var(--theme-bg-accent)]/20 border-l-2 border-[var(--theme-bg-accent,#0ea5e9)]'
                  : 'hover:bg-[var(--theme-bg-secondary)]/30'
              }`}
            >
              <span
                className="shrink-0 select-none text-right font-mono text-xs leading-[21px] text-[var(--theme-text-tertiary)] pr-3 py-0.5"
                style={{ width: GUTTER_WIDTH_PX }}
              >
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 whitespace-pre font-mono text-sm leading-[21px] text-[var(--theme-text-primary)] pl-3.5 py-0.5 select-text">
                {line || ' '}
              </span>
            </div>
          );
        }}
      />
    </div>
  );
};
