import type { ComponentProps } from 'react';
import { vi } from 'vitest';
import type { ChatGroup, SavedChatSession } from '@/types';
import type { HistorySidebar } from '@/components/sidebar/HistorySidebar';

type HistorySidebarProps = ComponentProps<typeof HistorySidebar>;

export const createHistorySidebarProps = (overrides: Partial<HistorySidebarProps> = {}): HistorySidebarProps => ({
  isOpen: true,
  onToggle: vi.fn(),
  onAutoClose: vi.fn(),
  sessions: [],
  groups: [] as ChatGroup[],
  activeSessionId: null,
  loadingSessionIds: new Set<string>(),
  generatingTitleSessionIds: new Set<string>(),
  onSelectSession: vi.fn(),
  onNewChat: vi.fn(),
  onDeleteSession: vi.fn(),
  onRenameSession: vi.fn(),
  onTogglePinSession: vi.fn(),
  onDuplicateSession: vi.fn(),
  onOpenExportModal: vi.fn(),
  onAddNewGroup: vi.fn(),
  onDeleteGroup: vi.fn(),
  onRenameGroup: vi.fn(),
  onMoveSessionToGroup: vi.fn(),
  onToggleGroupExpansion: vi.fn(),
  onNewChatInGroup: vi.fn(),
  onOpenSettingsModal: vi.fn(),
  themeId: 'pearl',
  newChatShortcut: '',
  searchChatsShortcut: '',
  ...overrides,
});

export const createHistorySidebarSession = (
  index: number,
  settings: SavedChatSession['settings'],
): SavedChatSession => ({
  id: `session-${index}`,
  title: `Chat ${index}`,
  timestamp: Date.now() - index,
  messages: [],
  settings,
});
