import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import { type SavedChatSession } from '@/types';
import { SessionItem } from './SessionItem';
import { type SessionItemPassedProps } from './sidebarTypes';

const VIRTUALIZATION_THRESHOLD = 50;

interface LimitedSessionListProps {
  sessions: SavedChatSession[];
  sessionItemProps: SessionItemPassedProps;
  className?: string;
  isDragging?: boolean;
}

export const LimitedSessionList: React.FC<LimitedSessionListProps> = ({
  sessions,
  sessionItemProps,
  className,
  isDragging,
}) => {
  const [animatedParent] = useAutoAnimate<HTMLUListElement>({ duration: 200 });
  const containerRef = useRef<HTMLDivElement>(null);
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const [scrollParent, setScrollParent] = useState<HTMLElement | undefined>(undefined);

  const isLargeList = sessions.length > VIRTUALIZATION_THRESHOLD;

  useLayoutEffect(() => {
    if (containerRef.current) {
      const parent = containerRef.current.closest<HTMLElement>('.overflow-y-auto');
      if (parent) {
        setScrollParent(parent);
      }
    }
  }, []);

  const { activeSessionId } = sessionItemProps;

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
      <ul ref={isDragging ? undefined : animatedParent} className={className}>
        {sessions.map((session) => (
          <SessionItem key={session.id} session={session} {...sessionItemProps} />
        ))}
      </ul>
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
