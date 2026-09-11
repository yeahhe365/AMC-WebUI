import React from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { SquarePen, Trash2, Pin, PinOff, Download, Copy, FolderInput, Folder, Check, Sparkles } from 'lucide-react';
import { type ChatGroup, type SavedChatSession } from '@/types';
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
} from '@/components/shared/ContextMenu';

export interface SessionItemContextMenuProps {
  session: SavedChatSession;
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

export const SessionItemContextMenu: React.FC<SessionItemContextMenuProps> = ({
  session,
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
    <ContextMenuContent
      className="w-52 p-1.5"
      onCloseAutoFocus={(e) => {
        if (isStartingEditRef.current) {
          e.preventDefault();
          isStartingEditRef.current = false;
        }
      }}
    >
      <ContextMenuItem onSelect={handleStartEdit}>
        <SquarePen size={14} className="text-[var(--theme-text-secondary)]" />
        <span>{t('edit')}</span>
        <ContextMenuShortcut>Enter</ContextMenuShortcut>
      </ContextMenuItem>

      {onRegenerateTitle && (
        <ContextMenuItem onSelect={onRegenerateTitle} disabled={isGeneratingTitle}>
          <Sparkles size={14} className="text-[var(--theme-text-secondary)]" />
          <span>{t('regenerateTitle')}</span>
        </ContextMenuItem>
      )}

      <ContextMenuItem onSelect={onTogglePin}>
        {session.isPinned ? (
          <PinOff size={14} className="text-[var(--theme-text-secondary)]" />
        ) : (
          <Pin size={14} className="text-[var(--theme-text-secondary)]" />
        )}
        <span>{session.isPinned ? t('historyUnpin') : t('historyPin')}</span>
        <ContextMenuShortcut>⌘P</ContextMenuShortcut>
      </ContextMenuItem>

      <ContextMenuItem onSelect={onDuplicate}>
        <Copy size={14} className="text-[var(--theme-text-secondary)]" />
        <span>{t('historyDuplicate')}</span>
        <ContextMenuShortcut>⌘D</ContextMenuShortcut>
      </ContextMenuItem>

      <ContextMenuItem onSelect={onExport} title={t('exportChat')}>
        <Download size={14} className="text-[var(--theme-text-secondary)]" />
        <span>{t('exportChat')}</span>
        <ContextMenuShortcut>⌘E</ContextMenuShortcut>
      </ContextMenuItem>

      <ContextMenuSeparator />

      <ContextMenuSub>
        <ContextMenuSubTrigger>
          <span className="flex items-center gap-2">
            <FolderInput size={14} className="text-[var(--theme-text-secondary)]" />
            <span>{t('historyMoveToGroup')}</span>
          </span>
        </ContextMenuSubTrigger>
        <ContextMenuSubContent className="w-48 p-1 max-h-56 overflow-y-auto custom-scrollbar">
          <ContextMenuItem onSelect={() => onMoveSessionToGroup(session.id, null)}>
            <Folder size={13} className="text-[var(--theme-text-secondary)]" />
            <span className="truncate">{t('historyMoveToUngrouped')}</span>
            {session.groupId == null && <Check className="ml-auto h-3.5 w-3.5 text-[var(--theme-text-link)]" />}
          </ContextMenuItem>
          {groups.map((group) => (
            <ContextMenuItem
              key={group.id}
              onSelect={() => onMoveSessionToGroup(session.id, group.id)}
              title={group.title}
            >
              <Folder size={13} className="shrink-0 text-[var(--theme-text-secondary)]" />
              <span className="truncate">{group.title}</span>
              {session.groupId === group.id && <Check className="ml-auto h-3.5 w-3.5 text-[var(--theme-text-link)]" />}
            </ContextMenuItem>
          ))}
        </ContextMenuSubContent>
      </ContextMenuSub>

      <ContextMenuSeparator />

      <ContextMenuItem variant="danger" onSelect={onDelete}>
        <Trash2 size={14} />
        <span>{t('delete')}</span>
        <ContextMenuShortcut>⌫</ContextMenuShortcut>
      </ContextMenuItem>
    </ContextMenuContent>
  );
};
