import React, { useEffect, useRef, useState, type RefObject } from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { Pin, PinOff, MoreHorizontal } from 'lucide-react';
import { type ChatGroup, type SavedChatSession } from '@/types';
import { SessionItemMenu } from './SessionItemMenu';
import { SessionItemContextMenu } from './SessionItemContextMenu';
import { DropdownMenu, DropdownMenuTrigger } from '@/components/shared/DropdownMenu';
import { ContextMenu, ContextMenuTrigger } from '@/components/shared/ContextMenu';
import { InlineRenameInput } from './InlineRenameInput';
import { LoadingDots } from '@/components/shared/LoadingDots';
import { useChatStore } from '@/stores/chatStore';
import { SESSION_DRAG_TYPE, isSessionDrag, resolveDropPosition } from './sidebarDragTypes';
import { Z_INDEX_TOPMOST_OVERLAY } from '@/constants/layout';
import { useSidebarItemContext, type SidebarItemContextValue } from './SidebarItemContext';
import { formatRelativeTime, formatDateTime } from '@/utils/relativeTime';
import { useTitleMarquee } from './useTitleMarquee';
import { HoverCard } from '@/components/shared/HoverCard';
import { extractSearchSnippet, SearchHighlight } from '@/utils/searchHighlight';

export interface SessionItemProps extends Partial<SidebarItemContextValue> {
  session: SavedChatSession;
}

const RIGHT_CLICK_MENU_FEEDBACK_MS = 200;
const EMPTY_SET = new Set<string>();
const EMPTY_GROUPS: ChatGroup[] = [];
const NOOP = () => {};
const FALLBACK_INPUT_REF: RefObject<HTMLInputElement> = { current: null };
const FALLBACK_MENU_REF: RefObject<HTMLDivElement> = { current: null };

export const SessionItem: React.FC<SessionItemProps> = (props) => {
  const { t } = useI18n();
  const context = useSidebarItemContext();

  const session = props.session;
  const activeSessionId =
    props.activeSessionId !== undefined ? props.activeSessionId : (context?.activeSessionId ?? null);
  const editingItem = props.editingItem !== undefined ? props.editingItem : (context?.editingItem ?? null);
  const activeMenu = props.activeMenu !== undefined ? props.activeMenu : (context?.activeMenu ?? null);
  const loadingSessionIds = props.loadingSessionIds ?? context?.loadingSessionIds ?? EMPTY_SET;
  const generatingTitleSessionIds = props.generatingTitleSessionIds ?? context?.generatingTitleSessionIds ?? EMPTY_SET;
  const newlyTitledSessionIds = props.newlyTitledSessionIds ?? context?.newlyTitledSessionIds ?? EMPTY_SET;
  const groups = props.groups ?? context?.groups ?? EMPTY_GROUPS;
  const editInputRef = props.editInputRef ?? context?.editInputRef ?? FALLBACK_INPUT_REF;
  const menuRef = props.menuRef ?? context?.menuRef ?? FALLBACK_MENU_REF;
  const onSelectSession = props.onSelectSession ?? context?.onSelectSession ?? NOOP;
  const onTogglePinSession = props.onTogglePinSession ?? context?.onTogglePinSession ?? NOOP;
  const onDeleteSession = props.onDeleteSession ?? context?.onDeleteSession ?? NOOP;
  const onDuplicateSession = props.onDuplicateSession ?? context?.onDuplicateSession ?? NOOP;
  const onOpenExportModal = props.onOpenExportModal ?? context?.onOpenExportModal ?? NOOP;
  const onMoveSessionToGroup = props.onMoveSessionToGroup ?? context?.onMoveSessionToGroup ?? NOOP;
  const onRegenerateTitleSession = props.onRegenerateTitleSession ?? context?.onRegenerateTitleSession;
  const handleStartEdit = props.handleStartEdit ?? context?.handleStartEdit ?? NOOP;
  const handleRenameConfirm = props.handleRenameConfirm ?? context?.handleRenameConfirm ?? NOOP;
  const handleRenameKeyDown = props.handleRenameKeyDown ?? context?.handleRenameKeyDown ?? NOOP;
  const setEditingItem = props.setEditingItem ?? context?.setEditingItem ?? NOOP;
  const setActiveMenu = props.setActiveMenu ?? context?.setActiveMenu ?? NOOP;
  const draggingSessionId =
    props.draggingSessionId !== undefined ? props.draggingSessionId : (context?.draggingSessionId ?? null);
  const draggingGroupId =
    props.draggingGroupId !== undefined ? props.draggingGroupId : (context?.draggingGroupId ?? null);
  const dropIndicator = props.dropIndicator !== undefined ? props.dropIndicator : (context?.dropIndicator ?? null);
  const onSessionDragStart = props.onSessionDragStart ?? context?.onSessionDragStart ?? NOOP;
  const onSessionDragEnd = props.onSessionDragEnd ?? context?.onSessionDragEnd ?? NOOP;
  const onSessionDragOver = props.onSessionDragOver ?? context?.onSessionDragOver;
  const onSessionDropIndicatorClear = props.onSessionDropIndicatorClear ?? context?.onSessionDropIndicatorClear;
  const onReorderSession = props.onReorderSession ?? context?.onReorderSession;
  const disableNativeDrag =
    props.disableNativeDrag !== undefined ? props.disableNativeDrag : (context?.disableNativeDrag ?? false);
  const searchQuery = props.searchQuery !== undefined ? props.searchQuery : (context?.searchQuery ?? '');
  const isSearchActive = Boolean(searchQuery && searchQuery.trim().length > 0);
  const searchSnippet = isSearchActive ? extractSearchSnippet(session.messages, searchQuery) : null;

  const [isRightClickAnimating, setIsRightClickAnimating] = useState(false);
  const [isContextMenuOpen, setIsContextMenuOpen] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const isSelected = session.id === activeSessionId;
  const isActive = activeMenu === session.id;
  const displayTitle = session.title === 'New Chat' ? t('newChat') : session.title;
  const isBeingDragged = draggingSessionId === session.id;
  const completedOutcome = useChatStore((state) => state.completedSessions[session.id]);
  const activeMessages = useChatStore((state) => state.activeMessages);
  const titleRef = useRef<HTMLSpanElement>(null);
  const marquee = useTitleMarquee(titleRef);

  const isBlank = React.useMemo(() => {
    if (session.blank !== undefined) {
      if (!session.blank) return false;
      if (session.id === activeSessionId && activeMessages && activeMessages.some((m) => !m.isInternalToolMessage)) {
        return false;
      }
      return true;
    }
    const isNewChatTitle = session.title === 'New Chat' || session.titleSource === 'default';
    if (!isNewChatTitle) return false;

    if (session.id === activeSessionId) {
      return !activeMessages || activeMessages.length === 0 || !activeMessages.some((m) => !m.isInternalToolMessage);
    }
    return !session.messages || session.messages.length === 0 || !session.messages.some((m) => !m.isInternalToolMessage);
  }, [session.blank, session.title, session.titleSource, session.id, activeSessionId, activeMessages, session.messages]);

  const dragLifecycleRef = useRef({ isBeingDragged, onSessionDragEnd });

  useEffect(() => {
    dragLifecycleRef.current = { isBeingDragged, onSessionDragEnd };
  }, [isBeingDragged, onSessionDragEnd]);

  // 兜底：承载“被拖动”样式的那一行如果在拖动途中被卸载（虚拟列表回收、筛选、删除……），
  // 浏览器就不会再派发 dragend，拖拽状态会永久卡住（表现为该行一直灰着直到刷新）。
  // 卸载即收尾，保证状态不可能活得比它所装饰的行更久。
  useEffect(
    () => () => {
      if (dragLifecycleRef.current.isBeingDragged) {
        dragLifecycleRef.current.onSessionDragEnd();
      }
    },
    [],
  );

  // A slight pointer move (< 10px) while pressing is a jittery click, not a
  // drag. Native HTML5 drag has a ~5px threshold, so a 6px wiggle triggers
  // dragstart/end but never fires click. Treat such a micro-drag as a click so
  // the session still activates, without disturbing real drag-to-group.
  const isMicroDrag = (event: React.DragEvent<HTMLAnchorElement>) => {
    const start = dragStartRef.current;
    if (!start) return false;
    return Math.hypot(event.clientX - start.x, event.clientY - start.y) < 10 && event.timeStamp - start.t < 500;
  };

  // During a double-click the second press-and-release is also a micro-drag
  // (same spot, < 500ms). Recognising it by timestamp lets the dblclick reach
  // the title (browser skips dblclick once a drag fires) and keeps the second
  // release from activating the session on top of the rename.
  const isDoubleClickDrag = (event: React.MouseEvent<HTMLAnchorElement> | React.DragEvent<HTMLAnchorElement>) => {
    const start = dragStartRef.current;
    if (!start) return false;
    return event.timeStamp - start.t < 500 && start.x === event.clientX && start.y === event.clientY;
  };

  const handleContextMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    setIsRightClickAnimating(true);
    setTimeout(() => setIsRightClickAnimating(false), RIGHT_CLICK_MENU_FEEDBACK_MS);
  };

  const handleDragStart = (event: React.DragEvent<HTMLAnchorElement>) => {
    dragStartRef.current = { x: event.clientX, y: event.clientY, t: event.timeStamp };
    event.dataTransfer.setData(SESSION_DRAG_TYPE, session.id);
    event.dataTransfer.setData('text/plain', session.id);
    event.dataTransfer.effectAllowed = 'move';
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

    event.dataTransfer.setDragImage(ghost, 12, 12);

    // A drop landing outside the app never fires onDragEnd, so schedule the
    // removal here regardless.
    window.setTimeout(() => ghost.remove(), 0);
  };

  const handleDragEnd = (event: React.DragEvent<HTMLAnchorElement>) => {
    if (isDoubleClickDrag(event)) {
      // 双击的第二下被浏览器当成拖拽，点击已被吞掉 —— 此处不放行选中，
      // 让 dblclick 专心进入重命名。
      dragStartRef.current = null;
    } else if (isMicroDrag(event)) {
      dragStartRef.current = null;
      onSelectSession(session.id);
    }
    onSessionDragEnd();
  };

  const handleItemDrop = (event: React.DragEvent) => {
    onSessionDropIndicatorClear?.();
    if (!isSessionDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    // drop 就是这次拖拽的终点。浏览器不保证随后一定派发 dragend（源节点已被卸载时就不会），
    // 所以在这里主动收尾，别把“被拖动”的变暗样式留给下一次刷新去清。
    onSessionDragEnd();
    const draggedId = event.dataTransfer.getData(SESSION_DRAG_TYPE) || event.dataTransfer.getData('text/plain');
    if (!draggedId || draggedId === session.id) return;
    onReorderSession?.(draggedId, session.id, resolveDropPosition(event));
  };

  const showBefore = dropIndicator?.id === session.id && dropIndicator.position === 'before';
  const showAfter = dropIndicator?.id === session.id && dropIndicator.position === 'after';
  const showPinHint = !!dropIndicator?.willPin && dropIndicator.id === session.id;
  const isBlockedByGroupDrag = !!draggingGroupId;
  const isEditing = editingItem?.type === 'session' && editingItem.id === session.id;
  const groupName = session.groupId
    ? groups.find((g) => g.id === session.groupId)?.title || t('historyMoveToUngrouped')
    : t('historyMoveToUngrouped');

  const hoverCardContent = (
    <div className="flex flex-col gap-2 min-w-[220px] max-w-[290px]">
      <div className="font-semibold text-sm leading-snug break-words text-[var(--theme-text-primary)]">
        {displayTitle}
      </div>
      <div className="flex items-center justify-between text-xs text-[var(--theme-text-secondary)] border-t border-[var(--theme-border-secondary)]/70 pt-2 mt-0.5">
        <span className="truncate max-w-[130px]">{groupName}</span>
        <span className="shrink-0">{formatDateTime(session.timestamp)}</span>
      </div>
      <div className="text-[11px] text-[var(--theme-text-link)] opacity-90 pt-0.5 text-right font-medium">
        {t('historyCopyTitleAction')}
      </div>
    </div>
  );

  return (
    <ContextMenu
      onOpenChange={(open) => {
        if (isBlank) return;
        setIsContextMenuOpen(open);
        if (open) {
          setIsRightClickAnimating(true);
          setTimeout(() => setIsRightClickAnimating(false), RIGHT_CLICK_MENU_FEEDBACK_MS);
          if (activeMenu === session.id) {
            setActiveMenu(null);
          }
        }
      }}
    >
      <ContextMenuTrigger asChild disabled={isBlank}>
        <li
          data-row-key={`session:${session.id}`}
          onContextMenu={isBlank ? (event) => event.preventDefault() : handleContextMenu}
          onDragOver={
            disableNativeDrag
              ? undefined
              : onSessionDragOver
                ? (event) => onSessionDragOver(event, session.id)
                : undefined
          }
          onDragLeave={disableNativeDrag ? undefined : onSessionDropIndicatorClear}
          onDrop={disableNativeDrag ? undefined : handleItemDrop}
          role="treeitem"
          aria-selected={isSelected}
          data-selected={isSelected ? 'true' : undefined}
          className={`group relative rounded-lg my-0.5 transition-colors duration-150 ease-out border border-transparent ${
            isSelected || isRightClickAnimating || isContextMenuOpen
              ? 'bg-[var(--theme-bg-tertiary)]'
              : 'hover:bg-[var(--theme-bg-tertiary)]'
          } ${newlyTitledSessionIds.has(session.id) ? 'title-update-animate' : ''} ${isSelected || isActive || isContextMenuOpen ? 'z-20' : ''} ${isBlockedByGroupDrag ? 'opacity-50 pointer-events-none' : ''}`}
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
          {showPinHint && (showBefore || showAfter) && (
            <div className="pointer-events-none absolute right-1 top-0 z-10 flex items-center gap-1 rounded-md bg-[var(--theme-bg-accent)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--theme-bg-primary)] shadow-sm">
              <Pin size={10} strokeWidth={2.4} />
              <span>{t('historyDropToPin')}</span>
            </div>
          )}
          <div
            className={`relative w-full text-left pl-2.5 pr-1 py-2 text-sm transition-colors rounded-lg text-[var(--theme-text-primary)] ${
              isBeingDragged ? 'opacity-35 scale-[0.98] border border-dashed border-[var(--theme-border-focus)]/60 bg-[var(--theme-bg-tertiary)]/40 shadow-xs' : ''
            } ${isBlockedByGroupDrag ? 'opacity-40' : ''}`}
          >
            {editingItem?.type === 'session' && editingItem.id === session.id ? (
              <InlineRenameInput
                editInputRef={editInputRef}
                title={editingItem.title}
                onTitleChange={(event) => setEditingItem({ ...editingItem, title: event.target.value })}
                onBlur={handleRenameConfirm}
                onKeyDown={handleRenameKeyDown}
                className="flex-grow bg-transparent border border-[var(--theme-border-focus)] rounded-md px-1 py-0 text-sm w-full"
              />
            ) : (
              <HoverCard
                anchor={
                  <a
                    href={`/chat/${session.id}`}
                    draggable={!disableNativeDrag}
                    onDragStart={disableNativeDrag ? undefined : handleDragStart}
                    onDragEnd={disableNativeDrag ? undefined : handleDragEnd}
                    onPointerEnter={marquee.onPointerEnter}
                    onPointerLeave={marquee.onPointerLeave}
                    onClick={(event) => {
                      if (event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
                        event.preventDefault();
                        if (event.detail > 1) {
                          // 双击的第二下：只进 onDoubleClick（重命名），不再重复选中。
                          return;
                        }
                        // 双击第一下会先触发一次 micro-drag，click 被吞掉；这里不能把它
                        // 当成普通单击放行，否则双击后会话仍被选中一次。跳过它，让第二下
                        // 的 dblclick 专心处理。
                        if (isDoubleClickDrag(event)) {
                          return;
                        }
                        onSelectSession(session.id);
                      }
                    }}
                    onDoubleClick={(event) => {
                      if (isBlank) return;
                      event.preventDefault();
                      event.stopPropagation();
                      handleStartEdit(session);
                    }}
                    className={`flex w-full min-w-0 items-center ${isBlank ? 'pr-2' : 'pr-14'} no-underline text-inherit`}
                    aria-current={session.id === activeSessionId ? 'page' : undefined}
                  >
                    {session.isPinned && (
                      <Pin size={12} className="mr-2 text-[var(--theme-text-link)] flex-shrink-0" strokeWidth={2} />
                    )}
                    <div className="flex flex-col min-w-0 flex-grow py-0.5">
                      <div className="flex items-center min-w-0">
                        <span
                          ref={titleRef}
                          className="truncate marquee-title font-medium text-[var(--theme-text-primary)]"
                        >
                          {generatingTitleSessionIds.has(session.id) ? (
                            <div className="flex items-center gap-2 text-xs text-[var(--theme-text-secondary)]">
                              <LoadingDots />
                              <span>{t('generatingTitle')}</span>
                            </div>
                          ) : isSearchActive ? (
                            <SearchHighlight text={displayTitle} query={searchQuery} />
                          ) : (
                            displayTitle
                          )}
                        </span>
                      </div>
                      {searchSnippet && (
                        <div className="flex items-center gap-1 text-[11px] text-[var(--theme-text-secondary)] truncate mt-0.5 select-none">
                          {session.groupId && (
                            <>
                              <span className="truncate max-w-[80px] font-medium shrink-0">{groupName}</span>
                              <span className="shrink-0 opacity-50">·</span>
                            </>
                          )}
                          <span className="truncate">
                            <SearchHighlight text={searchSnippet} query={searchQuery} />
                          </span>
                        </div>
                      )}
                    </div>
                  </a>
                }
                content={hoverCardContent}
                openDelayMs={800}
                disabled={isBlank || isActive || isContextMenuOpen || isBeingDragged || isEditing || isBlockedByGroupDrag}
                copyText={displayTitle}
                copyLabel={t('historyCopyTitleAction')}
                copiedLabel={t('historyTitleCopied')}
              />
            )}
            {loadingSessionIds.has(session.id) ? (
              <span className="absolute right-1 top-1/2 -translate-y-1/2">
                <LoadingDots />
              </span>
            ) : (
              <>
                {!isBlank && !generatingTitleSessionIds.has(session.id) && (
                  <div
                    data-testid="session-relative-time"
                    className={`absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5 transition-opacity duration-150 select-none pointer-events-none ${
                      isActive || isContextMenuOpen
                        ? 'opacity-0'
                        : 'opacity-100 group-hover:opacity-0 group-focus-within:opacity-0'
                    }`}
                  >
                    {completedOutcome && (
                      <span
                        className={`h-2 w-2 rounded-full ${
                          completedOutcome === 'error' ? 'bg-[#ef4444]' : 'bg-[#22c55e]'
                        }`}
                        title={t(completedOutcome === 'error' ? 'sessionCompletedWithError' : 'sessionCompleted')}
                        aria-label={t(completedOutcome === 'error' ? 'sessionCompletedWithError' : 'sessionCompleted')}
                      />
                    )}
                    <span className="text-[10px] text-[var(--theme-text-secondary)]">
                      {formatRelativeTime(session.timestamp, t)}
                    </span>
                  </div>
                )}
                {!isBlank && !generatingTitleSessionIds.has(session.id) && (
                  <div
                    className={`absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 transition-opacity duration-150 ${
                      isActive || isContextMenuOpen
                        ? 'opacity-100 pointer-events-auto'
                        : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto'
                    }`}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <button
                      type="button"
                      title={session.isPinned ? t('historyUnpin') : t('historyPin')}
                      aria-label={session.isPinned ? t('historyUnpin') : t('historyPin')}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onTogglePinSession(session.id);
                      }}
                      className="rounded-full p-1 text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] bg-[var(--theme-bg-secondary)] hover:bg-[var(--theme-bg-tertiary)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--theme-border-focus)] cursor-pointer"
                    >
                      {session.isPinned ? (
                        <PinOff size={14} strokeWidth={2.2} />
                      ) : (
                        <Pin size={14} strokeWidth={2.2} />
                      )}
                    </button>
                    <DropdownMenu
                      open={activeMenu === session.id}
                      onOpenChange={(open) => setActiveMenu(open ? session.id : null)}
                    >
                      <DropdownMenuTrigger asChild>
                        <button
                          title={t('sessionMoreOptions')}
                          aria-label={t('sessionMoreOptions')}
                          className="rounded-full p-1 text-[var(--theme-text-primary)] bg-[var(--theme-bg-secondary)] hover:bg-[var(--theme-bg-tertiary)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--theme-border-focus)] cursor-pointer"
                        >
                          <MoreHorizontal size={16} strokeWidth={2.2} />
                        </button>
                      </DropdownMenuTrigger>
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
                        onRegenerateTitle={
                          onRegenerateTitleSession
                            ? () => {
                                onRegenerateTitleSession(session.id);
                                setActiveMenu(null);
                              }
                            : undefined
                        }
                        isGeneratingTitle={generatingTitleSessionIds.has(session.id)}
                      />
                    </DropdownMenu>
                  </div>
                )}
              </>
            )}
          </div>
          {showAfter && (
            <div className="absolute -bottom-[1px] left-1 right-1 h-0.5 rounded-full bg-[var(--theme-bg-accent)] pointer-events-none z-10" />
          )}
        </li>
      </ContextMenuTrigger>
      <SessionItemContextMenu
        session={session}
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
        onRegenerateTitle={
          onRegenerateTitleSession
            ? () => {
                onRegenerateTitleSession(session.id);
                setActiveMenu(null);
              }
            : undefined
        }
        isGeneratingTitle={generatingTitleSessionIds.has(session.id)}
      />
    </ContextMenu>
  );
};
