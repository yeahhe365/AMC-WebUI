import React, { useEffect, useRef } from 'react';
import { ChevronDown, GripVertical, MoreHorizontal } from 'lucide-react';
import { type ChatGroup, type SavedChatSession } from '@/types';
import { GroupItemMenu } from './GroupItemMenu';
import { InlineRenameInput } from './InlineRenameInput';
import { LimitedSessionList } from './LimitedSessionList';
import { GROUP_DRAG_TYPE, isGroupDrag, isSessionDrag } from './sidebarDragTypes';
import { useI18n } from '@/contexts/I18nContext';
import { interpolate } from '@/i18n/interpolate';
import type { SessionItemPassedProps } from './sidebarTypes';

// Auto-expand delay: hold over a collapsed group this long to pop it open.
const DRAG_HOVER_EXPAND_MS = 600;

interface GroupItemProps extends SessionItemPassedProps {
  group: ChatGroup;
  sessions: SavedChatSession[];
  editingItem: { type: 'session' | 'group'; id: string; title: string } | null;
  dragOverId: string | null;
  groupDropIndicator?: { id: string; position: 'before' | 'after' } | null;
  sessionDropIndicator?: { id: string; position: 'before' | 'after' } | null;
  isDragging?: boolean;
  dndListeners?: Record<string, unknown>;
  isSortableDragging?: boolean;
  onSessionDragOver?: (event: React.DragEvent, sessionId: string) => void;
  onSessionDropIndicatorClear?: () => void;
  onToggleGroupExpansion: (groupId: string) => void;
  handleGroupStartEdit: (item: ChatGroup) => void;
  handleDrop: (e: React.DragEvent, groupId: string | null) => void;
  handleDragOver: (e: React.DragEvent) => void;
  handleGroupDragOver?: (event: React.DragEvent, groupId: string) => void;
  setDragOverId: (id: string | null) => void;
  setEditingItem: (item: { type: 'session' | 'group'; id: string; title: string } | null) => void;
  onDeleteGroup: (groupId: string) => void;
  onClearGroup?: (groupId: string) => void;
  onNewChatInGroup: (groupId: string) => void;
  onReorderGroups?: (activeId: string, overId: string) => void;
  draggingGroupId?: string | null;
  onGroupDragStart?: (groupId: string) => void;
  onGroupDragEnd?: () => void;
}

export const GroupItem: React.FC<GroupItemProps> = (props) => {
  const { t } = useI18n();
  const {
    group,
    sessions,
    editingItem,
    dragOverId,
    groupDropIndicator,
    isDragging,
    onToggleGroupExpansion,
    handleGroupStartEdit,
    handleDrop,
    handleDragOver,
    handleGroupDragOver,
    setDragOverId,
    setEditingItem,
    onDeleteGroup,
    onClearGroup,
    onNewChatInGroup,
    onReorderGroups,
    draggingGroupId,
    onGroupDragStart,
    onGroupDragEnd,
    editInputRef,
    handleRenameConfirm,
    handleRenameKeyDown,
    toggleMenu,
    activeMenu,
    menuRef,
    setActiveMenu,
    ...sessionItemProps
  } = props;

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
    if (group.isExpanded === false) {
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

  const childSessionItemProps: SessionItemPassedProps = {
    activeSessionId: sessionItemProps.activeSessionId,
    editingItem,
    activeMenu,
    loadingSessionIds: sessionItemProps.loadingSessionIds,
    generatingTitleSessionIds: sessionItemProps.generatingTitleSessionIds,
    newlyTitledSessionIds: sessionItemProps.newlyTitledSessionIds,
    editInputRef,
    menuRef,
    onSelectSession: sessionItemProps.onSelectSession,
    onTogglePinSession: sessionItemProps.onTogglePinSession,
    onDeleteSession: sessionItemProps.onDeleteSession,
    onDuplicateSession: sessionItemProps.onDuplicateSession,
    onOpenExportModal: sessionItemProps.onOpenExportModal,
    onMoveSessionToGroup: sessionItemProps.onMoveSessionToGroup,
    groups: sessionItemProps.groups,
    handleStartEdit: sessionItemProps.handleStartEdit,
    handleRenameConfirm,
    handleRenameKeyDown,
    setEditingItem,
    toggleMenu,
    setActiveMenu,
    setDragOverId,
    draggingSessionId: sessionItemProps.draggingSessionId,
    draggingGroupId,
    dropIndicator: props.sessionDropIndicator ?? sessionItemProps.dropIndicator,
    onSessionDragStart: sessionItemProps.onSessionDragStart,
    onSessionDragEnd: sessionItemProps.onSessionDragEnd,
    onSessionDragOver: props.onSessionDragOver ?? sessionItemProps.onSessionDragOver,
    onSessionDropIndicatorClear: props.onSessionDropIndicatorClear ?? sessionItemProps.onSessionDropIndicatorClear,
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
      onDragLeave={(e) => {
        cancelAutoExpand();
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
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
      <details open={group.isExpanded ?? true} className="group/details">
        <summary
          className={`list-none flex items-center justify-between px-2 py-2 rounded-lg cursor-pointer transition-colors duration-150 ${
            dragOverId === group.id
              ? 'bg-[var(--theme-bg-accent)]/10 text-[var(--theme-text-link)]'
              : 'hover:bg-[var(--theme-bg-tertiary)]'
          } group`}
          onClick={(e) => {
            if (e.detail > 1) {
              // 双击由 onDoubleClick 处理，跳过展开切换
              return;
            }
            e.preventDefault();
            onToggleGroupExpansion(group.id);
          }}
          onDoubleClick={(e) => {
            e.preventDefault();
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
                onTitleChange={(e) => setEditingItem({ ...editingItem, title: e.target.value })}
                onBlur={handleRenameConfirm}
                onKeyDown={handleRenameKeyDown}
                onClick={(e) => e.stopPropagation()}
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
          <button
            onClick={(e) => toggleMenu(e, group.id)}
            className="p-1 rounded-full text-[var(--theme-text-primary)] opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus:opacity-100 focus:pointer-events-auto transition-opacity"
          >
            <MoreHorizontal size={16} strokeWidth={2.2} />
          </button>
        </summary>
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
        <LimitedSessionList
          sessions={sessions ?? []}
          sessionItemProps={childSessionItemProps}
          className="pl-1 pb-1"
          isDragging={!!isDragging || !!sessionItemProps.draggingSessionId || !!draggingGroupId}
        />
      </details>
    </div>
  );
};
