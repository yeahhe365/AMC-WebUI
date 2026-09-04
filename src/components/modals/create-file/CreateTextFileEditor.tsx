import React, { useMemo, useState } from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { useCreateFileEditor } from './useCreateFileEditor';
import { CreateFileHeader } from './CreateFileHeader';
import { CreateFileBody } from './CreateFileBody';
import { CreateFileFooter } from './CreateFileFooter';
import { PROSE_EDITING_EXTENSIONS } from './createFileExtensionOptions';
import { TextEditorModalShell } from '@/components/modals/TextEditorModalShell';
import { ConfirmationModal } from '@/components/modals/ConfirmationModal';

interface CreateTextFileEditorProps {
  onConfirm: (content: string | Blob, filename: string) => void;
  onCancel: () => void;
  isProcessing: boolean;
  isLoading: boolean;
  initialContent?: string;
  initialFilename?: string;
  themeId: string;
  isPasteRichTextAsMarkdownEnabled?: boolean;
}

const CREATE_FILE_TITLE_ID = 'create-file-editor-title';

const getSaveShortcutHint = () => {
  const platform = typeof navigator === 'undefined' ? '' : navigator.platform || navigator.userAgent;
  return /Mac|iPhone|iPad/.test(platform) ? '⌘ Enter' : 'Ctrl+Enter';
};

export const CreateTextFileEditor: React.FC<CreateTextFileEditorProps> = (props) => {
  const {
    onConfirm,
    onCancel,
    initialContent = '',
    initialFilename = '',
    themeId,
    isPasteRichTextAsMarkdownEnabled = true,
  } = props;

  const { t } = useI18n();
  const [isDiscardConfirmOpen, setIsDiscardConfirmOpen] = useState(false);
  const saveShortcutHint = useMemo(() => getSaveShortcutHint(), []);

  const {
    textContent,
    setTextContent,
    debouncedContent,
    filenameBase,
    setFilenameBase,
    extension,
    setExtension,
    isPreviewMode,
    setIsPreviewMode,
    isExportingPdf,
    pdfError,
    derivedFilename,
    isDirty,
    textareaRef,
    isEditing,
    isPdf,
    supportsRichPreview,
    handleSave,
    handleDownloadPdf,
    handlePaste,
    handleDrop,
  } = useCreateFileEditor({
    initialContent,
    initialFilename,
    onConfirm,
    themeId,
    isPasteRichTextAsMarkdownEnabled,
  });

  const isBusy = isExportingPdf;

  const handleSaveKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey)) return;
    if (event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (isBusy) return;
    void handleSave();
  };

  const requestClose = () => {
    if (isDiscardConfirmOpen) return;
    if (isDirty) {
      setIsDiscardConfirmOpen(true);
      return;
    }
    onCancel();
  };

  return (
    <>
      <TextEditorModalShell
        onClose={requestClose}
        ariaLabelledBy={CREATE_FILE_TITLE_ID}
        contentClassName="w-full h-full sm:h-[90vh] sm:w-[92vw] sm:max-w-7xl sm:rounded-xl sm:border sm:border-[var(--theme-border-primary)] sm:shadow-2xl bg-[var(--theme-bg-primary)] text-[var(--theme-text-primary)] flex flex-col overflow-hidden"
        header={
          <CreateFileHeader
            isEditing={isEditing}
            isPdf={isPdf}
            isExportingPdf={isExportingPdf}
            canDownloadPdf={!!textContent.trim()}
            supportsRichPreview={supportsRichPreview}
            isPreviewMode={isPreviewMode}
            setIsPreviewMode={setIsPreviewMode}
            handleDownloadPdf={handleDownloadPdf}
            onClose={requestClose}
            titleId={CREATE_FILE_TITLE_ID}
            filenameBase={filenameBase}
            setFilenameBase={setFilenameBase}
            filenamePlaceholder={derivedFilename || t('createTextFilenamePlaceholder')}
            extension={extension}
            setExtension={setExtension}
            onSaveKeyDown={handleSaveKeyDown}
          />
        }
        body={
          <CreateFileBody
            textContent={textContent}
            setTextContent={setTextContent}
            debouncedContent={debouncedContent}
            textareaRef={textareaRef}
            isPreviewMode={isPreviewMode}
            supportsRichPreview={supportsRichPreview}
            useMonospaceFont={!PROSE_EDITING_EXTENSIONS.includes(extension)}
            handlePaste={handlePaste}
            handleDrop={handleDrop}
            onSaveKeyDown={handleSaveKeyDown}
            themeId={themeId}
          />
        }
        footer={
          <CreateFileFooter
            onSave={() => void handleSave()}
            isEditing={isEditing}
            isExportingPdf={isExportingPdf}
            canSave={!!textContent.trim()}
            shortcutHint={saveShortcutHint}
            pdfError={pdfError}
          />
        }
      />

      <ConfirmationModal
        isOpen={isDiscardConfirmOpen}
        onClose={() => setIsDiscardConfirmOpen(false)}
        onConfirm={onCancel}
        title={t('createTextUnsavedTitle')}
        message={t('createTextUnsavedMessage')}
        confirmLabel={t('createTextUnsavedConfirm')}
        cancelLabel={t('cancel')}
        isDanger
      />
    </>
  );
};
