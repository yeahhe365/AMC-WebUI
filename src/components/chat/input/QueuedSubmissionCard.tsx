import React from 'react';
import { GripVertical, ListOrdered, Pencil, Trash2 } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { FOCUS_VISIBLE_RING_INPUT_OFFSET_CLASS } from '@/constants/focusClasses';
import { SMALL_ICON_DANGER_BUTTON_CLASS } from '@/constants/buttonClasses';
import { COMPOSER_SHELL_RADIUS_CLASS } from '@/constants/designTokens';

interface QueuedSubmissionCardProps {
  title: string;
  previewText: string;
  fileCount: number;
  onEdit: () => void;
  onRemove: () => void;
  onDragStart?: (event: React.DragEvent) => void;
  onDragOver?: (event: React.DragEvent) => void;
  onDrop?: (event: React.DragEvent) => void;
  isDragging?: boolean;
}

const QueuedSubmissionCardComponent: React.FC<QueuedSubmissionCardProps> = ({
  title,
  previewText,
  fileCount,
  onEdit,
  onRemove,
  onDragStart,
  onDragOver,
  onDrop,
  isDragging,
}) => {
  const { t } = useI18n();
  const attachmentLabel =
    fileCount > 0
      ? `${fileCount} ${t(fileCount > 1 ? 'queuedSubmissionAttachments' : 'queuedSubmissionAttachment')}`
      : null;

  return (
    <div
      data-queued-submission-card="composer-strip"
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`flex min-h-14 items-start justify-between gap-2 border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-primary)] px-3 pb-4 pt-2 text-sm ${COMPOSER_SHELL_RADIUS_CLASS} ${
        isDragging ? 'opacity-60' : ''
      }`}
    >
      <button
        type="button"
        onClick={onEdit}
        className={`flex min-w-0 flex-1 items-center gap-2 rounded-full px-1.5 py-1 text-left text-[var(--theme-text-secondary)] transition-colors hover:bg-[var(--theme-bg-tertiary)]/55 ${FOCUS_VISIBLE_RING_INPUT_OFFSET_CLASS}`}
        aria-label={`${t('queuedSubmissionEdit')}: ${title}`}
        title={t('queuedSubmissionEdit')}
      >
        <ListOrdered size={13} strokeWidth={2} className="flex-shrink-0 text-[var(--theme-text-tertiary)]" />
        <span data-testid="queued-submission-preview" className="min-w-0 truncate">
          {previewText}
        </span>
        {attachmentLabel ? (
          <span className="hidden flex-shrink-0 rounded-full bg-[var(--theme-bg-tertiary)] px-2 py-0.5 text-xs text-[var(--theme-text-tertiary)] sm:inline">
            {attachmentLabel}
          </span>
        ) : null}
      </button>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onEdit}
          className={`inline-flex h-7 items-center gap-1 rounded-full px-2 text-xs font-medium text-[var(--theme-text-tertiary)] transition-colors hover:bg-[var(--theme-bg-tertiary)] hover:text-[var(--theme-text-primary)] ${FOCUS_VISIBLE_RING_INPUT_OFFSET_CLASS}`}
          aria-label={t('queuedSubmissionEdit')}
          title={t('queuedSubmissionEdit')}
        >
          <Pencil size={13} strokeWidth={2} />
          <span>{t('queuedSubmissionAction')}</span>
        </button>
        <button
          type="button"
          onClick={onRemove}
          className={`${SMALL_ICON_DANGER_BUTTON_CLASS} rounded-full`}
          aria-label={t('queuedSubmissionRemove')}
          title={t('queuedSubmissionRemove')}
        >
          <Trash2 size={14} strokeWidth={2} />
        </button>
        <span
          className="flex h-7 w-7 cursor-grab items-center justify-center rounded-full text-[var(--theme-text-tertiary)] transition-colors hover:bg-[var(--theme-bg-tertiary)]"
          title={t('queuedSubmissionDragAria')}
          aria-label={t('queuedSubmissionDragAria')}
        >
          <GripVertical size={13} strokeWidth={2} />
        </span>
      </div>
    </div>
  );
};

export const QueuedSubmissionCard = React.memo(QueuedSubmissionCardComponent);
