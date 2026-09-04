import React, { type RefObject } from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { Search, X } from 'lucide-react';
import { IconNewChat, IconNewGroup } from '@/components/icons';
import { DESKTOP_BREAKPOINT_PX } from '@/constants/layout';
import { buildNewTabHref } from '@/utils/chat/lastActiveSession';
import { SIDEBAR_ACTION_LINK_CLASS, SIDEBAR_ACTION_ROW_CLASS } from './sidebarStyles';

interface SidebarActionsProps {
  onNewChat: () => void;
  onCloseSidebar?: () => void;
  onAddNewGroup: () => void;
  isSearching: boolean;
  searchQuery: string;
  searchInputRef?: RefObject<HTMLInputElement>;
  setIsSearching: (isSearching: boolean) => void;
  setSearchQuery: (query: string) => void;
  newChatShortcut?: string;
  searchChatsShortcut?: string;
  /** 活跃会话 id，用于构造携带 ?from 的新标签页链接（Cmd/Ctrl+点击时继承来源会话）。 */
  activeSessionId?: string | null;
}

const COMPACT_SHORTCUT_ORDER: Record<string, number> = {
  Ctrl: 0,
  Alt: 1,
  Opt: 1,
  Shift: 2,
  Cmd: 3,
  '⌘': 3,
  mod: 3,
  Win: 3,
};

const getCompactShortcutParts = (shortcut: string): string[] => {
  const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().includes('MAC');
  const parts = shortcut
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean);
  const modifiers = parts
    .filter((part) => COMPACT_SHORTCUT_ORDER[part] !== undefined)
    .sort((a, b) => COMPACT_SHORTCUT_ORDER[a] - COMPACT_SHORTCUT_ORDER[b]);
  const keys = parts.filter((part) => COMPACT_SHORTCUT_ORDER[part] === undefined);

  return [...modifiers, ...keys].map((part) => {
    if (part === 'Shift') return '⇧';
    if (part === 'Alt' || part === 'Opt') return isMac ? '⌥' : 'Alt';
    if (part === 'Cmd' || part === '⌘' || part === 'mod') return isMac ? '⌘' : 'Ctrl';
    if (part === 'Ctrl') return 'Ctrl';
    if (part === 'Win') return 'Win';
    return part;
  });
};

/**
 * Cherry Studio 借鉴：packages/ui/src/components/primitives/kbd.tsx
 * KbdGroup + Kbd 胶囊样式（bg-primary/10 / rounded-md / text-xs）改用 AMC 主题变量，
 * 悬停才显示（opacity-0 → group-hover:opacity-100）与 Cherry 的 tooltip/命令面板一致
 */
const ShortcutHint = ({ shortcut }: { shortcut?: string }) => {
  if (!shortcut) {
    return null;
  }

  const parts = getCompactShortcutParts(shortcut);

  return (
    <span
      aria-hidden="true"
      data-testid="sidebar-action-shortcut"
      title={shortcut}
      className="ml-auto inline-flex shrink-0 items-center gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 group-focus-within:opacity-100"
    >
      {parts.map((part, index) => (
        <kbd
          key={`${part}-${index}`}
          data-testid="sidebar-shortcut-key"
          className="pointer-events-none inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-tertiary)] px-1 font-sans text-[11px] font-medium leading-none text-[var(--theme-text-tertiary)]"
        >
          {part}
        </kbd>
      ))}
    </span>
  );
};

export const SidebarActions: React.FC<SidebarActionsProps> = ({
  onNewChat,
  onCloseSidebar,
  onAddNewGroup,
  isSearching,
  searchQuery,
  searchInputRef,
  setIsSearching,
  setSearchQuery,
  newChatShortcut,
  searchChatsShortcut,
  activeSessionId,
}) => {
  const { t } = useI18n();
  const closeSearch = () => {
    setIsSearching(false);
    setSearchQuery('');
  };

  const handleNewChatClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      e.preventDefault();
      onNewChat();
      if (window.innerWidth < DESKTOP_BREAKPOINT_PX) {
        onCloseSidebar?.();
      }
    }
  };

  return (
    <div className="px-2 pt-2 space-y-1" data-testid="sidebar-actions-stack">
      <div>
        <a
          href={buildNewTabHref(activeSessionId ?? null)}
          onClick={handleNewChatClick}
          className={SIDEBAR_ACTION_LINK_CLASS}
          aria-label={t('headerNewChatAria')}
        >
          <IconNewChat size={18} className="text-[var(--theme-text-primary)]" strokeWidth={2.2} />
          <span className="min-w-0 flex-1 truncate font-medium text-[var(--theme-text-primary)]">{t('newChat')}</span>
          <ShortcutHint shortcut={newChatShortcut} />
        </a>
      </div>
      <div>
        {isSearching ? (
          <div className="group flex items-center gap-2 w-full text-left px-3 h-9 text-sm bg-[var(--theme-bg-primary)] border border-[var(--theme-border-secondary)] rounded-lg shadow-sm transition-all duration-200 focus-within:border-[var(--theme-border-focus)] focus-within:ring-1 focus-within:ring-[var(--theme-border-focus)]">
            <Search
              size={18}
              className="text-[var(--theme-text-primary)] flex-shrink-0 transition-colors"
              strokeWidth={2.2}
            />
            <input
              ref={searchInputRef}
              type="text"
              aria-label={t('historySearchAria')}
              placeholder={t('historySearchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-transparent border-0 h-full py-0 text-sm focus:ring-0 outline-none text-[var(--theme-text-primary)] placeholder:text-[var(--theme-text-tertiary)]"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Escape') closeSearch();
              }}
            />
            <button
              onClick={closeSearch}
              className="h-6 w-6 flex items-center justify-center text-[var(--theme-text-primary)] hover:text-[var(--theme-text-primary)] rounded-md hover:bg-[var(--theme-bg-tertiary)]"
              aria-label={t('historySearchClearAria')}
            >
              <X size={14} strokeWidth={2.2} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setIsSearching(true)}
            className={SIDEBAR_ACTION_ROW_CLASS}
            aria-label={t('historySearchAria')}
          >
            <Search size={18} className="text-[var(--theme-text-primary)]" strokeWidth={2.2} />
            <span className="min-w-0 flex-1 truncate font-medium text-[var(--theme-text-primary)]">
              {t('historySearchButton')}
            </span>
            <ShortcutHint shortcut={searchChatsShortcut} />
          </button>
        )}
      </div>
      <div>
        <button onClick={onAddNewGroup} className={SIDEBAR_ACTION_ROW_CLASS} aria-label={t('newGroupAria')}>
          <IconNewGroup size={18} className="text-[var(--theme-text-primary)]" strokeWidth={2.2} />
          <span className="min-w-0 flex-1 truncate font-medium text-[var(--theme-text-primary)]">
            {t('newGroupButton')}
          </span>
        </button>
      </div>
    </div>
  );
};
