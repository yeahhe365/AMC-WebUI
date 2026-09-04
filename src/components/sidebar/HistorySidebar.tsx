import React from 'react';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { type SavedChatSession, type ChatGroup } from '@/types';
import { useI18n } from '@/contexts/I18nContext';
import { SidebarHeader } from './SidebarHeader';
import { SidebarActions } from './SidebarActions';
import type { SessionItemPassedProps } from './sidebarTypes';
import { CollapsedRecentChatsButton } from './CollapsedRecentChatsButton';
import { Search, Settings } from 'lucide-react';
import { IconNewChat, IconSidebarToggle } from '@/components/icons';
import { useHistorySidebarLogic, type HistoryDisplayMode } from './useHistorySidebarLogic';
import { SIDEBAR_CLICKABLE_ICON_BUTTON_CLASS, SIDEBAR_ICON_LINK_BUTTON_CLASS } from './sidebarStyles';
import { LimitedSessionList } from './LimitedSessionList';
import { DESKTOP_BREAKPOINT_PX } from '@/constants/layout';
import { isDarkThemeId } from '@/utils/themeMode';
import { isGroupDrag, isSessionDrag } from './sidebarDragTypes';
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableGroupItem } from './SortableGroupItem';

interface HistorySidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  onAutoClose: () => void;
  sessions: SavedChatSession[];
  groups: ChatGroup[];
  activeSessionId: string | null;
  loadingSessionIds: Set<string>;
  generatingTitleSessionIds: Set<string>;
  onSelectSession: (sessionId: string) => void;
  onNewChat: () => void;
  onDeleteSession: (sessionId: string) => void;
  onRenameSession: (sessionId: string, newTitle: string) => void;
  onTogglePinSession: (sessionId: string) => void;
  onDuplicateSession: (sessionId: string) => void;
  onOpenExportModal: (sessionId?: string) => void | Promise<void>;
  onAddNewGroup: () => void;
  onDeleteGroup: (groupId: string) => void;
  onClearGroup?: (groupId: string) => void;
  onRenameGroup: (groupId: string, newTitle: string) => void;
  onMoveSessionToGroup: (sessionId: string, groupId: string | null) => void;
  onToggleGroupExpansion: (groupId: string) => void;
  onNewChatInGroup: (groupId: string) => void;
  onReorderGroups?: (activeId: string, overId: string) => void;
  onOpenSettingsModal: () => void;
  themeId: string;
  newChatShortcut: string;
  searchChatsShortcut: string;
  brandHref?: string;
  onBrandClick?: () => void;
  displayMode?: HistoryDisplayMode;
  onDisplayModeChange?: (mode: HistoryDisplayMode) => void;
}

const MiniSidebarButton = ({
  onClick,
  icon: Icon,
  title,
  href,
  className = '',
}: {
  onClick: () => void;
  icon: React.ElementType;
  title: string;
  href?: string;
  className?: string;
}) => {
  if (href) {
    return (
      <a
        href={href}
        onClick={(e) => {
          if (e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
            e.preventDefault();
            e.stopPropagation();
            onClick();
          }
        }}
        className={[SIDEBAR_ICON_LINK_BUTTON_CLASS, className].filter(Boolean).join(' ')}
        title={title}
        aria-label={title}
      >
        <Icon size={20} strokeWidth={2} />
      </a>
    );
  }
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={[SIDEBAR_CLICKABLE_ICON_BUTTON_CLASS, className].filter(Boolean).join(' ')}
      title={title}
      aria-label={title}
    >
      <Icon size={20} strokeWidth={2} />
    </button>
  );
};

// Internal component to handle auto-animate for a list of sessions in a category
const SessionListGroup = ({
  title,
  sessions,
  sessionItemProps,
  isDragging,
}: {
  title: string;
  sessions: SavedChatSession[];
  sessionItemProps: SessionItemPassedProps;
  isDragging?: boolean;
}) => {
  return (
    <div>
      <div className="px-3 pt-4 pb-1 text-xs font-semibold tracking-wide text-[var(--theme-text-primary)]">{title}</div>
      <LimitedSessionList sessions={sessions} sessionItemProps={sessionItemProps} isDragging={isDragging} />
    </div>
  );
};

export const HistorySidebar: React.FC<HistorySidebarProps> = (props) => {
  const { t } = useI18n();
  const {
    isOpen,
    onToggle,
    onAutoClose,
    sessions,
    groups,
    activeSessionId,
    loadingSessionIds,
    generatingTitleSessionIds,
    onOpenExportModal,
    onAddNewGroup,
    onDeleteGroup,
    onClearGroup,
    onToggleGroupExpansion,
    onNewChatInGroup,
    onReorderGroups,
    themeId,
    onNewChat,
    onDeleteSession,
    onTogglePinSession,
    onDuplicateSession,
    onOpenSettingsModal,
    onRenameSession,
    onRenameGroup,
    onMoveSessionToGroup,
    onSelectSession,
    newChatShortcut,
    searchChatsShortcut,
    brandHref = '/',
    onBrandClick,
    displayMode = 'group',
    onDisplayModeChange,
  } = props;

  const [activeGroupDragId, setActiveGroupDragId] = React.useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const {
    searchQuery,
    setSearchQuery,
    isSearching,
    setIsSearching,
    editingItem,
    setEditingItem,
    activeMenu,
    setActiveMenu,
    dragOverId,
    setDragOverId,
    draggingSessionId,
    draggingGroupId,
    sessionDropIndicator,
    groupDropIndicator,
    isDragging,
    newlyTitledSessionIds,
    menuRef,
    editInputRef,
    searchInputRef,
    sessionsByGroupId,
    sortedGroups,
    categorizedUngroupedSessions,
    categorizedTimeModePinned,
    handleStartEdit,
    handleRenameConfirm,
    handleRenameKeyDown,
    toggleMenu,
    handleDragOver,
    handleDrop,
    handleMainDragLeave,
    handleSessionDragStart,
    handleSessionDragEnd,
    handleGroupDragStart,
    handleGroupDragEnd,
    handleSessionDragOver,
    handleSessionDropIndicatorClear,
    handleGroupDragOver,
    handleMiniSearchClick,
    handleEmptySpaceClick,
    handleSessionSelect,
  } = useHistorySidebarLogic({
    isOpen,
    onToggle,
    onAutoClose,
    sessions,
    groups,
    generatingTitleSessionIds,
    displayMode,
    onRenameSession,
    onRenameGroup,
    onMoveSessionToGroup,
    onSelectSession,
  });

  const groupIds = React.useMemo(() => sortedGroups.map((group) => `group:${group.id}`), [sortedGroups]);
  const handleGroupSortStart = (event: DragStartEvent) => {
    const activeId = String(event.active.id);
    if (activeId.startsWith('group:')) {
      const gid = activeId.slice(6);
      setActiveGroupDragId(gid);
      handleGroupDragStart(gid);
    }
  };
  const handleGroupSortEnd = (event: DragEndEvent) => {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    setActiveGroupDragId(null);
    handleGroupDragEnd();
    if (!overId || activeId === overId) return;
    if (activeId.startsWith('group:') && overId.startsWith('group:')) {
      const activeGid = activeId.slice(6);
      const overGid = overId.slice(6);
      onReorderGroups?.(activeGid, overGid);
    }
  };
  const activeGroup = activeGroupDragId ? sortedGroups.find((group) => group.id === activeGroupDragId) : null;

  // Auto-scroll: while dragging a session near the top/bottom edge of the list,
  // nudge the scroll position each frame so the user can reach sessions that
  // are out of view. Only active during a session drag; stopped on leave/drop.
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const scrollRafRef = React.useRef<number | null>(null);
  const EDGE_SCROLL_ZONE_PX = 48;

  const stopEdgeScroll = () => {
    if (scrollRafRef.current !== null) {
      cancelAnimationFrame(scrollRafRef.current);
      scrollRafRef.current = null;
    }
  };

  const startEdgeScroll = (container: HTMLDivElement, direction: number) => {
    if (scrollRafRef.current !== null) return;
    const step = () => {
      container.scrollTop += direction;
      scrollRafRef.current = requestAnimationFrame(step);
    };
    scrollRafRef.current = requestAnimationFrame(step);
  };

  const handleScrollContainerDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (isGroupDrag(event)) return;
    if (!isSessionDrag(event)) {
      stopEdgeScroll();
      return;
    }
    const container = scrollContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const distanceFromTop = event.clientY - rect.top;
    const distanceFromBottom = rect.bottom - event.clientY;

    if (distanceFromTop < EDGE_SCROLL_ZONE_PX) {
      const speed = Math.max(1, Math.ceil((EDGE_SCROLL_ZONE_PX - distanceFromTop) / 8));
      startEdgeScroll(container, -speed);
    } else if (distanceFromBottom < EDGE_SCROLL_ZONE_PX) {
      const speed = Math.max(1, Math.ceil((EDGE_SCROLL_ZONE_PX - distanceFromBottom) / 8));
      startEdgeScroll(container, speed);
    } else {
      stopEdgeScroll();
    }
  };

  const ungroupedSessions = sessionsByGroupId.get(null) || [];
  const pinnedUngrouped = ungroupedSessions.filter((session) => session.isPinned);
  const { categories, categoryOrder } = categorizedUngroupedSessions;

  const sessionItemSharedProps = {
    activeSessionId,
    editingItem,
    activeMenu,
    loadingSessionIds,
    generatingTitleSessionIds,
    newlyTitledSessionIds,
    groups,
    editInputRef,
    menuRef,
    onSelectSession: handleSessionSelect,
    onTogglePinSession,
    onDeleteSession,
    onDuplicateSession,
    onOpenExportModal,
    onMoveSessionToGroup,
    handleStartEdit: (item: SavedChatSession) => handleStartEdit('session', item),
    handleRenameConfirm,
    handleRenameKeyDown,
    setEditingItem,
    toggleMenu,
    setActiveMenu,
    setDragOverId,
    draggingSessionId,
    draggingGroupId,
    dropIndicator: sessionDropIndicator,
    onSessionDragStart: handleSessionDragStart,
    onSessionDragEnd: handleSessionDragEnd,
    onSessionDragOver: handleSessionDragOver,
    onSessionDropIndicatorClear: handleSessionDropIndicatorClear,
  };

  const [listParentRef] = useAutoAnimate<HTMLDivElement>({ duration: 200 });
  const expandedPaneRef = React.useRef<HTMLDivElement>(null);
  const searchTitle = t('historySearchButton') + (searchChatsShortcut ? ` (${searchChatsShortcut})` : '');

  // Cancel any pending edge-scroll rAF on unmount.
  React.useEffect(() => () => stopEdgeScroll(), []);

  React.useEffect(() => {
    const pane = expandedPaneRef.current as (HTMLDivElement & { inert?: boolean }) | null;
    if (!pane) {
      return;
    }

    if (isOpen) {
      pane.inert = false;
      pane.removeAttribute('inert');
      return;
    }

    pane.inert = true;
    pane.setAttribute('inert', '');
  }, [isOpen]);

  return (
    <aside
      data-history-sidebar-root="true"
      className={`h-full flex flex-col ${isDarkThemeId(themeId) ? 'bg-[var(--theme-bg-primary)]' : 'bg-[var(--theme-bg-secondary)]'} flex-shrink-0
                 transition-transform duration-300 ease-[cubic-bezier(0.19,1,0.22,1)] md:transition-[width] transform-gpu
                 absolute md:static top-0 left-0 z-50
                 overflow-hidden
                 ${isOpen ? 'w-64 md:w-[16.2rem] translate-x-0' : 'w-64 md:w-[52.2px] -translate-x-full md:translate-x-0'}
                 
                 border-r border-[var(--theme-border-primary)]`}
      role="complementary"
      aria-label={t('historyTitle')}
    >
      <div
        ref={expandedPaneRef}
        data-history-sidebar-expanded-pane="true"
        aria-hidden={!isOpen}
        className={`w-64 md:w-[16.2rem] h-full flex flex-col shrink-0 min-w-[16rem] md:min-w-[16.2rem] md:absolute md:inset-0 transition-opacity duration-200 ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-100 pointer-events-none md:opacity-0'
        }`}
      >
        <SidebarHeader
          isOpen={isOpen}
          onToggle={onToggle}
          themeId={themeId}
          brandHref={brandHref}
          onBrandClick={onBrandClick}
        />
        <SidebarActions
          onNewChat={onNewChat}
          onCloseSidebar={onAutoClose}
          onAddNewGroup={onAddNewGroup}
          isSearching={isSearching}
          setIsSearching={setIsSearching}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          searchInputRef={searchInputRef}
          newChatShortcut={newChatShortcut}
          searchChatsShortcut={searchChatsShortcut}
          activeSessionId={activeSessionId}
        />
        <div
          ref={scrollContainerRef}
          className="flex-grow overflow-y-auto custom-scrollbar p-2 cursor-ew-resize"
          onClick={handleEmptySpaceClick}
          onDragOver={handleScrollContainerDragOver}
          onDrop={stopEdgeScroll}
          onDragLeave={stopEdgeScroll}
          onDragEnd={stopEdgeScroll}
        >
          {onDisplayModeChange && sessions.length > 0 && (
            <div className="mb-2 flex gap-1 rounded-lg bg-[var(--theme-bg-tertiary)] p-1">
              <button
                onClick={() => onDisplayModeChange('group')}
                className={`flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${displayMode === 'group' ? 'bg-[var(--theme-bg-primary)] text-[var(--theme-text-primary)] shadow-sm' : 'text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-primary)]'}`}
              >
                {t('historyDisplayModeGroup')}
              </button>
              <button
                onClick={() => onDisplayModeChange('time')}
                className={`flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${displayMode === 'time' ? 'bg-[var(--theme-bg-primary)] text-[var(--theme-text-primary)] shadow-sm' : 'text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-primary)]'}`}
              >
                {t('historyDisplayModeTime')}
              </button>
            </div>
          )}
          {sessions.length === 0 && !searchQuery ? (
            <p className="p-4 text-xs sm:text-sm text-center font-medium text-[var(--theme-text-primary)] cursor-auto">
              {t('historyEmpty')}
            </p>
          ) : displayMode === 'time' ? (
            <div ref={listParentRef} className="rounded-lg min-h-[50px] cursor-auto">
              {categorizedTimeModePinned.length > 0 && (
                <SessionListGroup
                  title={t('historyPinned')}
                  sessions={categorizedTimeModePinned}
                  sessionItemProps={sessionItemSharedProps}
                  isDragging={isDragging}
                />
              )}
              {categoryOrder.map((categoryName) => (
                <SessionListGroup
                  key={categoryName}
                  title={categoryName}
                  sessions={categories[categoryName]}
                  sessionItemProps={sessionItemSharedProps}
                  isDragging={isDragging}
                />
              ))}
            </div>
          ) : (
            <div
              ref={listParentRef}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, 'all-conversations')}
              onDragEnter={(e) => {
                if (!isSessionDrag(e)) return;
                setDragOverId('all-conversations');
              }}
              onDragLeave={handleMainDragLeave}
              onDragEnd={handleSessionDragEnd}
              className={`rounded-lg transition-colors min-h-[50px] cursor-auto ${dragOverId === 'all-conversations' ? 'bg-[var(--theme-bg-accent)] bg-opacity-10 ring-2 ring-[var(--theme-bg-accent)] ring-inset ring-opacity-50' : ''}`}
            >
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleGroupSortStart}
                onDragEnd={handleGroupSortEnd}
                onDragCancel={() => {
                  setActiveGroupDragId(null);
                  handleGroupDragEnd();
                }}
              >
                <SortableContext items={groupIds} strategy={verticalListSortingStrategy}>
                  {sortedGroups.map((group) => (
                    <SortableGroupItem
                      key={group.id}
                      group={group}
                      sessions={sessionsByGroupId.get(group.id) || []}
                      dragOverId={dragOverId}
                      groupDropIndicator={groupDropIndicator}
                      isDragging={isDragging}
                      handleGroupDragOver={handleGroupDragOver}
                      onGroupDragStart={handleGroupDragStart}
                      onGroupDragEnd={handleGroupDragEnd}
                      onReorderGroups={onReorderGroups}
                      onToggleGroupExpansion={onToggleGroupExpansion}
                      onNewChatInGroup={(groupId) => {
                        onNewChatInGroup(groupId);
                        if (window.innerWidth < DESKTOP_BREAKPOINT_PX) onAutoClose();
                      }}
                      handleGroupStartEdit={(item) => handleStartEdit('group', item)}
                      handleDrop={handleDrop}
                      handleDragOver={handleDragOver}
                      onDeleteGroup={onDeleteGroup}
                      onClearGroup={onClearGroup}
                      {...sessionItemSharedProps}
                    />
                  ))}
                </SortableContext>
                <DragOverlay dropAnimation={null}>
                  {activeGroup ? (
                    <div className="rounded-lg border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-primary)] shadow-xl px-3 py-2 text-sm font-semibold opacity-90">
                      {activeGroup.title}
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>

              {pinnedUngrouped.length > 0 && (
                <SessionListGroup
                  title={t('historyPinned')}
                  sessions={pinnedUngrouped}
                  sessionItemProps={sessionItemSharedProps}
                  isDragging={isDragging}
                />
              )}

              {categoryOrder.map((categoryName) => (
                <SessionListGroup
                  key={categoryName}
                  title={categoryName}
                  sessions={categories[categoryName]}
                  sessionItemProps={sessionItemSharedProps}
                  isDragging={isDragging}
                />
              ))}
            </div>
          )}
        </div>

        <div className="p-3">
          <button
            onClick={onOpenSettingsModal}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-[var(--theme-text-primary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] rounded-xl transition-all duration-150 group active:scale-[0.98]"
          >
            <Settings size={20} strokeWidth={2.2} className="text-[var(--theme-text-primary)] transition-colors" />
            <span>{t('settingsTitle')}</span>
          </button>
        </div>
      </div>

      <div
        aria-hidden={isOpen}
        className={`hidden md:flex absolute inset-0 flex-col items-center py-4 h-full gap-[0.56rem] w-full min-w-[52.2px] cursor-ew-resize hover:bg-[var(--theme-bg-tertiary)]/30 transition-colors transition-opacity duration-200 ${
          isOpen ? 'opacity-0 pointer-events-none' : 'opacity-100 pointer-events-auto'
        }`}
        onClick={onToggle}
      >
        <MiniSidebarButton
          onClick={onToggle}
          icon={IconSidebarToggle}
          title={t('historySidebarOpen')}
          className="-translate-y-1"
        />

        <div className="w-8 h-px bg-[var(--theme-border-primary)] my-1"></div>

        <MiniSidebarButton
          href={brandHref}
          onClick={onNewChat}
          icon={IconNewChat}
          title={t('newChat') + (newChatShortcut ? ` (${newChatShortcut})` : '')}
        />
        <MiniSidebarButton onClick={handleMiniSearchClick} icon={Search} title={searchTitle} />
        <CollapsedRecentChatsButton
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelectSession={handleSessionSelect}
        />

        <div className="mt-auto">
          <MiniSidebarButton onClick={onOpenSettingsModal} icon={Settings} title={t('settingsTitle')} />
        </div>
      </div>
    </aside>
  );
};
