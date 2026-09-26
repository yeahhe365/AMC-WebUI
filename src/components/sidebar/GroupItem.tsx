import React, { useEffect, useRef, useState, type RefObject } from 'react';
import { ChevronDown, ChevronUp, GripVertical, MoreHorizontal } from 'lucide-react';
import { type ChatGroup, type SavedChatSession } from '@/types';
import { GroupItemMenu } from './GroupItemMenu';
import { DropdownMenu, DropdownMenuTrigger } from '@/components/shared/DropdownMenu';
import { InlineRenameInput } from './InlineRenameInput';
import { LimitedSessionList } from './LimitedSessionList';
import { GROUP_DRAG_TYPE, isGroupDrag, isSessionDrag } from './sidebarDragTypes';
import { useI18n } from '@/contexts/I18nContext';
import { interpolate } from '@/i18n/interpolate';
import type { SessionItemPassedProps } from './sidebarTypes';

import { useSidebarItemContext } from './SidebarItemContext';

// Auto-expand delay: hold over a collapsed group this long to pop it open.
const DRAG_HOVER_EXPAND_MS = 600;
const FALLBACK_INPUT_REF: RefObject<HTMLInputElement> = { current: null };
const FALLBACK_MENU_REF: RefObject<HTMLDivElement> = { current: null };

export const COLLAPSED_GROUP_SESSION_LIMIT = 5;

const isProvisionalBlank = (s: SavedChatSession): boolean => {
  return (
    s.blank === true ||
    ((!s.messages || s.messages.length === 0) &&
      (!s.title || s.title === 'New Chat' || s.title === '新会话' || s.titleSource === 'default'))
  );
};

export interface GroupItemProps {
  group: ChatGroup;
  sessions: SavedChatSession[];
  dragOverId: string | null;
  groupDropIndicator?: { id: string; position: 'before' | 'after' } | null;
  sessionDropIndicator?: { id: string; position: 'before' | 'after'; willPin?: boolean } | null;
  isDragging?: boolean;
  dndListeners?: Record<string, unknown>;
  isSortableDragging?: boolean;
  onSessionDragOver?: (event: React.DragEvent, sessionId: string) => void;
  onSessionDropIndicatorClear?: () => void;
  onToggleGroupExpansion: (groupId: string) => void;
  handleGroupStartEdit: (item: ChatGroup) => void;
  handleDrop: (event: React.DragEvent, groupId: string | null) => void;
  handleDragOver: (event: React.DragEvent) => void;
  handleGroupDragOver?: (event: React.DragEvent, groupId: string) => void;
  onDeleteGroup: (groupId: string) => void;
  onClearGroup?: (groupId: string) => void;
  onNewChatInGroup: (groupId: string) => void;
  onReorderGroups?: (activeId: string, overId: string) => void;
  draggingGroupId?: string | null;
  onGroupDragStart?: (groupId: string) => void;
  onGroupDragEnd?: () => void;
  // Optional overrides from Context or tests
  editingItem?: { type: 'session' | 'group'; id: string; title: string } | null;
  editInputRef?: RefObject<HTMLInputElement>;
  menuRef?: RefObject<HTMLDivElement>;
  activeMenu?: string | null;
  setActiveMenu?: (id: string | null) => void;
  setEditingItem?: (item: { type: 'session' | 'group'; id: string; title: string } | null) => void;
  setDragOverId?: (id: string | null) => void;
  toggleMenu?: (event: React.MouseEvent, id: string) => void;
  handleRenameConfirm?: () => void;
  handleRenameKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  draggingSessionId?: string | null;
  sessionItemProps?: SessionItemPassedProps;
}

export const GroupItem: React.FC<GroupItemProps> = (props) => {
  const { t } = useI18n();
  const context = useSidebarItemContext();
  const {
    group,
    sessions,
    editingItem = context?.editingItem ?? null,
    dragOverId,
    groupDropIndicator,
    isDragging,
    onToggleGroupExpansion,
    handleGroupStartEdit,
    handleDrop,
    handleDragOver,
    handleGroupDragOver,
    setDragOverId = context?.setDragOverId ?? (() => {}),
    setEditingItem = context?.setEditingItem ?? (() => {}),
    onDeleteGroup,
    onClearGroup,
    onNewChatInGroup,
    onReorderGroups,
    draggingGroupId = context?.draggingGroupId ?? null,
    onGroupDragStart,
    onGroupDragEnd,
    editInputRef = props.editInputRef ?? context?.editInputRef ?? FALLBACK_INPUT_REF,
    handleRenameConfirm = context?.handleRenameConfirm ?? (() => {}),
    handleRenameKeyDown = context?.handleRenameKeyDown ?? (() => {}),
    toggleMenu = context?.toggleMenu ?? (() => {}),
    activeMenu = context?.activeMenu ?? null,
    menuRef = props.menuRef ?? context?.menuRef ?? FALLBACK_MENU_REF,
    setActiveMenu = context?.setActiveMenu ?? (() => {}),
  } = props;

  const [sessionLimit, setSessionLimit] = useState<number>(COLLAPSED_GROUP_SESSION_LIMIT);

  // When group collapses (isExpanded transitions from true to false), reset temporary expansion
  const prevExpandedRef = useRef(group.isExpanded);
  useEffect(() => {
    if (prevExpandedRef.current && !group.isExpanded) {
      setSessionLimit(COLLAPSED_GROUP_SESSION_LIMIT);
    }
    prevExpandedRef.current = group.isExpanded;
  }, [group.isExpanded]);

  const activeSessionId = props.sessionItemProps?.activeSessionId ?? context?.activeSessionId ?? null;
  const loadingSessionIds = props.sessionItemProps?.loadingSessionIds ?? context?.loadingSessionIds;

  const isQuotaExempt = (s: SavedChatSession) => {
    if (isProvisionalBlank(s)) return true;
    if (loadingSessionIds?.has(s.id)) return true;
    return false;
  };

  let idleCount = 0;
  const visibleSessions = (sessions ?? []).filter((session) => {
    if (isQuotaExempt(session)) return true;
    if (idleCount >= sessionLimit) return false;
    idleCount += 1;
    return true;
  });

  const hiddenCount = (sessions ?? []).length - visibleSessions.length;

  useEffect(() => {
    if (activeSessionId && sessions?.some((s) => s.id === activeSessionId)) {
      if (!visibleSessions.some((s) => s.id === activeSessionId)) {
        setSessionLimit(Infinity);
      }
    }
  }, [activeSessionId, sessions, visibleSessions]);

  // Auto-expand: while a session is hovered over this group, start a timer that
  // expands a collapsed group after a short delay. Cancelled when the drag
  // leaves or the group is already expanded.
  const expandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (expandTimerRef.current) clearTimeout(expandTimerRef.current);
    },
    [],
  );

  const startAutoExpand = (event: React.DragEvent) => {
    if (!isSessionDrag(event)) return;
    if (!group.isExpanded) {
      if (expandTimerRef.current) clearTimeout(expandTimerRef.current);
      expandTimerRef.current = setTimeout(() => onToggleGroupExpansion(group.id), DRAG_HOVER_EXPAND_MS);
    }
  };

  const cancelAutoExpand = () => {
    if (expandTimerRef.current) {
      clearTimeout(expandTimerRef.current);
      expandTimerRef.current = null;
    }
  };

  const isMenuOpenInGroup = activeMenu === group.id || sessions?.some((session) => session.id === activeMenu);
  const isDraggingThisGroup = draggingGroupId === group.id || !!props.isSortableDragging;
  const showGroupBefore = groupDropIndicator?.id === group.id && groupDropIndicator.position === 'before';
  const showGroupAfter = groupDropIndicator?.id === group.id && groupDropIndicator.position === 'after';
  const dndListeners = props.dndListeners;

  const handleGroupDragStartInternal = (event: React.DragEvent) => {
    event.dataTransfer.setData(GROUP_DRAG_TYPE, group.id);
    event.dataTransfer.effectAllowed = 'move';
    onGroupDragStart?.(group.id);
    event.stopPropagation();
  };

  const handleGroupDragOverInternal = (event: React.DragEvent) => {
    if (isGroupDrag(event) && onReorderGroups) {
      if (handleGroupDragOver) {
        handleGroupDragOver(event, group.id);
      } else {
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = 'move';
        setDragOverId(`group-${group.id}`);
      }
      return;
    }
    if (!isSessionDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    handleDragOver(event);
  };

  const handleGroupDropInternal = (event: React.DragEvent) => {
    cancelAutoExpand();
    if (isGroupDrag(event) && onReorderGroups) {
      event.preventDefault();
      event.stopPropagation();
      const activeId = event.dataTransfer.getData(GROUP_DRAG_TYPE);
      if (activeId && activeId !== group.id) onReorderGroups(activeId, group.id);
      setDragOverId(null);
      onGroupDragEnd?.();
      return;
    }
    handleDrop(event, group.id);
  };

  const handleGroupDragEnterInternal = (event: React.DragEvent) => {
    if (isGroupDrag(event)) {
      if (handleGroupDragOver) handleGroupDragOver(event, group.id);
      else {
        event.preventDefault();
        event.stopPropagation();
        setDragOverId(`group-${group.id}`);
      }
      return;
    }
    if (!isSessionDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    startAutoExpand(event);
    setDragOverId(group.id);
  };

  const isSortableGroup = !!dndListeners;
  return (
    <div
      draggable={!isSortableGroup && !!onReorderGroups}
      onDragStart={!isSortableGroup ? handleGroupDragStartInternal : undefined}
      onDragEnd={() => {
        cancelAutoExpand();
        onGroupDragEnd?.();
        setDragOverId(null);
      }}
      onDragOver={handleGroupDragOverInternal}
      onDrop={handleGroupDropInternal}
      onDragEnter={handleGroupDragEnterInternal}
      onDragLeave={(event) => {
        cancelAutoExpand();
        if (event.currentTarget.contains(event.relatedTarget as Node)) return;
        setDragOverId(null);
      }}
      className={`relative rounded-xl transition-all duration-200 ease-out mb-1 ${
        dragOverId === group.id
          ? 'scale-[1.015] bg-[var(--theme-bg-accent)]/15 ring-2 ring-[var(--theme-bg-accent)]/70 shadow-md'
          : 'hover:bg-[var(--theme-bg-secondary)]/30'
      } ${dragOverId === `group-${group.id}` ? 'ring-2 ring-[var(--theme-bg-accent)] ring-offset-1' : ''} ${
        isMenuOpenInGroup ? 'z-20' : 'z-0'
      } ${isDraggingThisGroup ? 'opacity-30 scale-[0.97]' : ''}`}
    >
      {showGroupBefore && (
        <div className="absolute -top-1 left-2 right-2 h-0.5 rounded-full bg-[var(--theme-bg-accent)] shadow-[0_0_8px_var(--theme-bg-accent)] pointer-events-none z-10 animate-in fade-in duration-100 flex items-center">
          <div className="h-1.5 w-1.5 -ml-0.5 rounded-full bg-[var(--theme-bg-accent)] shadow-[0_0_6px_var(--theme-bg-accent)]" />
        </div>
      )}
      {showGroupAfter && (
        <div className="absolute -bottom-1 left-2 right-2 h-0.5 rounded-full bg-[var(--theme-bg-accent)] shadow-[0_0_8px_var(--theme-bg-accent)] pointer-events-none z-10 animate-in fade-in duration-100 flex items-center">
          <div className="h-1.5 w-1.5 -ml-0.5 rounded-full bg-[var(--theme-bg-accent)] shadow-[0_0_6px_var(--theme-bg-accent)]" />
        </div>
      )}
      <details
        open={group.isExpanded ?? true}
        className="group/details"
        onToggle={(e) => {
          if (!e.currentTarget.open) {
            setSessionLimit(COLLAPSED_GROUP_SESSION_LIMIT);
          }
        }}
      >
        <summary
          className={`list-none flex items-center justify-between px-2 py-2 rounded-lg cursor-pointer transition-colors duration-150 ${
            dragOverId === group.id
              ? 'bg-[var(--theme-bg-accent)]/10 text-[var(--theme-text-link)]'
              : 'hover:bg-[var(--theme-bg-tertiary)]'
          } group`}
          onClick={(event) => {
            if (event.detail > 1) {
              // 双击由 onDoubleClick 处理，跳过展开切换
              return;
            }
            event.preventDefault();
            onToggleGroupExpansion(group.id);
          }}
          onDoubleClick={(event) => {
            event.preventDefault();
            handleGroupStartEdit(group);
          }}
        >
          <div className="flex items-center gap-2 min-w-0">
            {onReorderGroups && (
              <span
                {...(dndListeners as React.HTMLAttributes<HTMLSpanElement>)}
                className="cursor-grab active:cursor-grabbing p-0.5 -ml-0.5 text-[var(--theme-text-tertiary)] opacity-0 group-hover:opacity-60 hover:opacity-100 transition-opacity shrink-0 touch-none"
                title={t('historyGroupReorderHint')}
                aria-hidden="true"
              >
                <GripVertical size={12} />
              </span>
            )}
            <ChevronDown
              size={16}
              className={`text-[var(--theme-text-primary)] transition-transform duration-200 flex-shrink-0 ${
                dragOverId === group.id ? 'text-[var(--theme-text-link)] scale-110' : 'group-open/details:rotate-180'
              }`}
              strokeWidth={2.2}
            />
            {editingItem?.type === 'group' && editingItem.id === group.id ? (
              <InlineRenameInput
                editInputRef={editInputRef}
                title={editingItem.title}
                onTitleChange={(event) => setEditingItem({ ...editingItem, title: event.target.value })}
                onBlur={handleRenameConfirm}
                onKeyDown={handleRenameKeyDown}
                onClick={(event) => event.stopPropagation()}
                className="bg-transparent border border-[var(--theme-border-focus)] rounded-md px-1 py-0 text-sm w-full font-semibold"
              />
            ) : (
              <>
                <span className="font-semibold text-sm truncate text-[var(--theme-text-primary)]">{group.title}</span>
                {sessions.length > 0 && dragOverId !== group.id && (
                  <span className="text-xs text-[var(--theme-text-tertiary)] tabular-nums shrink-0">
                    {interpolate(t('historyGroupCount'), { count: sessions.length })}
                  </span>
                )}
                {dragOverId === group.id && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-[var(--theme-bg-accent)]/20 px-1.5 py-0.5 text-[11px] font-semibold text-[var(--theme-text-link)] animate-in fade-in zoom-in-95 duration-150 shrink-0">
                    <span>+</span>
                    <span>{t('historyMoveToGroup')}</span>
                  </span>
                )}
              </>
            )}
          </div>
          <DropdownMenu open={activeMenu === group.id} onOpenChange={(open) => setActiveMenu(open ? group.id : null)}>
            <DropdownMenuTrigger asChild>
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  toggleMenu(event, group.id);
                }}
                className="p-1 rounded-full text-[var(--theme-text-primary)] opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus:opacity-100 focus:pointer-events-auto transition-opacity"
              >
                <MoreHorizontal size={16} strokeWidth={2.2} />
              </button>
            </DropdownMenuTrigger>
            {activeMenu === group.id && (
              <GroupItemMenu
                menuRef={menuRef}
                onNewChat={() => {
                  onNewChatInGroup(group.id);
                  setActiveMenu(null);
                }}
                onStartEdit={() => {
                  handleGroupStartEdit(group);
                  setActiveMenu(null);
                }}
                onClear={
                  onClearGroup
                    ? () => {
                        onClearGroup(group.id);
                        setActiveMenu(null);
                      }
                    : undefined
                }
                hasSessions={sessions.length > 0}
                onDelete={() => {
                  onDeleteGroup(group.id);
                  setActiveMenu(null);
                }}
              />
            )}
          </DropdownMenu>
        </summary>
        <LimitedSessionList
          sessions={visibleSessions}
          sessionItemProps={props.sessionItemProps}
          className="pl-1 pb-1"
          isDragging={!!isDragging || !!props.draggingSessionId || !!context?.draggingSessionId || !!draggingGroupId}
        />
        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setSessionLimit((prev) =>
                hiddenCount <= COLLAPSED_GROUP_SESSION_LIMIT ? Infinity : prev + COLLAPSED_GROUP_SESSION_LIMIT,
              );
            }}
            className="w-full flex items-center justify-center gap-1.5 py-1 text-xs text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] rounded-md transition-colors my-0.5 cursor-pointer select-none"
            aria-label={interpolate(t('historyExpandRemainingSessions'), { count: hiddenCount })}
          >
            <span>{interpolate(t('historyExpandRemainingSessions'), { count: hiddenCount })}</span>
            <ChevronDown size={12} strokeWidth={2.2} />
          </button>
        )}
        {sessionLimit > COLLAPSED_GROUP_SESSION_LIMIT && (sessions?.length ?? 0) > COLLAPSED_GROUP_SESSION_LIMIT && hiddenCount === 0 && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setSessionLimit(COLLAPSED_GROUP_SESSION_LIMIT);
            }}
            className="w-full flex items-center justify-center gap-1.5 py-1 text-xs text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] rounded-md transition-colors my-0.5 cursor-pointer select-none"
            aria-label={t('historyCollapseRemainingSessions')}
          >
            <span>{t('historyCollapseRemainingSessions')}</span>
            <ChevronUp size={12} strokeWidth={2.2} />
          </button>
        )}
      </details>
    </div>
  );
};
