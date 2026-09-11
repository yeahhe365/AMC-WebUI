import React, { type RefObject } from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { MessageSquarePlus, SquarePen, Trash2, Eraser } from 'lucide-react';
import { DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/shared/DropdownMenu';

export interface GroupItemMenuProps {
  menuRef?: RefObject<HTMLDivElement>;
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
    <DropdownMenuContent
      ref={menuRef}
      align="end"
      sideOffset={4}
      className="w-48 p-1"
      onClick={(e) => e.stopPropagation()}
    >
      <DropdownMenuItem onClick={onNewChat} className="rounded-lg">
        <MessageSquarePlus size={14} className="text-[var(--theme-text-secondary)] shrink-0" />
        <span className="truncate">{t('historyNewChatInGroup')}</span>
      </DropdownMenuItem>
      <DropdownMenuItem onClick={onStartEdit} className="rounded-lg">
        <SquarePen size={14} className="text-[var(--theme-text-secondary)] shrink-0" />
        <span>{t('edit')}</span>
      </DropdownMenuItem>
      {onClear && (
        <DropdownMenuItem onClick={onClear} disabled={!hasSessions} className="rounded-lg">
          <Eraser size={14} className="text-[var(--theme-text-secondary)] shrink-0" />
          <span className="truncate">{t('historyClearGroup')}</span>
        </DropdownMenuItem>
      )}
      <DropdownMenuSeparator className="my-1 -mx-1 h-px bg-[var(--theme-border-secondary)]" />
      <DropdownMenuItem onClick={onDelete} variant="danger" className="rounded-lg">
        <Trash2 size={14} className="shrink-0" />
        <span>{t('delete')}</span>
      </DropdownMenuItem>
    </DropdownMenuContent>
  );
};
