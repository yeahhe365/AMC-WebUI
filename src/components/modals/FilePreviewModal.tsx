import { logService } from '@/services/logService';
import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type UploadedFile } from '@/types';
import { ChevronLeft, ChevronRight, FileCode2, FileAudio } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { Modal } from '@/components/shared/Modal';
import { FilePreviewHeader, type FilePreviewHeaderHandle } from '@/components/shared/file-preview/FilePreviewHeader';
import { ImageViewer } from '@/components/shared/file-preview/ImageViewer';
import { TextFileViewer } from '@/components/shared/file-preview/TextFileViewer';
import { IconYoutube } from '@/components/icons';
import { copyFileToClipboard } from '@/utils/file/fileClipboard';
import { cleanupFilePreviewUrl, fileToBlobUrl } from '@/utils/file/filePreviewUrls';
import { extractDocxText, isDocxFile } from '@/utils/docxPreview';
import { useSettingsStore } from '@/stores/settingsStore';
import { isShortcutPressed } from '@/utils/keyboardShortcuts';
import { getFileKindFlags, isMarkdownFile, isTextFile } from '@/utils/file/fileTypeClassification';
import { lazyNamedComponent } from '@/utils/lazyNamedComponent';
import { interpolate } from '@/i18n/interpolate';
import { isEditableElement } from '@/utils/chat-input/focus';

const LazyPdfViewer = lazyNamedComponent(() => import('@/components/shared/file-preview/PdfViewerEntry'), 'PdfViewer');

interface FilePreviewModalProps {
  file: UploadedFile | null;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  onSaveText?: (fileId: string, content: string, newName: string) => void;
  initialEditMode?: boolean;
}

interface FilePreviewModalContentProps extends Omit<FilePreviewModalProps, 'file'> {
  file: UploadedFile;
}

const FilePreviewModalContent: React.FC<FilePreviewModalContentProps> = ({
  file,
  onClose,
  onPrev,
  onNext,
  hasPrev = false,
  hasNext = false,
  onSaveText,
  initialEditMode = false,
}) => {
  const { t } = useI18n();
  const appSettings = useSettingsStore((state) => state.appSettings);
  const currentThemeId = useSettingsStore((state) => state.currentTheme.id);
  const isDocxCandidate = isDocxFile(file);
  const [isEditing, setIsEditing] = useState(initialEditMode);
  const [editedContent, setEditedContent] = useState(file.textContent ?? '');
  const [editedName, setEditedName] = useState(file.name);
  const [textContentLoaded, setTextContentLoaded] = useState(file.textContent !== undefined);
  const [docxPreviewContent, setDocxPreviewContent] = useState<string | null>(file.textContent ?? null);
  const [docxPreviewError, setDocxPreviewError] = useState<string | null>(
    isDocxCandidate && file.textContent === undefined && !file.rawFile ? t('filePreviewWordUnavailable') : null,
  );
  const [isDocxPreviewLoading, setIsDocxPreviewLoading] = useState(false);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const filePreviewHeaderRef = useRef<FilePreviewHeaderHandle>(null);
  const previewFile = useMemo(
    () => (localPreviewUrl ? { ...file, dataUrl: localPreviewUrl } : file),
    [file, localPreviewUrl],
  );

  useEffect(() => {
    if (file.dataUrl || !(file.rawFile instanceof Blob)) {
      setLocalPreviewUrl(null);
      return;
    }

    const nextPreviewUrl = fileToBlobUrl(file.rawFile);
    setLocalPreviewUrl(nextPreviewUrl);

    return () => cleanupFilePreviewUrl({ dataUrl: nextPreviewUrl });
  }, [file]);

  const handleCopyShortcut = useCallback(async () => {
    if (!previewFile.dataUrl) return;
    try {
      await copyFileToClipboard(previewFile);
      filePreviewHeaderRef.current?.showCopyFeedback();
    } catch (copyError) {
      logService.error('Failed to copy content:', copyError);
    }
  }, [previewFile]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditing) return;

      if ((event.ctrlKey || event.metaKey) && event.key === 'c') {
        const selection = window.getSelection();
        const hasActiveSelection = !!selection && !selection.isCollapsed && selection.toString().length > 0;
        const activeElement = document.activeElement as HTMLElement | null;
        const isEditingFieldFocused = !!activeElement && isEditableElement(activeElement);

        if (hasActiveSelection || isEditingFieldFocused) {
          return;
        }

        event.preventDefault();
        void handleCopyShortcut();
        return;
      }

      if (isShortcutPressed(event, 'global.prevFile', appSettings) && hasPrev && onPrev) {
        event.preventDefault();
        onPrev();
      } else if (isShortcutPressed(event, 'global.nextFile', appSettings) && hasNext && onNext) {
        event.preventDefault();
        onNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [appSettings, handleCopyShortcut, hasNext, hasPrev, isEditing, onNext, onPrev]);

  const handleSave = useCallback(() => {
    if (!onSaveText) {
      return;
    }

    onSaveText(file.id, editedContent, editedName);
    setIsEditing(false);
  }, [editedContent, editedName, file.id, onSaveText]);

  const handleToggleEdit = useCallback(() => {
    if (isEditing) {
      setIsEditing(false);
      setEditedName(file.name);
      setEditedContent(file.textContent ?? '');
      setTextContentLoaded(file.textContent !== undefined);
      return;
    }

    setIsEditing(true);
  }, [file, isEditing]);

  const { isImage, isPdf, isVideo, isYoutube, isAudio } = getFileKindFlags(file);
  const isDocx = !isImage && !isPdf && !isVideo && !isYoutube && !isAudio && isDocxCandidate;
  const isText = !isImage && !isDocx && !isPdf && !isVideo && !isYoutube && !isAudio && isTextFile(file);
  const isMarkdown = isText && isMarkdownFile(file);

  useEffect(() => {
    let cancelled = false;

    if (!isDocx || file.textContent !== undefined) {
      return () => {
        cancelled = true;
      };
    }

    if (!file.rawFile) {
      return () => {
        cancelled = true;
      };
    }

    setIsDocxPreviewLoading(true);

    void extractDocxText(file.rawFile)
      .then(({ text }) => {
        if (cancelled) return;
        setDocxPreviewContent(text);
      })
      .catch(() => {
        if (cancelled) return;
        setDocxPreviewError(t('filePreviewWordUnavailable'));
      })
      .finally(() => {
        if (!cancelled) {
          setIsDocxPreviewLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [file, isDocx, t]);

  const navButtonClass =
    'absolute top-1/2 -translate-y-1/2 p-2 bg-black/45 hover:bg-black/70 text-white/70 hover:text-white rounded-full transition-colors z-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70';

  const getYoutubeEmbedUrl = (url: string) => {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return match && match[2].length === 11 ? `https://www.youtube.com/embed/${match[2]}` : null;
  };

  return (
    <Modal isOpen={true} onClose={onClose} noPadding backdropClassName="bg-black/95" contentClassName="w-full h-full">
      <div className="w-full h-full relative flex flex-col">
        <h2 id="file-preview-modal-title" className="sr-only">
          {interpolate(t('imageZoomTitle'), { filename: file.name })}
        </h2>

        <FilePreviewHeader
          ref={filePreviewHeaderRef}
          file={previewFile}
          onClose={onClose}
          isEditable={isEditing}
          onToggleEdit={isText && onSaveText ? handleToggleEdit : undefined}
          onSave={handleSave}
          editedName={editedName}
          onNameChange={setEditedName}
        />

        {!isEditing && hasPrev && onPrev && (
          <button
            onClick={(event) => {
              event.stopPropagation();
              onPrev();
            }}
            className={`${navButtonClass} left-2`}
            aria-label={t('filePreviewPrevious')}
          >
            <ChevronLeft size={24} />
          </button>
        )}
        {!isEditing && hasNext && onNext && (
          <button
            onClick={(event) => {
              event.stopPropagation();
              onNext();
            }}
            className={`${navButtonClass} right-2`}
            aria-label={t('filePreviewNext')}
          >
            <ChevronRight size={24} />
          </button>
        )}

        <div className="flex-grow w-full h-full overflow-hidden relative">
          {isImage ? (
            <ImageViewer file={previewFile} />
          ) : isDocxPreviewLoading ? (
            <div className="w-full h-full flex items-center justify-center text-white/70">
              {t('filePreviewLoadingWord')}
            </div>
          ) : isDocx && docxPreviewError ? (
            <div className="w-full h-full flex items-center justify-center text-white/60 px-6 text-center">
              {docxPreviewError}
            </div>
          ) : isText || isDocx ? (
            <TextFileViewer
              file={previewFile}
              renderMode={isMarkdown ? 'markdown' : 'plain'}
              themeId={currentThemeId}
              isEditable={isEditing}
              onChange={setEditedContent}
              onLoad={(content) => {
                if (!textContentLoaded) {
                  setEditedContent(content);
                  setTextContentLoaded(true);
                }
              }}
              content={
                isDocx
                  ? isEditing
                    ? editedContent
                    : docxPreviewContent
                  : isEditing && textContentLoaded
                    ? editedContent
                    : undefined
              }
            />
          ) : isPdf ? (
            <Suspense
              fallback={
                <div className="w-full h-full flex items-center justify-center text-white/70">
                  {t('filePreviewLoadingPdfViewer')}
                </div>
              }
            >
              <LazyPdfViewer file={previewFile} />
            </Suspense>
          ) : isVideo ? (
            <div className="w-full h-full flex items-center justify-center">
              {previewFile.dataUrl && (
                <video
                  src={previewFile.dataUrl}
                  controls
                  className="max-w-[90%] max-h-[80%] rounded-lg shadow-2xl outline-none"
                  playsInline
                />
              )}
            </div>
          ) : isYoutube ? (
            <div className="w-full h-full flex items-center justify-center p-4 pt-20 pb-20">
              {file.fileUri && getYoutubeEmbedUrl(file.fileUri) ? (
                <iframe
                  src={getYoutubeEmbedUrl(file.fileUri)!}
                  title={t('filePreviewYoutubePlayer')}
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="w-full h-full max-w-5xl max-h-[80vh] rounded-xl shadow-2xl bg-black"
                />
              ) : (
                <div className="text-center text-white/50">
                  <IconYoutube size={64} className="mx-auto mb-4 opacity-50" />
                  <p>{t('filePreviewInvalidYoutubeUrl')}</p>
                </div>
              )}
            </div>
          ) : isAudio ? (
            <div className="w-full h-full flex items-center justify-center p-4">
              {previewFile.dataUrl && (
                <div className="max-w-[calc(100vw-2rem)] bg-[var(--theme-bg-secondary)] p-6 sm:p-8 rounded-2xl border border-[var(--theme-border-secondary)] shadow-2xl flex flex-col items-center gap-4">
                  <div className="p-3.5 rounded-2xl bg-purple-500/10 text-purple-500 dark:text-purple-400">
                    <FileAudio size={44} strokeWidth={1.5} />
                  </div>
                  <div className="text-center max-w-sm px-2">
                    <p
                      className="text-sm font-semibold text-[var(--theme-text-primary)] truncate"
                      title={previewFile.name}
                    >
                      {previewFile.name}
                    </p>
                    <p className="text-xs text-[var(--theme-text-tertiary)] mt-1 font-mono">{previewFile.type}</p>
                  </div>
                  <audio src={previewFile.dataUrl} controls className="w-full max-w-full sm:w-[400px] outline-none" />
                </div>
              )}
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white/50 flex-col gap-2">
              <FileCode2 size={48} />
              <p>{t('filePreviewNotSupported')}</p>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};

export const FilePreviewModal: React.FC<FilePreviewModalProps> = ({
  file,
  onClose,
  onPrev,
  onNext,
  hasPrev = false,
  hasNext = false,
  onSaveText,
  initialEditMode = false,
}) => {
  if (!file) {
    return null;
  }

  return (
    <FilePreviewModalContent
      key={`${file.id}:${initialEditMode ? 'edit' : 'view'}`}
      file={file}
      onClose={onClose}
      onPrev={onPrev}
      onNext={onNext}
      hasPrev={hasPrev}
      hasNext={hasNext}
      onSaveText={onSaveText}
      initialEditMode={initialEditMode}
    />
  );
};
