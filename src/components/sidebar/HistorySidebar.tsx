import React from 'react';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { type SavedChatSession, type ChatGroup } from '@/types';
import { useI18n } from '@/contexts/I18nContext';
import { SidebarHeader } from './SidebarHeader';
import { SidebarActions } from './SidebarActions';
import { Settings } from 'lucide-react';
import { useHistorySidebarLogic, type HistoryDisplayMode } from './useHistorySidebarLogic';
import { useIsMobile } from '@/hooks/ui/useDevice';
import { useUIStore } from '@/stores/uiStore';
import { isSessionDrag } from './sidebarDragTypes';
import { useSidebarResize } from './useSidebarResize';
import { SidebarResizeHandle } from './SidebarResizeHandle';
import { useSidebarEdgeScroll } from './useSidebarEdgeScroll';
import { SessionListGroup } from './SessionListGroup';
import { SidebarGroupSortDnd } from './SidebarGroupSortDnd';
import { SidebarCollapsedRail } from './SidebarCollapsedRail';
import { SidebarDisplayModeToggle } from './SidebarDisplayModeToggle';
import { SidebarItemContext, type SidebarItemContextValue } from './SidebarItemContext';

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
  onMoveSessionToGroup: (sessionId: string, groupId: string | null, placement?: 'top' | 'end') => void;
  onReorderSession?: (activeId: string, overId: string, position: 'before' | 'after') => void;
  onRegenerateTitleSession?: (sessionId: string) => void | Promise<void>;
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

export const HistorySidebar: React.FC<HistorySidebarProps> = (props) => {
  const { t } = useI18n();
  const activeView = useUIStore((state) => state.activeView);
  const setActiveView = useUIStore((state) => state.setActiveView);
  const isMobile = useIsMobile();
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
    onReorderSession,
    onSelectSession,
    onRegenerateTitleSession,
    newChatShortcut,
    searchChatsShortcut,
    brandHref = '/',
    onBrandClick,
    displayMode = 'group',
    onDisplayModeChange,
  } = props;

  const {
    sidebarWidth,
    isResizingSidebar,
    startSidebarResize,
    resetSidebarWidth,
    handleKeyDown: handleResizeKeyDown,
  } = useSidebarResize();

  const { scrollContainerRef, handleScrollContainerDragOver, stopEdgeScroll } = useSidebarEdgeScroll();

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
    unpinnedUngroupedSessions,
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
    handleRegenerateTitle,
    searchOnExpand,
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
    onRegenerateTitleSession,
  });

  const ungroupedSessions = sessionsByGroupId.get(null) || [];
  const pinnedUngrouped = ungroupedSessions.filter((session) => session.isPinned);
  const { categories, categoryOrder } = categorizedUngroupedSessions;

  const sessionItemSharedProps: SidebarItemContextValue = {
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
    onRegenerateTitleSession: handleRegenerateTitle,
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
    onReorderSession,
    disableNativeDrag: displayMode === 'time',
    scrollContainerRef,
    searchQuery,
  };

  const [listParentRef] = useAutoAnimate<HTMLDivElement>({ duration: 200 });
  const expandedPaneRef = React.useRef<HTMLDivElement>(null);
  const collapsedRailRef = React.useRef<HTMLDivElement>(null);

  React.useLayoutEffect(() => {
    if (!isOpen && expandedPaneRef.current?.contains(document.activeElement)) {
      (document.activeElement as HTMLElement)?.blur?.();
    } else if (isOpen && collapsedRailRef.current?.contains(document.activeElement)) {
      (document.activeElement as HTMLElement)?.blur?.();
    }
  }, [isOpen]);

  React.useEffect(() => {
    const pane = expandedPaneRef.current as (HTMLDivElement & { inert?: boolean }) | null;
    const rail = collapsedRailRef.current as (HTMLDivElement & { inert?: boolean }) | null;

    if (pane) {
      if (isOpen) {
        pane.inert = false;
        pane.removeAttribute('inert');
      } else {
        pane.inert = true;
        pane.setAttribute('inert', '');
      }
    }

    if (rail) {
      if (!isOpen) {
        rail.inert = false;
        rail.removeAttribute('inert');
      } else {
        rail.inert = true;
        rail.setAttribute('inert', '');
      }
    }
  }, [isOpen]);

  // P1: Freeze layout width during collapse so children never wrap/reflow mid-slide
  const lastWideWidth = React.useRef(sidebarWidth);
  if (isOpen) {
    lastWideWidth.current = sidebarWidth;
  }
  const effectivePaneWidth = isMobile
    ? undefined
    : isOpen
      ? `${sidebarWidth}px`
      : `${lastWideWidth.current}px`;

  // P2: Quiet Scrollbar with 2s linger (DeepSeek-style pointer affordance)
  const SCROLLBAR_LINGER_MS = 2000;
  const sidebarRootRef = React.useRef<HTMLElement | null>(null);
  const [pointerInsideSidebar, setPointerInsideSidebar] = React.useState(false);
  const scrollbarLingerTimerRef = React.useRef<number | null>(null);

  const armLinger = React.useCallback(() => {
    if (scrollbarLingerTimerRef.current !== null) return;
    scrollbarLingerTimerRef.current = window.setTimeout(() => {
      scrollbarLingerTimerRef.current = null;
      setPointerInsideSidebar(false);
    }, SCROLLBAR_LINGER_MS);
  }, []);

  const cancelLinger = React.useCallback(() => {
    if (scrollbarLingerTimerRef.current !== null) {
      window.clearTimeout(scrollbarLingerTimerRef.current);
      scrollbarLingerTimerRef.current = null;
    }
  }, []);

  React.useEffect(() => {
    if (!pointerInsideSidebar) return;
    const onMove = (event: PointerEvent) => {
      const rect = sidebarRootRef.current?.getBoundingClientRect();
      if (!rect) return;
      const inside =
        event.clientX >= rect.left &&
        event.clientX < rect.right &&
        event.clientY >= rect.top &&
        event.clientY < rect.bottom;
      if (inside) {
        cancelLinger();
      } else {
        armLinger();
      }
    };
    document.addEventListener('pointermove', onMove);
    return () => {
      document.removeEventListener('pointermove', onMove);
      cancelLinger();
    };
  }, [pointerInsideSidebar, armLinger, cancelLinger]);

  return (
    <aside
      ref={sidebarRootRef}
      data-history-sidebar-root="true"
      onPointerEnter={() => {
        cancelLinger();
        setPointerInsideSidebar(true);
      }}
      onPointerLeave={() => {
        armLinger();
      }}
      className={`h-full flex flex-col bg-[var(--theme-bg-secondary)] flex-shrink-0
                 transition-transform duration-300 ease-[cubic-bezier(0.19,1,0.22,1)] ${isResizingSidebar ? 'transition-none' : 'md:transition-[width]'} transform-gpu
                 absolute md:relative top-0 left-0 z-50
                 overflow-hidden
                 ${isOpen ? 'w-64 md:w-[16.2rem] translate-x-0' : 'w-64 md:w-[52.2px] -translate-x-full md:translate-x-0'}
                 border-r border-[var(--theme-border-primary)]`}
      style={{
        width: isOpen ? (isMobile ? undefined : `${sidebarWidth}px`) : undefined,
        '--sidebar-scrollbar-thumb':
          pointerInsideSidebar || isResizingSidebar ? 'var(--theme-scrollbar-thumb)' : 'transparent',
      } as React.CSSProperties}
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
        style={{
          width: effectivePaneWidth,
          minWidth: effectivePaneWidth,
        }}
      >
        <SidebarItemContext.Provider value={sessionItemSharedProps}>
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
            searchOnExpand={searchOnExpand}
          />
          <div
            ref={scrollContainerRef}
            className="flex-grow overflow-y-auto quiet-scrollbar custom-scrollbar p-2 cursor-ew-resize"
            onClick={handleEmptySpaceClick}
            onDragOver={handleScrollContainerDragOver}
            onDrop={stopEdgeScroll}
            onDragLeave={stopEdgeScroll}
            onDragEnd={stopEdgeScroll}
          >
            {onDisplayModeChange && sessions.length > 0 && (
              <SidebarDisplayModeToggle displayMode={displayMode} onDisplayModeChange={onDisplayModeChange} />
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
                    isDragging={isDragging}
                  />
                )}
                {categoryOrder.map((categoryName) => (
                  <SessionListGroup
                    key={categoryName}
                    title={categoryName}
                    sessions={categories[categoryName]}
                    isDragging={isDragging}
                  />
                ))}
              </div>
            ) : (
              <div
                ref={listParentRef}
                onDragOver={handleDragOver}
                onDrop={(event) => handleDrop(event, 'all-conversations')}
                onDragEnter={(event) => {
                  if (!isSessionDrag(event)) return;
                  setDragOverId('all-conversations');
                }}
                onDragLeave={handleMainDragLeave}
                onDragEnd={handleSessionDragEnd}
                className={`rounded-lg transition-colors min-h-[50px] cursor-auto ${
                  dragOverId === 'all-conversations'
                    ? 'bg-[color-mix(in_srgb,var(--theme-bg-accent)_12%,transparent)] ring-2 ring-[color-mix(in_srgb,var(--theme-bg-accent)_50%,transparent)] ring-inset'
                    : ''
                }`}
              >
                <SidebarGroupSortDnd
                  sortedGroups={sortedGroups}
                  sessionsByGroupId={sessionsByGroupId}
                  dragOverId={dragOverId}
                  groupDropIndicator={groupDropIndicator}
                  isDragging={isDragging}
                  handleGroupDragOver={handleGroupDragOver}
                  handleGroupDragStart={handleGroupDragStart}
                  handleGroupDragEnd={handleGroupDragEnd}
                  onReorderGroups={onReorderGroups}
                  onToggleGroupExpansion={onToggleGroupExpansion}
                  onNewChatInGroup={onNewChatInGroup}
                  onAutoClose={onAutoClose}
                  handleGroupStartEdit={(item) => handleStartEdit('group', item)}
                  handleDrop={handleDrop}
                  handleDragOver={handleDragOver}
                  onDeleteGroup={onDeleteGroup}
                  onClearGroup={onClearGroup}
                />

                {pinnedUngrouped.length > 0 && (
                  <SessionListGroup title={t('historyPinned')} sessions={pinnedUngrouped} isDragging={isDragging} />
                )}

                <SessionListGroup sessions={unpinnedUngroupedSessions} isDragging={isDragging} />
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
        </SidebarItemContext.Provider>
      </div>

      <div
        ref={collapsedRailRef}
        aria-hidden={isOpen}
        className={`hidden md:flex absolute inset-0 flex-col items-center py-4 h-full gap-[0.56rem] w-full min-w-[52.2px] cursor-ew-resize hover:bg-[var(--theme-bg-tertiary)]/30 transition-colors transition-opacity duration-200 ${
          isOpen ? 'opacity-0 pointer-events-none' : 'opacity-100 pointer-events-auto'
        }`}
        onClick={onToggle}
      >
        <SidebarCollapsedRail
          onToggle={onToggle}
          onNewChat={onNewChat}
          newChatShortcut={newChatShortcut}
          brandHref={brandHref}
          activeView={activeView}
          setActiveView={setActiveView}
          onMiniSearchClick={handleMiniSearchClick}
          searchChatsShortcut={searchChatsShortcut}
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelectSession={handleSessionSelect}
          onOpenSettingsModal={onOpenSettingsModal}
        />
      </div>

      <SidebarResizeHandle
        isOpen={isOpen}
        sidebarWidth={sidebarWidth}
        isResizingSidebar={isResizingSidebar}
        startSidebarResize={startSidebarResize}
        resetSidebarWidth={resetSidebarWidth}
        onKeyDown={handleResizeKeyDown}
      />
    </aside>
  );
};
