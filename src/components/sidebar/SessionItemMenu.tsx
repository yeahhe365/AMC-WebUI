import React, { type RefObject } from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { SquarePen, Trash2, Pin, PinOff, Download, Copy, FolderInput, Folder, Check, Sparkles } from 'lucide-react';
import { type ChatGroup, type SavedChatSession } from '@/types';
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from '@/components/shared/DropdownMenu';

export interface SessionItemMenuProps {
  session: SavedChatSession;
  menuRef?: RefObject<HTMLDivElement>;
  groups: ChatGroup[];
  onMoveSessionToGroup: (sessionId: string, groupId: string | null) => void;
  onStartEdit: () => void;
  onTogglePin: () => void;
  onDuplicate: () => void;
  onExport: () => void;
  onDelete: () => void;
  onRegenerateTitle?: () => void;
  isGeneratingTitle?: boolean;
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
  onRegenerateTitle,
  isGeneratingTitle = false,
}) => {
  const { t } = useI18n();
  const isStartingEditRef = React.useRef(false);

  const handleStartEdit = () => {
    isStartingEditRef.current = true;
    onStartEdit();
  };

  return (
    <DropdownMenuContent
      ref={menuRef}
      align="end"
      sideOffset={4}
      className="w-52 p-1.5"
      onClick={(e) => e.stopPropagation()}
      onCloseAutoFocus={(e) => {
        if (isStartingEditRef.current) {
          e.preventDefault();
          isStartingEditRef.current = false;
        }
      }}
    >
      <DropdownMenuItem onSelect={handleStartEdit}>
        <SquarePen size={14} className="text-[var(--theme-text-secondary)]" />
        <span>{t('edit')}</span>
        <DropdownMenuShortcut>Enter</DropdownMenuShortcut>
      </DropdownMenuItem>

      {onRegenerateTitle && (
        <DropdownMenuItem onSelect={onRegenerateTitle} disabled={isGeneratingTitle}>
          <Sparkles size={14} className="text-[var(--theme-text-secondary)]" />
          <span>{t('regenerateTitle')}</span>
        </DropdownMenuItem>
      )}

      <DropdownMenuItem onSelect={onTogglePin}>
        {session.isPinned ? (
          <PinOff size={14} className="text-[var(--theme-text-secondary)]" />
        ) : (
          <Pin size={14} className="text-[var(--theme-text-secondary)]" />
        )}
        <span>{session.isPinned ? t('historyUnpin') : t('historyPin')}</span>
        <DropdownMenuShortcut>⌘P</DropdownMenuShortcut>
      </DropdownMenuItem>

      <DropdownMenuItem onSelect={onDuplicate}>
        <Copy size={14} className="text-[var(--theme-text-secondary)]" />
        <span>{t('historyDuplicate')}</span>
        <DropdownMenuShortcut>⌘D</DropdownMenuShortcut>
      </DropdownMenuItem>

      <DropdownMenuItem onSelect={onExport} title={t('exportChat')}>
        <Download size={14} className="text-[var(--theme-text-secondary)]" />
        <span>{t('exportChat')}</span>
        <DropdownMenuShortcut>⌘E</DropdownMenuShortcut>
      </DropdownMenuItem>

      <DropdownMenuSeparator />

      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <span className="flex items-center gap-2">
            <FolderInput size={14} className="text-[var(--theme-text-secondary)]" />
            <span>{t('historyMoveToGroup')}</span>
          </span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="w-48 p-1 max-h-56 overflow-y-auto custom-scrollbar">
          <DropdownMenuItem onSelect={() => onMoveSessionToGroup(session.id, null)}>
            <Folder size={13} className="text-[var(--theme-text-secondary)]" />
            <span className="truncate">{t('historyMoveToUngrouped')}</span>
            {session.groupId == null && <Check className="ml-auto h-3.5 w-3.5 text-[var(--theme-text-link)]" />}
          </DropdownMenuItem>
          {groups.map((group) => (
            <DropdownMenuItem
              key={group.id}
              onSelect={() => onMoveSessionToGroup(session.id, group.id)}
              title={group.title}
            >
              <Folder size={13} className="shrink-0 text-[var(--theme-text-secondary)]" />
              <span className="truncate">{group.title}</span>
              {session.groupId === group.id && <Check className="ml-auto h-3.5 w-3.5 text-[var(--theme-text-link)]" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuSub>

      <DropdownMenuSeparator />

      <DropdownMenuItem variant="danger" onSelect={onDelete}>
        <Trash2 size={14} />
        <span>{t('delete')}</span>
        <DropdownMenuShortcut>⌫</DropdownMenuShortcut>
      </DropdownMenuItem>
    </DropdownMenuContent>
  );
};
