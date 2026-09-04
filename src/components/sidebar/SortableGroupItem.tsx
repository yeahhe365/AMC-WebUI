import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ChatGroup, SavedChatSession } from '@/types';
import { GroupItem } from './GroupItem';
import type { SessionItemPassedProps } from './sidebarTypes';

interface SortableGroupItemProps extends SessionItemPassedProps {
  group: ChatGroup;
  sessions: SavedChatSession[];
  dragOverId: string | null;
  groupDropIndicator?: { id: string; position: 'before' | 'after' } | null;
  isDragging?: boolean;
  onToggleGroupExpansion: (groupId: string) => void;
  handleGroupStartEdit: (item: ChatGroup) => void;
  handleDrop: (e: React.DragEvent, groupId: string | null) => void;
  handleDragOver: (e: React.DragEvent) => void;
  handleGroupDragOver?: (event: React.DragEvent, groupId: string) => void;
  setDragOverId: (id: string | null) => void;
  setEditingItem: (item: { type: 'session' | 'group'; id: string; title: string } | null) => void;
  onDeleteGroup: (groupId: string) => void;
  onClearGroup?: (groupId: string) => void;
  onNewChatInGroup: (groupId: string) => void;
  onReorderGroups?: (activeId: string, overId: string) => void;
  onGroupDragStart?: (groupId: string) => void;
  onGroupDragEnd?: () => void;
  editingItem: { type: 'session' | 'group'; id: string; title: string } | null;
}

export const SortableGroupItem: React.FC<SortableGroupItemProps> = (props) => {
  const { group } = props;
  const sortableId = `group:${group.id}`;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: sortableId,
    data: { type: 'group', group },
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
    zIndex: isDragging ? 10 : undefined,
  };

  // Pass dnd-kit listeners to the grip handle via props; GroupItem will apply them to the grip span.
  // We use a wrapper div that holds the sortable ref and style, and forward listeners via a prop.
  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <GroupItem {...props} dndListeners={listeners} isSortableDragging={isDragging} />
    </div>
  );
};
