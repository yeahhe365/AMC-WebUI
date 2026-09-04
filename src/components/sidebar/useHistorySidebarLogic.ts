import { logService } from '@/services/logService';
import { useState, useEffect, useRef, useMemo } from 'react';
import type { SavedChatSession, ChatGroup } from '@/types';
import { useWindowContext } from '@/contexts/WindowContext';
import { useI18n } from '@/contexts/I18nContext';
import { DESKTOP_BREAKPOINT_PX, FOCUS_HISTORY_SEARCH_EVENT } from '@/constants/layout';
import type { SupportedLanguage } from '@/i18n/languageRegistry';
import { dbService } from '@/services/db/dbService';
import { SESSION_DRAG_TYPE, isGroupDrag, isSessionDrag } from './sidebarDragTypes';

type HistoryTranslator = (key: string) => string;

const TITLE_UPDATE_FEEDBACK_MS = 1500;

export type HistoryDisplayMode = 'group' | 'time';

interface UseHistorySidebarLogicProps {
  isOpen: boolean;
  onToggle: () => void;
  onAutoClose: () => void;
  sessions: SavedChatSession[];
  groups: ChatGroup[];
  generatingTitleSessionIds: Set<string>;
  displayMode?: HistoryDisplayMode;
  onRenameSession: (sessionId: string, newTitle: string) => void;
  onRenameGroup: (groupId: string, newTitle: string) => void;
  onMoveSessionToGroup: (sessionId: string, groupId: string | null) => void;
  onSelectSession: (sessionId: string) => void;
}

// BCP-47 locales for month-name buckets in the sidebar date grouping.
const DATE_LOCALES: Record<SupportedLanguage, string> = {
  en: 'en-US',
  zh: 'zh-CN-u-nu-hanidec',
  ja: 'ja-JP',
  ko: 'ko-KR',
  es: 'es-ES',
  fr: 'fr-FR',
  de: 'de-DE',
};

const categorizeSessionsByDate = (
  sessions: SavedChatSession[],
  language: SupportedLanguage,
  t: HistoryTranslator,
  now: Date = new Date(),
) => {
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(todayStart.getDate() - 1);
  const sevenDaysAgoStart = new Date(todayStart);
  sevenDaysAgoStart.setDate(todayStart.getDate() - 8);
  const thirtyDaysAgoStart = new Date(todayStart);
  thirtyDaysAgoStart.setDate(todayStart.getDate() - 30);

  const categories: { [key: string]: SavedChatSession[] } = {};

  const categoryKeys = {
    today: t('historyToday'),
    yesterday: t('historyYesterday'),
    sevenDays: t('history7Days'),
    thirtyDays: t('history30Days'),
  };

  sessions.forEach((session) => {
    const sessionDate = new Date(session.timestamp);
    let categoryName: string;

    if (sessionDate >= todayStart) {
      categoryName = categoryKeys.today;
    } else if (sessionDate >= yesterdayStart) {
      categoryName = categoryKeys.yesterday;
    } else if (sessionDate >= sevenDaysAgoStart) {
      categoryName = categoryKeys.sevenDays;
    } else if (sessionDate >= thirtyDaysAgoStart) {
      categoryName = categoryKeys.thirtyDays;
    } else {
      categoryName = new Intl.DateTimeFormat(DATE_LOCALES[language] ?? 'en-US', {
        year: 'numeric',
        month: 'long',
      }).format(sessionDate);
    }

    if (!categories[categoryName]) {
      categories[categoryName] = [];
    }
    categories[categoryName].push(session);
  });

  const staticOrder = [categoryKeys.today, categoryKeys.yesterday, categoryKeys.sevenDays, categoryKeys.thirtyDays];
  const monthCategories = Object.keys(categories)
    .filter((name) => !staticOrder.includes(name))
    .sort((a, b) => {
      const dateA = new Date(categories[a][0].timestamp);
      const dateB = new Date(categories[b][0].timestamp);
      return dateB.getTime() - dateA.getTime();
    });

  const categoryOrder = [...staticOrder, ...monthCategories].filter(
    (name) => categories[name] && categories[name].length > 0,
  );

  return { categories, categoryOrder };
};

export const useHistorySidebarLogic = ({
  isOpen,
  onToggle,
  onAutoClose,
  sessions,
  groups,
  generatingTitleSessionIds,
  displayMode = 'group',
  onRenameSession,
  onRenameGroup,
  onMoveSessionToGroup,
  onSelectSession,
}: UseHistorySidebarLogicProps) => {
  const { t, language } = useI18n();
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [editingItem, setEditingItem] = useState<{ type: 'session' | 'group'; id: string; title: string } | null>(null);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [draggingSessionId, setDraggingSessionId] = useState<string | null>(null);
  const [draggingGroupId, setDraggingGroupId] = useState<string | null>(null);
  const [sessionDropIndicator, setSessionDropIndicator] = useState<{
    id: string;
    position: 'before' | 'after';
  } | null>(null);
  const [groupDropIndicator, setGroupDropIndicator] = useState<{
    id: string;
    position: 'before' | 'after';
  } | null>(null);
  const [newlyTitledSessionIds, setNewlyTitledSessionIds] = useState<ReadonlySet<string>>(new Set());
  const [searchResults, setSearchResults] = useState<{ query: string; ids: Set<string> } | null>(null);

  const menuRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const prevGeneratingTitleSessionIdsRef = useRef<Set<string>>(new Set());
  const titleTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const { document: targetDocument, window: targetWindow } = useWindowContext();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setActiveMenu(null);
    };
    if (activeMenu) targetDocument.addEventListener('mousedown', handleClickOutside);
    return () => targetDocument.removeEventListener('mousedown', handleClickOutside);
  }, [activeMenu, targetDocument]);

  useEffect(() => {
    if (editingItem) editInputRef.current?.focus();
  }, [editingItem]);

  useEffect(() => {
    const handleFocusHistorySearch = () => {
      if (!isOpen) {
        onToggle();
      }
      setIsSearching(true);
      targetWindow.setTimeout(() => searchInputRef.current?.focus(), 0);
    };

    targetDocument.addEventListener(FOCUS_HISTORY_SEARCH_EVENT, handleFocusHistorySearch);
    return () => targetDocument.removeEventListener(FOCUS_HISTORY_SEARCH_EVENT, handleFocusHistorySearch);
  }, [isOpen, onToggle, targetDocument, targetWindow]);

  useEffect(() => {
    const prevIds = prevGeneratingTitleSessionIdsRef.current;
    const completedIds = new Set<string>();
    prevIds.forEach((id) => {
      if (!generatingTitleSessionIds.has(id)) completedIds.add(id);
    });
    // 在任何早期返回之前更新 ref，以防止重复检测。
    prevGeneratingTitleSessionIdsRef.current = generatingTitleSessionIds;
    if (completedIds.size === 0) return;
    // Defer the state update outside the effect to satisfy set-state-in-effect.
    const timer = setTimeout(() => {
      setNewlyTitledSessionIds((prev) => {
        const next = new Set(prev);
        completedIds.forEach((id) => next.add(id));
        return next;
      });
      completedIds.forEach((completedId) => {
        const existing = titleTimersRef.current.get(completedId);
        if (existing) clearTimeout(existing);
        titleTimersRef.current.set(
          completedId,
          setTimeout(() => {
            titleTimersRef.current.delete(completedId);
            setNewlyTitledSessionIds((prev) => {
              const next = new Set(prev);
              next.delete(completedId);
              return next;
            });
          }, TITLE_UPDATE_FEEDBACK_MS),
        );
      });
    }, 0);
    return () => clearTimeout(timer);
  }, [generatingTitleSessionIds]);

  // Clean up all pending title animation timers on unmount.
  useEffect(
    () => () => {
      titleTimersRef.current.forEach((timer) => clearTimeout(timer));
      titleTimersRef.current.clear();
    },
    [],
  );

  // Debounced DB-backed content search.
  useEffect(() => {
    const trimmedQuery = searchQuery.trim();
    if (!trimmedQuery) return;

    const handler = setTimeout(async () => {
      try {
        const ids = await dbService.searchSessions(trimmedQuery);
        setSearchResults({ query: trimmedQuery, ids: new Set(ids) });
      } catch (searchError) {
        logService.error('Search error', searchError);
      }
    }, 300);

    return () => clearTimeout(handler);
  }, [searchQuery]);

  const filteredSessions = useMemo(() => {
    const trimmedQuery = searchQuery.trim();
    if (!trimmedQuery) return sessions;

    const freshSearchResults = searchResults?.query === trimmedQuery ? searchResults : null;
    if (freshSearchResults) {
      return sessions.filter((session) => freshSearchResults.ids.has(session.id));
    }

    const query = trimmedQuery.toLowerCase();
    return sessions.filter((session) => {
      if (session.title.toLowerCase().includes(query)) return true;
      return session.messages.some((message) => message.content.toLowerCase().includes(query));
    });
  }, [sessions, searchQuery, searchResults]);

  const sessionsByGroupId = useMemo(() => {
    const map = new Map<string | null, SavedChatSession[]>();
    map.set(null, []);
    groups.forEach((group) => map.set(group.id, []));
    filteredSessions.forEach((session) => {
      const key = session.groupId && map.has(session.groupId) ? session.groupId : null;
      map.get(key)?.push(session);
    });
    map.forEach((sessionList) =>
      sessionList.sort((leftSession, rightSession) => {
        if (leftSession.isPinned && !rightSession.isPinned) return -1;
        if (!leftSession.isPinned && rightSession.isPinned) return 1;
        return rightSession.timestamp - leftSession.timestamp;
      }),
    );
    return map;
  }, [filteredSessions, groups]);

  const sortedGroups = useMemo(() => {
    const hasOrderKey = groups.some((group) => group.orderKey);
    if (hasOrderKey) {
      return [...groups].sort((leftGroup, rightGroup) => {
        if (leftGroup.orderKey && rightGroup.orderKey) return leftGroup.orderKey.localeCompare(rightGroup.orderKey);
        if (leftGroup.orderKey) return -1;
        if (rightGroup.orderKey) return 1;
        return rightGroup.timestamp - leftGroup.timestamp;
      });
    }
    return [...groups].sort((leftGroup, rightGroup) => rightGroup.timestamp - leftGroup.timestamp);
  }, [groups]);

  const categorizedUngroupedSessions = useMemo(() => {
    if (displayMode === 'time') {
      const allUnpinned = filteredSessions.filter((session) => !session.isPinned);
      return categorizeSessionsByDate(allUnpinned, language, t);
    }
    const ungroupedSessions = sessionsByGroupId.get(null) || [];
    const unpinned = ungroupedSessions.filter((session) => !session.isPinned);
    return categorizeSessionsByDate(unpinned, language, t);
  }, [sessionsByGroupId, filteredSessions, displayMode, t, language]);

  const categorizedTimeModePinned = useMemo(() => {
    if (displayMode !== 'time') return [];
    return filteredSessions.filter((session) => session.isPinned);
  }, [filteredSessions, displayMode]);

  const handleStartEdit = (type: 'session' | 'group', item: SavedChatSession | ChatGroup) => {
    const title = 'title' in item ? item.title : '';
    setEditingItem({ type, id: item.id, title });
    setActiveMenu(null);
  };

  const handleRenameConfirm = () => {
    if (!editingItem || !editingItem.title.trim()) {
      setEditingItem(null);
      return;
    }
    if (editingItem.type === 'session') {
      onRenameSession(editingItem.id, editingItem.title.trim());
    } else if (editingItem.type === 'group') {
      onRenameGroup(editingItem.id, editingItem.title.trim());
    }
    setEditingItem(null);
  };

  const handleRenameCancel = () => {
    setEditingItem(null);
  };

  const handleRenameKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !event.nativeEvent.isComposing) handleRenameConfirm();
    else if (event.key === 'Escape') handleRenameCancel();
  };

  const toggleMenu = (event: React.MouseEvent, id: string) => {
    event.stopPropagation();
    setActiveMenu(activeMenu === id ? null : id);
  };

  const handleDragOver = (event: React.DragEvent) => {
    if (!isSessionDrag(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (event: React.DragEvent, groupId: string | null) => {
    if (!isSessionDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    const sessionId = event.dataTransfer.getData(SESSION_DRAG_TYPE);
    const targetGroupId = groupId === 'all-conversations' ? null : groupId;
    if (sessionId) onMoveSessionToGroup(sessionId, targetGroupId);
    setDragOverId(null);
  };

  const handleSessionDragStart = (sessionId: string) => {
    setDraggingSessionId(sessionId);
    setDraggingGroupId(null);
  };

  const handleSessionDragEnd = () => {
    setDraggingSessionId(null);
    setDragOverId(null);
    setSessionDropIndicator(null);
  };

  const handleGroupDragStart = (groupId: string) => {
    setDraggingGroupId(groupId);
    setDraggingSessionId(null);
  };

  const handleGroupDragEnd = () => {
    setDraggingGroupId(null);
    setDragOverId(null);
    setGroupDropIndicator(null);
  };

  const handleSessionDragOver = (event: React.DragEvent, sessionId: string) => {
    if (!isSessionDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const position = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
    setSessionDropIndicator({ id: sessionId, position });
    setDragOverId(null);
  };

  const handleSessionDropIndicatorClear = () => {
    setSessionDropIndicator(null);
  };

  const handleGroupDragOver = (event: React.DragEvent, groupId: string) => {
    if (!isGroupDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const position = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
    setGroupDropIndicator({ id: groupId, position });
  };

  const handleMainDragLeave = (event: React.DragEvent) => {
    if (event.currentTarget.contains(event.relatedTarget as Node)) return;
    setDragOverId(null);
    setSessionDropIndicator(null);
    setGroupDropIndicator(null);
  };

  const handleMiniSearchClick = () => {
    onToggle();
    setIsSearching(true);
  };

  const handleEmptySpaceClick = (event: React.MouseEvent) => {
    if (event.target === event.currentTarget) {
      onToggle();
    }
  };

  const handleSessionSelect = (sessionId: string) => {
    onSelectSession(sessionId);
    if (targetWindow.innerWidth < DESKTOP_BREAKPOINT_PX) {
      onAutoClose();
    }
  };

  const isDragging = !!draggingSessionId || !!draggingGroupId;

  return {
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
    setDraggingSessionId,
    draggingGroupId,
    setDraggingGroupId,
    sessionDropIndicator,
    groupDropIndicator,
    isDragging,
    newlyTitledSessionIds,
    menuRef,
    editInputRef,
    searchInputRef,
    filteredSessions,
    sessionsByGroupId,
    sortedGroups,
    categorizedUngroupedSessions,
    categorizedTimeModePinned,
    handleStartEdit,
    handleRenameConfirm,
    handleRenameCancel,
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
  };
};
