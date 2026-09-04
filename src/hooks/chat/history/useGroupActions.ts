import { useCallback } from 'react';
import { type ChatGroup, type SavedChatSession } from '@/types';
import { logService } from '@/services/logService';

interface UseGroupActionsProps {
  updateAndPersistGroups: (updater: (prev: ChatGroup[]) => ChatGroup[]) => void | Promise<void>;
  updateAndPersistSessions: (
    updater: (prev: SavedChatSession[]) => SavedChatSession[],
    options?: { persist?: boolean },
  ) => void | Promise<void>;
  t: (key: string) => string;
}

const makeOrderKey = (index: number) => String(index).padStart(6, '0');

const withOrderKeys = (groups: ChatGroup[]): ChatGroup[] =>
  groups.map((group, index) => (group.orderKey ? group : { ...group, orderKey: makeOrderKey(index) }));

export const useGroupActions = ({ updateAndPersistGroups, updateAndPersistSessions, t }: UseGroupActionsProps) => {
  const handleAddNewGroup = useCallback(() => {
    logService.info('Adding new group.');
    const newGroup: ChatGroup = {
      id: `group-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      title: t('newGroupTitle'),
      timestamp: Date.now(),
      isExpanded: true,
      orderKey: makeOrderKey(0),
    };
    updateAndPersistGroups((prev) => {
      const withKeys = withOrderKeys(prev);
      const next = [newGroup, ...withKeys];
      return next.map((group, index) => ({ ...group, orderKey: makeOrderKey(index) }));
    });
  }, [updateAndPersistGroups, t]);

  const handleDeleteGroup = useCallback(
    (groupId: string) => {
      logService.info(`Deleting group: ${groupId}`);
      updateAndPersistGroups((prev) => prev.filter((group) => group.id !== groupId));
      updateAndPersistSessions((prev) =>
        prev.map((session) => (session.groupId === groupId ? { ...session, groupId: null } : session)),
      );
    },
    [updateAndPersistGroups, updateAndPersistSessions],
  );

  const handleRenameGroup = useCallback(
    (groupId: string, newTitle: string) => {
      if (!newTitle.trim()) return;
      logService.info(`Renaming group ${groupId} to "${newTitle}"`);
      updateAndPersistGroups((prev) =>
        prev.map((group) => (group.id === groupId ? { ...group, title: newTitle.trim() } : group)),
      );
    },
    [updateAndPersistGroups],
  );

  const handleMoveSessionToGroup = useCallback(
    (sessionId: string, groupId: string | null) => {
      logService.info(`Moving session ${sessionId} to group ${groupId}`);
      updateAndPersistSessions((prev) =>
        prev.map((session) =>
          session.id === sessionId ? (session.groupId === groupId ? session : { ...session, groupId }) : session,
        ),
      );
    },
    [updateAndPersistSessions],
  );

  const handleToggleGroupExpansion = useCallback(
    (groupId: string) => {
      updateAndPersistGroups((prev) =>
        prev.map((group) => (group.id === groupId ? { ...group, isExpanded: !(group.isExpanded ?? true) } : group)),
      );
    },
    [updateAndPersistGroups],
  );

  const handleReorderGroups = useCallback(
    (activeId: string, overId: string) => {
      if (activeId === overId) return;
      updateAndPersistGroups((prev) => {
        const sorted = [...prev].sort((a, b) => {
          if (a.orderKey && b.orderKey) return a.orderKey.localeCompare(b.orderKey);
          if (a.orderKey) return -1;
          if (b.orderKey) return 1;
          return b.timestamp - a.timestamp;
        });
        const withKeys = withOrderKeys(sorted);
        const activeIndex = withKeys.findIndex((group) => group.id === activeId);
        const overIndex = withKeys.findIndex((group) => group.id === overId);
        if (activeIndex === -1 || overIndex === -1) return prev;
        const next = [...withKeys];
        const [moved] = next.splice(activeIndex, 1);
        next.splice(overIndex, 0, moved);
        return next.map((group, index) => ({ ...group, orderKey: makeOrderKey(index) }));
      });
    },
    [updateAndPersistGroups],
  );

  const handleClearGroup = useCallback(
    (groupId: string) => {
      logService.info(`Clearing group: ${groupId}`);
      updateAndPersistSessions((prev) =>
        prev.map((session) => (session.groupId === groupId ? { ...session, groupId: null } : session)),
      );
    },
    [updateAndPersistSessions],
  );

  return {
    handleAddNewGroup,
    handleDeleteGroup,
    handleRenameGroup,
    handleMoveSessionToGroup,
    handleToggleGroupExpansion,
    handleReorderGroups,
    handleClearGroup,
  };
};
