import React, { useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { QueuedSubmissionCard } from './QueuedSubmissionCard';

/** DataTransfer type carrying a queued-submission id during a queue reorder drag. */
const QUEUED_DRAG_TYPE = 'amcqueueditem';

export interface QueuedSubmissionListView {
  title: string;
  items: Array<{
    id: string;
    previewText: string;
    fileCount: number;
  }>;
  onEditItem: (id: string) => void;
  onRemoveItem: (id: string) => void;
  onReorderItem: (activeId: string, targetIndex: number) => void;
  onClearAll: () => void;
}

export const QueuedSubmissionList: React.FC<{ view: QueuedSubmissionListView }> = ({ view }) => {
  const { t } = useI18n();
  const dragIdRef = useRef<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const handleDragStart = (event: React.DragEvent, id: string) => {
    dragIdRef.current = id;
    setDraggingId(id);
    event.dataTransfer.setData(QUEUED_DRAG_TYPE, id);
    event.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (event: React.DragEvent, id: string) => {
    if (!event.dataTransfer.types.includes(QUEUED_DRAG_TYPE)) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';

    // Insert point by row half: dropping on the upper half inserts before the
    // hovered row, the lower half after it.
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const after = event.clientY > rect.top + rect.height / 2;
    const targetIndex = view.items.findIndex((item) => item.id === id) + (after ? 1 : 0);
    event.currentTarget.setAttribute('data-drop-index', String(targetIndex));
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    const activeId = dragIdRef.current ?? event.dataTransfer.getData(QUEUED_DRAG_TYPE);
    const dropIndex = Number((event.currentTarget as HTMLElement).getAttribute('data-drop-index') ?? 0);
    if (activeId) {
      view.onReorderItem(activeId, dropIndex);
    }
    dragIdRef.current = null;
    setDraggingId(null);
    event.currentTarget.removeAttribute('data-drop-index');
  };

  return (
    <div data-queued-submission-list="true" className="relative">
      <div className="mb-1 flex items-center justify-end px-1">
        <button
          type="button"
          onClick={view.onClearAll}
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-[var(--theme-text-tertiary)] transition-colors hover:bg-[var(--theme-bg-tertiary)] hover:text-[var(--theme-text-primary)]"
          aria-label={t('queuedSubmissionClearAll')}
          title={t('queuedSubmissionClearAll')}
        >
          <X size={12} strokeWidth={2} />
          {t('queuedSubmissionClearAll')}
        </button>
      </div>
      <div className="flex max-h-[calc(3*3.5rem)] flex-col gap-1.5 overflow-y-auto custom-scrollbar">
        {view.items.map((item) => (
          <QueuedSubmissionCard
            key={item.id}
            title={view.title}
            previewText={item.previewText}
            fileCount={item.fileCount}
            onEdit={() => view.onEditItem(item.id)}
            onRemove={() => view.onRemoveItem(item.id)}
            onDragStart={(event) => handleDragStart(event, item.id)}
            onDragOver={(event) => handleDragOver(event, item.id)}
            onDrop={handleDrop}
            isDragging={item.id === draggingId}
          />
        ))}
      </div>
    </div>
  );
};
