import React, { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useI18n } from '@/contexts/I18nContext';
import { useWindowContext } from '@/contexts/WindowContext';
import { IconHistory } from '@/components/icons';
import { useChatStore } from '@/stores/chatStore';
import type { SavedChatSession } from '@/types';
import { SIDEBAR_ICON_BUTTON_CLASS } from './sidebarStyles';
import { interpolate } from '@/i18n/interpolate';

interface CollapsedRecentChatsButtonProps {
  sessions: SavedChatSession[];
  activeSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
}

const PANEL_WIDTH = 320;
const PANEL_GAP = 0;
const PANEL_MARGIN = 16;
const MAX_RECENT_ITEMS = 8;
const CLOSE_DELAY_MS = 120;

type PopoverOpenMode = 'hover' | 'focus' | 'click';

export const CollapsedRecentChatsButton: React.FC<CollapsedRecentChatsButtonProps> = ({
  sessions,
  activeSessionId,
  onSelectSession,
}) => {
  const { t } = useI18n();
  const { window: targetWindow, document: targetDocument } = useWindowContext();
  const completedCount = useChatStore((state) => Object.keys(state.completedSessions).length);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [openMode, setOpenMode] = useState<PopoverOpenMode | null>(null);
  const [panelPosition, setPanelPosition] = useState<CSSProperties>({});

  const recentSessions = useMemo(
    () =>
      [...sessions]
        .filter((session) => session.id !== activeSessionId)
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, MAX_RECENT_ITEMS),
    [activeSessionId, sessions],
  );

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current !== null) {
      targetWindow.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, [targetWindow]);

  const closePopover = useCallback(() => {
    clearCloseTimer();
    setIsOpen(false);
    setOpenMode(null);
  }, [clearCloseTimer]);

  const computePanelPosition = useCallback((): CSSProperties => {
    if (!buttonRef.current) {
      return {};
    }

    const buttonRect = buttonRef.current.getBoundingClientRect();
    const viewportWidth = targetWindow.innerWidth;
    const viewportHeight = targetWindow.innerHeight;
    const leftCandidate = buttonRect.right + PANEL_GAP;
    const fitsRight = leftCandidate + PANEL_WIDTH <= viewportWidth - PANEL_MARGIN;
    const left = fitsRight ? leftCandidate : Math.max(PANEL_MARGIN, buttonRect.left - PANEL_WIDTH - PANEL_GAP);
    const top = Math.min(Math.max(PANEL_MARGIN, buttonRect.top), viewportHeight - PANEL_MARGIN * 2);

    return {
      position: 'fixed',
      top,
      left,
      width: PANEL_WIDTH,
      maxHeight: `calc(100vh - ${top + PANEL_MARGIN}px)`,
      zIndex: 9999,
    };
  }, [targetWindow]);

  const openPopover = useCallback(
    (mode: PopoverOpenMode) => {
      clearCloseTimer();
      setPanelPosition(computePanelPosition());
      setIsOpen(true);
      setOpenMode((currentMode) => {
        if (currentMode === 'click' && mode !== 'click') {
          return currentMode;
        }

        return mode;
      });
    },
    [clearCloseTimer, computePanelPosition],
  );

  const scheduleClose = useCallback(() => {
    if (openMode === 'click') {
      clearCloseTimer();
      return;
    }

    clearCloseTimer();
    closeTimerRef.current = targetWindow.setTimeout(() => {
      setIsOpen(false);
      setOpenMode(null);
      closeTimerRef.current = null;
    }, CLOSE_DELAY_MS);
  }, [clearCloseTimer, openMode, targetWindow]);

  useEffect(() => () => clearCloseTimer(), [clearCloseTimer]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const updatePosition = () => {
      setPanelPosition(computePanelPosition());
    };

    targetWindow.addEventListener('resize', updatePosition);
    targetWindow.addEventListener('scroll', updatePosition, true);

    return () => {
      targetWindow.removeEventListener('resize', updatePosition);
      targetWindow.removeEventListener('scroll', updatePosition, true);
    };
  }, [computePanelPosition, isOpen, targetWindow]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (
        (buttonRef.current && target && buttonRef.current.contains(target)) ||
        (panelRef.current && target && panelRef.current.contains(target))
      ) {
        return;
      }
      closePopover();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closePopover();
      }
    };

    targetDocument.addEventListener('mousedown', handlePointerDown);
    targetDocument.addEventListener('touchstart', handlePointerDown);
    targetDocument.addEventListener('keydown', handleKeyDown);

    return () => {
      targetDocument.removeEventListener('mousedown', handlePointerDown);
      targetDocument.removeEventListener('touchstart', handlePointerDown);
      targetDocument.removeEventListener('keydown', handleKeyDown);
    };
  }, [closePopover, isOpen, targetDocument]);

  return (
    <>
      <div className="relative">
        <button
          ref={buttonRef}
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            if (isOpen && openMode === 'click') {
              closePopover();
              return;
            }
            openPopover('click');
          }}
          onMouseEnter={() => {
            if (openMode === 'click') {
              clearCloseTimer();
              return;
            }

            openPopover('hover');
          }}
          onMouseLeave={() => {
            if (openMode === 'hover') {
              scheduleClose();
            }
          }}
          onFocus={() => openPopover('focus')}
          onBlur={(event) => {
            const nextFocusTarget = event.relatedTarget as Node | null;
            if (
              nextFocusTarget &&
              ((buttonRef.current && buttonRef.current.contains(nextFocusTarget)) ||
                (panelRef.current && panelRef.current.contains(nextFocusTarget)))
            ) {
              return;
            }
            if (openMode === 'focus') {
              scheduleClose();
            }
          }}
          className={SIDEBAR_ICON_BUTTON_CLASS}
          title={t('historyRecentChats')}
          aria-label={t('historyRecentChats')}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
        >
          <IconHistory size={20} strokeWidth={2} />
        </button>

        {completedCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--theme-bg-accent)] px-1 text-[10px] font-semibold text-[var(--theme-text-accent)]"
            title={interpolate(t('sessionCompletedCountTitle'), { count: completedCount })}
            aria-label={interpolate(t('sessionCompletedCountTitle'), { count: completedCount })}
          >
            {completedCount}
          </span>
        )}
      </div>

      {isOpen &&
        createPortal(
          <div
            ref={panelRef}
            style={panelPosition}
            className="overflow-hidden rounded-xl border border-[var(--theme-border-primary)] bg-[var(--theme-bg-primary)] shadow-premium"
            onMouseEnter={() => {
              if (openMode === 'click') {
                clearCloseTimer();
                return;
              }

              openPopover('hover');
            }}
            onMouseLeave={() => {
              if (openMode === 'hover') {
                scheduleClose();
              }
            }}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-label={t('historyRecentChats')}
          >
            <div className="px-4 py-3 text-sm font-semibold text-[var(--theme-text-primary)]">
              {t('historyRecentChats')}
            </div>
            <div className="max-h-[min(420px,calc(100vh-120px))] overflow-y-auto py-1 custom-scrollbar">
              {recentSessions.length > 0 ? (
                recentSessions.map((session) => {
                  const displayTitle = session.title === 'New Chat' ? t('newChat') : session.title;
                  return (
                    <a
                      key={session.id}
                      href={`/chat/${session.id}`}
                      onClick={(event) => {
                        if (event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
                          event.preventDefault();
                          event.stopPropagation();
                          onSelectSession(session.id);
                          closePopover();
                        }
                      }}
                      className="block px-4 py-2.5 text-sm text-[var(--theme-text-primary)] no-underline hover:bg-[var(--theme-bg-tertiary)] focus:bg-[var(--theme-bg-tertiary)] focus:outline-none"
                    >
                      <span className="block truncate" title={displayTitle}>
                        {displayTitle}
                      </span>
                    </a>
                  );
                })
              ) : (
                <p className="px-4 py-3 text-sm font-medium text-[var(--theme-text-primary)]">{t('historyEmpty')}</p>
              )}
            </div>
          </div>,
          targetDocument.body,
        )}
    </>
  );
};
