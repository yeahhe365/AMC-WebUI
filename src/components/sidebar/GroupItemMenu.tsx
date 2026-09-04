import React, { type RefObject } from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { MessageSquarePlus, SquarePen, Trash2, Eraser } from 'lucide-react';
import {
  MENU_ITEM_BUTTON_CLASS,
  MENU_ITEM_DEFAULT_STATE_CLASS,
  MENU_ITEM_DANGER_STATE_CLASS,
  MENU_PANEL_CLASS,
} from '@/constants/menuClasses';

interface GroupItemMenuProps {
  menuRef: RefObject<HTMLDivElement>;
  onNewChat: () => void;
  onStartEdit: () => void;
  onDelete: () => void;
  onClear?: () => void;
  hasSessions?: boolean;
}

export const GroupItemMenu: React.FC<GroupItemMenuProps> = ({
  menuRef,
  onNewChat,
  onStartEdit,
  onDelete,
  onClear,
  hasSessions = true,
}) => {
  const { t } = useI18n();
  return (
    <div ref={menuRef} className="relative z-10">
      <div className={`${MENU_PANEL_CLASS} -top-1`}>
        <button onClick={onNewChat} className={`${MENU_ITEM_BUTTON_CLASS} ${MENU_ITEM_DEFAULT_STATE_CLASS}`}>
          <MessageSquarePlus size={14} /> <span>{t('historyNewChatInGroup')}</span>
        </button>
        <button onClick={onStartEdit} className={`${MENU_ITEM_BUTTON_CLASS} ${MENU_ITEM_DEFAULT_STATE_CLASS}`}>
          <SquarePen size={14} /> <span>{t('edit')}</span>
        </button>
        {onClear && (
          <button
            onClick={onClear}
            disabled={!hasSessions}
            className={`${MENU_ITEM_BUTTON_CLASS} ${hasSessions ? MENU_ITEM_DEFAULT_STATE_CLASS : 'text-[var(--theme-text-tertiary)] opacity-50 cursor-not-allowed'}`}
          >
            <Eraser size={14} /> <span>{t('historyClearGroup')}</span>
          </button>
        )}
        <button onClick={onDelete} className={`${MENU_ITEM_BUTTON_CLASS} ${MENU_ITEM_DANGER_STATE_CLASS}`}>
          <Trash2 size={14} /> <span>{t('delete')}</span>
        </button>
      </div>
    </div>
  );
};
