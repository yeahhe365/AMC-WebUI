import React, { type RefObject, useState } from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { SquarePen, Trash2, Pin, PinOff, Download, Copy, FolderInput, Folder } from 'lucide-react';
import { type ChatGroup, type SavedChatSession } from '@/types';
import {
  MENU_ITEM_BUTTON_CLASS,
  MENU_ITEM_DEFAULT_STATE_CLASS,
  MENU_ITEM_DANGER_STATE_CLASS,
  MENU_PANEL_CLASS,
} from '@/constants/menuClasses';

interface SessionItemMenuProps {
  session: SavedChatSession;
  menuRef: RefObject<HTMLDivElement>;
  groups: ChatGroup[];
  onMoveSessionToGroup: (sessionId: string, groupId: string | null) => void;
  onStartEdit: () => void;
  onTogglePin: () => void;
  onDuplicate: () => void;
  onExport: () => void;
  onDelete: () => void;
}

export const SessionItemMenu: React.FC<SessionItemMenuProps> = ({
  session,
  menuRef,
  groups,
  onMoveSessionToGroup,
  onStartEdit,
  onTogglePin,
  onDuplicate,
  onExport,
  onDelete,
}) => {
  const { t } = useI18n();
  const [showMoveSubmenu, setShowMoveSubmenu] = useState(false);

  return (
    <div ref={menuRef} className={`${MENU_PANEL_CLASS} top-9 z-10`}>
      <button onClick={onStartEdit} className={`${MENU_ITEM_BUTTON_CLASS} ${MENU_ITEM_DEFAULT_STATE_CLASS}`}>
        <SquarePen size={14} /> <span>{t('edit')}</span>
      </button>
      <button onClick={onTogglePin} className={`${MENU_ITEM_BUTTON_CLASS} ${MENU_ITEM_DEFAULT_STATE_CLASS}`}>
        {session.isPinned ? <PinOff size={14} /> : <Pin size={14} />}{' '}
        <span>{session.isPinned ? t('historyUnpin') : t('historyPin')}</span>
      </button>
      <button onClick={onDuplicate} className={`${MENU_ITEM_BUTTON_CLASS} ${MENU_ITEM_DEFAULT_STATE_CLASS}`}>
        <Copy size={14} /> <span>{t('historyDuplicate')}</span>
      </button>
      <button
        onClick={onExport}
        className={`${MENU_ITEM_BUTTON_CLASS} ${MENU_ITEM_DEFAULT_STATE_CLASS}`}
        title={t('exportChat')}
      >
        <Download size={14} /> <span>{t('exportChat')}</span>
      </button>

      <div className="my-1 border-t border-[var(--theme-border-secondary)]" />

      <div className="px-1">
        <button
          onClick={() => setShowMoveSubmenu((prev) => !prev)}
          className={`${MENU_ITEM_BUTTON_CLASS} ${MENU_ITEM_DEFAULT_STATE_CLASS} rounded-md justify-between`}
        >
          <span className="flex items-center gap-2">
            <FolderInput size={14} /> {t('historyMoveToGroup')}
          </span>
          <span className="text-xs opacity-60">{showMoveSubmenu ? '−' : '+'}</span>
        </button>
        {showMoveSubmenu && (
          <div className="mt-1 max-h-40 overflow-y-auto rounded-md border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-secondary)] p-1 custom-scrollbar">
            <button
              onClick={() => {
                onMoveSessionToGroup(session.id, null);
                setShowMoveSubmenu(false);
              }}
              className={`${MENU_ITEM_BUTTON_CLASS} ${MENU_ITEM_DEFAULT_STATE_CLASS} rounded-md text-xs ${session.groupId == null ? 'bg-[var(--theme-bg-tertiary)] font-medium' : ''}`}
            >
              <Folder size={12} /> {t('historyMoveToUngrouped')}
            </button>
            {groups.map((group) => (
              <button
                key={group.id}
                onClick={() => {
                  onMoveSessionToGroup(session.id, group.id);
                  setShowMoveSubmenu(false);
                }}
                className={`${MENU_ITEM_BUTTON_CLASS} ${MENU_ITEM_DEFAULT_STATE_CLASS} rounded-md text-xs truncate ${session.groupId === group.id ? 'bg-[var(--theme-bg-tertiary)] font-medium' : ''}`}
                title={group.title}
              >
                <Folder size={12} className="shrink-0" /> <span className="truncate">{group.title}</span>
              </button>
            ))}
            {groups.length === 0 && (
              <span className="px-2 py-1 text-xs text-[var(--theme-text-tertiary)]">{t('historyMoveToUngrouped')}</span>
            )}
          </div>
        )}
      </div>

      <div className="my-1 border-t border-[var(--theme-border-secondary)]" />
      <button onClick={onDelete} className={`${MENU_ITEM_BUTTON_CLASS} ${MENU_ITEM_DANGER_STATE_CLASS}`}>
        <Trash2 size={14} /> <span>{t('delete')}</span>
      </button>
    </div>
  );
};
