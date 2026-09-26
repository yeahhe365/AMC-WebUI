import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import { type SavedChatSession } from '@/types';
import { SessionItem } from './SessionItem';
import { type SessionItemPassedProps } from './sidebarTypes';
import { useSidebarItemContext } from './SidebarItemContext';
import { AnimatedRows } from './AnimatedRows';

const VIRTUALIZATION_THRESHOLD = 50;
const ESTIMATED_ITEM_HEIGHT = 38;

interface LimitedSessionListProps {
  sessions: SavedChatSession[];
  sessionItemProps?: SessionItemPassedProps;
  className?: string;
  isDragging?: boolean;
  scrollParent?: HTMLElement | null;
}

export const LimitedSessionList: React.FC<LimitedSessionListProps> = ({
  sessions,
  sessionItemProps,
  className,
  isDragging,
  scrollParent: propScrollParent,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const context = useSidebarItemContext();
  const [internalScrollParent, setInternalScrollParent] = useState<HTMLElement | undefined>(undefined);

  const scrollParent = propScrollParent ?? context?.scrollContainerRef?.current ?? internalScrollParent;

  const isLargeList = sessions.length > VIRTUALIZATION_THRESHOLD;

  useLayoutEffect(() => {
    if (scrollParent) return;
    if (containerRef.current) {
      const parent = containerRef.current.closest<HTMLElement>('.overflow-y-auto');
      if (parent) {
        setInternalScrollParent(parent);
      }
    }
  }, [scrollParent]);

  const activeSessionId = sessionItemProps?.activeSessionId ?? context?.activeSessionId ?? null;

  useEffect(() => {
    if (!isLargeList || !activeSessionId || !virtuosoRef.current) return;
    const index = sessions.findIndex((session) => session.id === activeSessionId);
    if (index >= 0) {
      virtuosoRef.current.scrollIntoView({ index, behavior: 'auto', align: 'center' });
    }
  }, [activeSessionId, isLargeList, sessions]);

  const VirtuosoList = useMemo(() => {
    return React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
      ({ style, children, ...props }, ref) => (
        <div ref={ref} role="list" style={style} className={className} {...props}>
          {children}
        </div>
      ),
    );
  }, [className]);

  const virtuosoComponents = useMemo(
    () => ({
      List: VirtuosoList,
    }),
    [VirtuosoList],
  );

  if (!isLargeList) {
    return (
      <AnimatedRows
        className={className}
        rowKeys={sessions.map((session) => `session:${session.id}`)}
        ready={!isDragging}
      >
        {sessions.map((session) => (
          <SessionItem key={session.id} session={session} {...sessionItemProps} />
        ))}
      </AnimatedRows>
    );
  }

  return (
    <div ref={containerRef} className="w-full">
      {scrollParent ? (
        <Virtuoso
          ref={virtuosoRef}
          customScrollParent={scrollParent}
          data={sessions}
          computeItemKey={(_index, session) => session.id}
          itemContent={(_index, session) => <SessionItem key={session.id} session={session} {...sessionItemProps} />}
          components={virtuosoComponents}
          defaultItemHeight={ESTIMATED_ITEM_HEIGHT}
          initialItemCount={Math.min(sessions.length, 50)}
          increaseViewportBy={{ top: 200, bottom: 200 }}
        />
      ) : (
        <ul className={className}>
          {sessions.slice(0, VIRTUALIZATION_THRESHOLD).map((session) => (
            <SessionItem key={session.id} session={session} {...sessionItemProps} />
          ))}
        </ul>
      )}
    </div>
  );
};
