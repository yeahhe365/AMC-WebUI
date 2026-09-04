import { logService } from '@/services/logService';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ClipboardCopy, Download, Edit3, Save, X } from 'lucide-react';
import { IconMarkdown } from '@/components/icons';
import { type UploadedFile } from '@/types';
import { useI18n } from '@/contexts/I18nContext';
import { Modal } from '@/components/shared/Modal';
import { ConfirmationModal } from './ConfirmationModal';
import { MarkdownFileViewer } from '@/components/shared/file-preview/MarkdownFileViewer';
import { useSettingsStore } from '@/stores/settingsStore';
import { createManagedObjectUrl } from '@/services/objectUrlManager';
import { triggerDownload } from '@/utils/export/core';

interface MarkdownPreviewModalProps {
  file: UploadedFile | null;
  onClose: () => void;
  onSaveText?: (fileId: string, content: string, newName: string) => void;
  initialEditMode?: boolean;
}

const COPY_FEEDBACK_MS = 1500;

const getDownloadUrl = (file: UploadedFile, content: string) => {
  if (file.dataUrl) return file.dataUrl;
  return createManagedObjectUrl(new Blob([content], { type: file.type || 'text/markdown' }));
};

export const MarkdownPreviewModal: React.FC<MarkdownPreviewModalProps> = ({
  file,
  onClose,
  onSaveText,
  initialEditMode = false,
}) => {
  const { t } = useI18n();
  const themeId = useSettingsStore((state) => state.currentTheme.id);
  const [isEditing, setIsEditing] = useState(initialEditMode);
  const [editedContent, setEditedContent] = useState(file?.textContent ?? '');
  const [loadedContent, setLoadedContent] = useState(file?.textContent ?? '');
  const [editedName, setEditedName] = useState(file?.name ?? '');
  const [isCopied, setIsCopied] = useState(false);
  const copyFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyFeedbackTimerRef.current) {
        clearTimeout(copyFeedbackTimerRef.current);
      }
    };
  }, []);

  const contentForActions = isEditing ? editedContent : loadedContent || file?.textContent || '';
  const savedContent = loadedContent || file?.textContent || '';
  const savedName = file?.name || '';
  const hasUnsavedChanges = isEditing && (editedContent !== savedContent || editedName !== savedName);

  const [pendingDiscardAction, setPendingDiscardAction] = useState<'close' | 'exit-edit' | null>(null);

  const runDiscardAction = useCallback(
    (action: 'close' | 'exit-edit') => {
      if (action === 'close') {
        onClose();
        return;
      }
      setEditedName(file?.name ?? '');
      setEditedContent(loadedContent || file?.textContent || '');
      setIsEditing(false);
    },
    [file, loadedContent, onClose],
  );

  const requestDiscard = useCallback(
    (action: 'close' | 'exit-edit') => {
      if (pendingDiscardAction !== null) return;
      if (!hasUnsavedChanges) {
        runDiscardAction(action);
        return;
      }
      setPendingDiscardAction(action);
    },
    [hasUnsavedChanges, pendingDiscardAction, runDiscardAction],
  );

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(contentForActions);
      setIsCopied(true);
      if (copyFeedbackTimerRef.current) {
        clearTimeout(copyFeedbackTimerRef.current);
      }
      copyFeedbackTimerRef.current = setTimeout(() => setIsCopied(false), COPY_FEEDBACK_MS);
    } catch (error) {
      logService.error('Failed to copy markdown content:', error);
    }
  }, [contentForActions]);

  const handleDownload = useCallback(() => {
    if (!file) return;

    const url = getDownloadUrl(file, contentForActions);
    triggerDownload(url, isEditing ? editedName : file.name, !file.dataUrl);
  }, [contentForActions, editedName, file, isEditing]);

  const handleSave = useCallback(() => {
    if (!file || !onSaveText) return;

    onSaveText(file.id, editedContent, editedName);
    setLoadedContent(editedContent);
    setIsEditing(false);
  }, [editedContent, editedName, file, onSaveText]);

  const handleToggleEdit = useCallback(() => {
    if (!file) return;

    if (isEditing) {
      requestDiscard('exit-edit');
      return;
    }

    setEditedContent(loadedContent || file.textContent || '');
    setEditedName(file.name);
    setIsEditing(true);
  }, [file, isEditing, loadedContent, requestDiscard]);

  const handleClose = useCallback(() => {
    requestDiscard('close');
  }, [requestDiscard]);

  if (!file) return null;

  return (
    <Modal
      isOpen={true}
      onClose={handleClose}
      noPadding
      backdropClassName="bg-black/45"
      contentClassName="w-[min(1600px,98vw)] h-[min(1000px,96vh)]"
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-secondary)] text-[var(--theme-text-primary)] shadow-2xl">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--theme-border-secondary)] bg-[var(--theme-bg-primary)] px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--theme-bg-accent)]/10 text-[var(--theme-bg-accent)]">
              <IconMarkdown size={20} strokeWidth={1.75} />
            </div>
            <div className="min-w-0">
              {isEditing ? (
                <input
                  value={editedName}
                  onChange={(event) => setEditedName(event.target.value)}
                  className="w-full rounded-lg border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-secondary)] px-2 py-1 text-sm font-semibold outline-none focus:border-[var(--theme-border-focus)]"
                  placeholder={t('filePreviewFilenamePlaceholder')}
                />
              ) : (
                <h2 className="truncate text-sm font-semibold sm:text-base">{file.name}</h2>
              )}
              <p className="text-xs text-[var(--theme-text-tertiary)]">{t('markdownPreviewDocument')}</p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {isEditing && onSaveText ? (
              <button
                type="button"
                onClick={handleSave}
                className="rounded-lg bg-[var(--theme-bg-accent)] px-3 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                <Save size={16} className="mr-1.5 inline" /> {t('filePreviewSaveChanges')}
              </button>
            ) : onSaveText ? (
              <button
                type="button"
                onClick={handleToggleEdit}
                className="rounded-lg border border-[var(--theme-border-secondary)] px-3 py-2 text-sm text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]"
              >
                <Edit3 size={16} className="mr-1.5 inline" /> {t('filePreviewEditFile')}
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleCopy}
              className="rounded-lg border border-[var(--theme-border-secondary)] p-2 text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]"
              title={t('filePreviewCopyContent')}
            >
              {isCopied ? (
                <Check size={18} className="text-[var(--theme-text-success)]" />
              ) : (
                <ClipboardCopy size={18} />
              )}
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="rounded-lg border border-[var(--theme-border-secondary)] p-2 text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)]"
              title={t('filePreviewDownloadFile')}
            >
              <Download size={18} />
            </button>
            <button
              type="button"
              onClick={isEditing ? handleToggleEdit : handleClose}
              className="rounded-lg border border-[var(--theme-border-secondary)] p-2 text-[var(--theme-text-secondary)] hover:border-[var(--theme-text-danger)]/60 hover:text-[var(--theme-text-danger)]"
              title={isEditing ? t('filePreviewCancelEdit') : t('imageZoomCloseTitle')}
            >
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1">
          <MarkdownFileViewer
            file={file}
            content={isEditing ? editedContent : undefined}
            themeId={themeId}
            isEditable={isEditing}
            onChange={setEditedContent}
            onLoad={(content) => {
              setLoadedContent(content);
              if (!editedContent) setEditedContent(content);
            }}
          />
        </div>
      </div>

      <ConfirmationModal
        isOpen={pendingDiscardAction !== null}
        onClose={() => setPendingDiscardAction(null)}
        onConfirm={() => {
          const action = pendingDiscardAction;
          setPendingDiscardAction(null);
          if (action) runDiscardAction(action);
        }}
        title={t('filePreviewDiscardUnsavedChanges')}
        message={t('filePreviewDiscardUnsavedMessage')}
        confirmLabel={t('filePreviewDiscardUnsavedConfirm')}
        cancelLabel={t('cancel')}
        isDanger
      />
    </Modal>
  );
};
