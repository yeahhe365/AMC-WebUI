import React, { useRef, useState, type RefObject } from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { Pin, MoreHorizontal } from 'lucide-react';
import { type ChatGroup, type SavedChatSession } from '@/types';
import { SessionItemMenu } from './SessionItemMenu';
import { InlineRenameInput } from './InlineRenameInput';
import { LoadingDots } from '@/components/shared/LoadingDots';
import { useChatStore } from '@/stores/chatStore';
import { SESSION_DRAG_TYPE, isSessionDrag } from './sidebarDragTypes';
import { Z_INDEX_TOPMOST_OVERLAY } from '@/constants/layout';

export interface SessionItemProps {
  session: SavedChatSession;
  activeSessionId: string | null;
  editingItem: { type: 'session' | 'group'; id: string; title: string } | null;
  activeMenu: string | null;
  loadingSessionIds: Set<string>;
  generatingTitleSessionIds: Set<string>;
  newlyTitledSessionIds: ReadonlySet<string>;
  groups: ChatGroup[];
  editInputRef: RefObject<HTMLInputElement>;
  menuRef: RefObject<HTMLDivElement>;
  onSelectSession: (sessionId: string) => void;
  onTogglePinSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onDuplicateSession: (sessionId: string) => void;
  onOpenExportModal: (sessionId?: string) => void | Promise<void>;
  onMoveSessionToGroup: (sessionId: string, groupId: string | null) => void;
  handleStartEdit: (item: SavedChatSession) => void;
  handleRenameConfirm: () => void;
  handleRenameKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  setEditingItem: (item: { type: 'session' | 'group'; id: string; title: string } | null) => void;
  toggleMenu: (e: React.MouseEvent, id: string) => void;
  setActiveMenu: (id: string | null) => void;
  setDragOverId: (id: string | null) => void;
  draggingSessionId: string | null;
  draggingGroupId?: string | null;
  dropIndicator?: { id: string; position: 'before' | 'after' } | null;
  onSessionDragStart: (sessionId: string) => void;
  onSessionDragEnd: () => void;
  onSessionDragOver?: (event: React.DragEvent, sessionId: string) => void;
  onSessionDropIndicatorClear?: () => void;
}

const RIGHT_CLICK_MENU_FEEDBACK_MS = 200;

export const SessionItem: React.FC<SessionItemProps> = (props) => {
  const { t } = useI18n();
  const {
    session,
    activeSessionId,
    editingItem,
    activeMenu,
    loadingSessionIds,
    generatingTitleSessionIds,
    newlyTitledSessionIds,
    groups,
    editInputRef,
    menuRef,
    onSelectSession,
    onTogglePinSession,
    onDeleteSession,
    onDuplicateSession,
    onOpenExportModal,
    onMoveSessionToGroup,
    handleStartEdit,
    handleRenameConfirm,
    handleRenameKeyDown,
    setEditingItem,
    toggleMenu,
    setActiveMenu,
    draggingSessionId,
    draggingGroupId,
    dropIndicator,
    onSessionDragStart,
    onSessionDragEnd,
    onSessionDragOver,
    onSessionDropIndicatorClear,
    disableNativeDrag,
  } = props as typeof props & {
    disableNativeDrag?: boolean;
  };

  const [isRightClickAnimating, setIsRightClickAnimating] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const isActive = activeMenu === session.id;
  const displayTitle = session.title === 'New Chat' ? t('newChat') : session.title;
  const isBeingDragged = draggingSessionId === session.id;
  const completedOutcome = useChatStore((state) => state.completedSessions[session.id]);

  // A slight pointer move (< 10px) while pressing is a jittery click, not a
  // drag. Native HTML5 drag has a ~5px threshold, so a 6px wiggle triggers
  // dragstart/end but never fires click. Treat such a micro-drag as a click so
  // the session still activates, without disturbing real drag-to-group.
  const isMicroDrag = (e: React.DragEvent<HTMLAnchorElement>) => {
    const start = dragStartRef.current;
    if (!start) return false;
    return Math.hypot(e.clientX - start.x, e.clientY - start.y) < 10 && e.timeStamp - start.t < 500;
  };

  // During a double-click the second press-and-release is also a micro-drag
  // (same spot, < 500ms). Recognising it by timestamp lets the dblclick reach
  // the title (browser skips dblclick once a drag fires) and keeps the second
  // release from activating the session on top of the rename.
  const isDoubleClickDrag = (e: React.DragEvent<HTMLAnchorElement>) => {
    const start = dragStartRef.current;
    if (!start) return false;
    return e.timeStamp - start.t < 500 && start.x === e.clientX && start.y === e.clientY;
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsRightClickAnimating(true);
    setActiveMenu(session.id);
    setTimeout(() => setIsRightClickAnimating(false), RIGHT_CLICK_MENU_FEEDBACK_MS);
  };

  const handleDragStart = (e: React.DragEvent<HTMLAnchorElement>) => {
    dragStartRef.current = { x: e.clientX, y: e.clientY, t: e.timeStamp };
    e.dataTransfer.setData(SESSION_DRAG_TYPE, session.id);
    e.dataTransfer.setData('text/plain', session.id);
    e.dataTransfer.effectAllowed = 'move';
    onSessionDragStart(session.id);

    // Cherry-style overlay: subtle border + stronger shadow so ghost floats above recessed buckets.
    const ghost = document.createElement('div');
    ghost.className = `fixed top-0 left-0 ${Z_INDEX_TOPMOST_OVERLAY} pointer-events-none flex items-center gap-2 rounded-lg border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-primary)] px-3 py-2 text-sm font-medium text-[var(--theme-text-primary)] shadow-xl`;
    if (session.isPinned) {
      const pinIcon = document.createElement('span');
      pinIcon.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1z"/></svg>';
      ghost.appendChild(pinIcon);
    }
    const label = document.createElement('span');
    label.textContent = displayTitle;
    ghost.appendChild(label);
    document.body.appendChild(ghost);

    e.dataTransfer.setDragImage(ghost, 12, 12);

    // A drop landing outside the app never fires onDragEnd, so schedule the
    // removal here regardless.
    window.setTimeout(() => ghost.remove(), 0);
  };

  const handleDragEnd = (e: React.DragEvent<HTMLAnchorElement>) => {
    if (isDoubleClickDrag(e)) {
      // 双击的第二下被浏览器当成拖拽，点击已被吞掉 —— 此处不放行选中，
      // 让 dblclick 专心进入重命名。
      dragStartRef.current = null;
    } else if (isMicroDrag(e)) {
      dragStartRef.current = null;
      onSelectSession(session.id);
    }
    onSessionDragEnd();
  };

  const handleItemDrop = (e: React.DragEvent) => {
    onSessionDropIndicatorClear?.();
    if (!isSessionDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    const draggedId = e.dataTransfer.getData(SESSION_DRAG_TYPE) || e.dataTransfer.getData('text/plain');
    if (draggedId && draggedId !== session.id) {
      onMoveSessionToGroup(draggedId, session.groupId ?? null);
    }
  };

  const showBefore = dropIndicator?.id === session.id && dropIndicator.position === 'before';
  const showAfter = dropIndicator?.id === session.id && dropIndicator.position === 'after';
  const isBlockedByGroupDrag = !!draggingGroupId;

  return (
    <li
      onContextMenu={handleContextMenu}
      onDragOver={onSessionDragOver ? (event) => onSessionDragOver(event, session.id) : undefined}
      onDragLeave={onSessionDropIndicatorClear}
      onDrop={handleItemDrop}
      className={`group relative rounded-lg my-0.5 transition-all duration-150 ease-out ${
        session.id === activeSessionId || isRightClickAnimating ? 'bg-[var(--theme-bg-accent)]/10' : ''
      } ${newlyTitledSessionIds.has(session.id) ? 'title-update-animate' : ''} ${isActive ? 'z-20' : ''} ${isBlockedByGroupDrag ? 'opacity-50 pointer-events-none' : ''}`}
    >
      {showBefore && (
        <div className="absolute -top-[1px] left-1 right-1 h-0.5 rounded-full bg-[var(--theme-bg-accent)] shadow-[0_0_8px_var(--theme-bg-accent)] pointer-events-none z-10 animate-in fade-in duration-100 flex items-center">
          <div className="h-1.5 w-1.5 -ml-0.5 rounded-full bg-[var(--theme-bg-accent)] shadow-[0_0_6px_var(--theme-bg-accent)]" />
        </div>
      )}
      {showAfter && (
        <div className="absolute -bottom-[1px] left-1 right-1 h-0.5 rounded-full bg-[var(--theme-bg-accent)] shadow-[0_0_8px_var(--theme-bg-accent)] pointer-events-none z-10 animate-in fade-in duration-100 flex items-center">
          <div className="h-1.5 w-1.5 -ml-0.5 rounded-full bg-[var(--theme-bg-accent)] shadow-[0_0_6px_var(--theme-bg-accent)]" />
        </div>
      )}
      <div
        className={`relative w-full text-left pl-2.5 pr-1 py-2 text-sm transition-colors rounded-lg text-[var(--theme-text-primary)] ${
          session.id === activeSessionId ? 'font-medium' : 'hover:bg-[var(--theme-bg-tertiary)]'
        } ${isBeingDragged ? 'opacity-35 scale-[0.98] border border-dashed border-[var(--theme-border-focus)]/60 bg-[var(--theme-bg-tertiary)]/40 shadow-xs' : ''} ${isBlockedByGroupDrag ? 'opacity-40' : ''}`}
      >
        {editingItem?.type === 'session' && editingItem.id === session.id ? (
          <InlineRenameInput
            editInputRef={editInputRef}
            title={editingItem.title}
            onTitleChange={(e) => setEditingItem({ ...editingItem, title: e.target.value })}
            onBlur={handleRenameConfirm}
            onKeyDown={handleRenameKeyDown}
            className="flex-grow bg-transparent border border-[var(--theme-border-focus)] rounded-md px-1 py-0 text-sm w-full"
          />
        ) : (
          <a
            href={`/chat/${session.id}`}
            draggable={!disableNativeDrag}
            onDragStart={disableNativeDrag ? undefined : handleDragStart}
            onDragEnd={disableNativeDrag ? undefined : handleDragEnd}
            onClick={(e) => {
              if (e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
                e.preventDefault();
                if (e.detail > 1) {
                  // 双击的第二下：只进 onDoubleClick（重命名），不再重复选中。
                  return;
                }
                // 双击第一下会先触发一次 micro-drag，click 被吞掉；这里不能把它
                // 当成普通单击放行，否则双击后会话仍被选中一次。跳过它，让第二下
                // 的 dblclick 专心处理。
                if (isDoubleClickDrag(e as React.DragEvent<HTMLAnchorElement>)) {
                  return;
                }
                onSelectSession(session.id);
              }
            }}
            onDoubleClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleStartEdit(session);
            }}
            className="flex w-full min-w-0 items-center pr-8 no-underline text-inherit"
            aria-current={session.id === activeSessionId ? 'page' : undefined}
          >
            {session.isPinned && (
              <Pin size={12} className="mr-2 text-[var(--theme-text-link)] flex-shrink-0" strokeWidth={2} />
            )}
            <span className="font-medium truncate" title={displayTitle}>
              {generatingTitleSessionIds.has(session.id) ? (
                <div className="flex items-center gap-2 text-xs text-[var(--theme-text-secondary)]">
                  <LoadingDots />
                  <span>{t('generatingTitle')}</span>
                </div>
              ) : (
                displayTitle
              )}
            </span>
          </a>
        )}
        {loadingSessionIds.has(session.id) ? (
          <span className="absolute right-1 top-1/2 -translate-y-1/2">
            <LoadingDots />
          </span>
        ) : (
          <>
            {completedOutcome && (
              <span
                className={`absolute right-2 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full ${
                  completedOutcome === 'error' ? 'bg-[#ef4444]' : 'bg-[#22c55e]'
                }`}
                title={t(completedOutcome === 'error' ? 'sessionCompletedWithError' : 'sessionCompleted')}
                aria-label={t(completedOutcome === 'error' ? 'sessionCompletedWithError' : 'sessionCompleted')}
              />
            )}
            {!generatingTitleSessionIds.has(session.id) && (
              <button
                onClick={(e) => toggleMenu(e, session.id)}
                title={t('sessionMoreOptions')}
                aria-label={t('sessionMoreOptions')}
                className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full bg-[var(--theme-bg-secondary)] p-1 text-[var(--theme-text-primary)] opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus:opacity-100 focus:pointer-events-auto transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--theme-border-focus)]"
              >
                <MoreHorizontal size={16} strokeWidth={2.2} />
              </button>
            )}
          </>
        )}
      </div>
      {showAfter && (
        <div className="absolute -bottom-[1px] left-1 right-1 h-0.5 rounded-full bg-[var(--theme-bg-accent)] pointer-events-none z-10" />
      )}
      {activeMenu === session.id && (
        <SessionItemMenu
          session={session}
          menuRef={menuRef}
          groups={groups}
          onMoveSessionToGroup={onMoveSessionToGroup}
          onStartEdit={() => {
            handleStartEdit(session);
            setActiveMenu(null);
          }}
          onTogglePin={() => {
            onTogglePinSession(session.id);
            setActiveMenu(null);
          }}
          onDuplicate={() => {
            onDuplicateSession(session.id);
            setActiveMenu(null);
          }}
          onExport={() => {
            onOpenExportModal(session.id);
            setActiveMenu(null);
          }}
          onDelete={() => {
            onDeleteSession(session.id);
            setActiveMenu(null);
          }}
        />
      )}
    </li>
  );
};
