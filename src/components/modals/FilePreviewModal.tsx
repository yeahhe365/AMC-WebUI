import { logService } from '@/services/logService';
import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type UploadedFile } from '@/types';
import { ChevronLeft, ChevronRight, FileCode2 } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { Modal } from '@/components/shared/Modal';
import { FilePreviewHeader, type FilePreviewHeaderHandle } from '@/components/shared/file-preview/FilePreviewHeader';
import { ImageViewer } from '@/components/shared/file-preview/ImageViewer';
import { TextFileViewer } from '@/components/shared/file-preview/TextFileViewer';
import { VideoPlayer, type VideoPlayerHandle } from '@/components/shared/file-preview/VideoPlayer';
import { AudioPreviewViewer } from '@/components/shared/file-preview/AudioPreviewViewer';
import { DocxViewer } from '@/components/shared/file-preview/DocxViewer';
import { SpreadsheetViewer } from '@/components/shared/file-preview/SpreadsheetViewer';
import { ZipViewer } from '@/components/shared/file-preview/ZipViewer';
import { IconYoutube } from '@/components/icons';
import { copyFileToClipboard } from '@/utils/file/fileClipboard';
import { cleanupFilePreviewUrl, fileToBlobUrl } from '@/utils/file/filePreviewUrls';
import { extractDocxText, isDocxFile } from '@/utils/docxPreview';
import { useSettingsStore } from '@/stores/settingsStore';
import { isShortcutPressed } from '@/utils/keyboardShortcuts';
import {
  getFileKindFlags,
  isArchiveFile,
  isMarkdownFile,
  isSpreadsheetFile,
  isTextFile,
} from '@/utils/file/fileTypeClassification';
import { toYoutubeEmbedUrl } from '@/utils/file/youtubeUrl';
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
  onConvertToContext?: (contextFile: File) => void | Promise<void>;
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
  onConvertToContext,
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
  const [docxViewMode, setDocxViewMode] = useState<'rich' | 'text'>('rich');
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [videoAspect, setVideoAspect] = useState<number | null>(null);
  const [areControlsVisible, setAreControlsVisible] = useState(true);
  const filePreviewHeaderRef = useRef<FilePreviewHeaderHandle>(null);
  const videoPlayerRef = useRef<VideoPlayerHandle>(null);
  const modalShellRef = useRef<HTMLDivElement>(null);
  const previewFile = useMemo(
    () => (localPreviewUrl ? { ...file, dataUrl: localPreviewUrl } : file),
    [file, localPreviewUrl],
  );

  useEffect(() => {
    setVideoAspect(null);
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
  const isSpreadsheet =
    !isImage && !isPdf && !isVideo && !isYoutube && !isAudio && (isSpreadsheetFile?.(file) ?? false);
  const isArchive = !isImage && !isPdf && !isVideo && !isYoutube && !isAudio && (isArchiveFile?.(file) ?? false);
  const isText =
    !isImage &&
    !isDocx &&
    !isSpreadsheet &&
    !isArchive &&
    !isPdf &&
    !isVideo &&
    !isYoutube &&
    !isAudio &&
    isTextFile(file);
  const isMarkdown = isText && isMarkdownFile(file);
  const youtubeEmbedUrl = isYoutube ? toYoutubeEmbedUrl(file.fileUri || file.name) : null;

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
    'absolute top-1/2 -translate-y-1/2 p-2.5 sm:p-3 bg-black/70 hover:bg-black/90 text-white/80 hover:text-white rounded-full transition-all duration-200 z-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 shadow-xl hover:scale-105 border border-white/10';

  const handleModalMouseMove = useCallback(() => {
    if (!areControlsVisible) {
      setAreControlsVisible(true);
    }
    videoPlayerRef.current?.wakeControls?.();
  }, [areControlsVisible]);

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      noPadding
      backdropClassName="bg-black/90 backdrop-blur-2xl"
      contentClassName="w-full h-full"
      initialFocusRef={modalShellRef}
    >
      <div
        ref={modalShellRef}
        tabIndex={-1}
        className="w-full h-full relative flex flex-col outline-none"
        onMouseMove={handleModalMouseMove}
      >
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
          className={`transition-opacity duration-300 ${
            isVideo && !areControlsVisible ? 'opacity-0 pointer-events-none' : 'opacity-100'
          }`}
        />

        {!isEditing && hasPrev && onPrev && (
          <button
            onClick={(event) => {
              event.stopPropagation();
              onPrev();
            }}
            className={`${navButtonClass} left-2 transition-opacity duration-300 ${
              isVideo && !areControlsVisible ? 'opacity-0 pointer-events-none' : 'opacity-100'
            }`}
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
            className={`${navButtonClass} right-2 transition-opacity duration-300 ${
              isVideo && !areControlsVisible ? 'opacity-0 pointer-events-none' : 'opacity-100'
            }`}
            aria-label={t('filePreviewNext')}
          >
            <ChevronRight size={24} />
          </button>
        )}

        <div className="flex-grow w-full min-h-0 overflow-hidden relative">
          {isImage ? (
            <ImageViewer file={previewFile} />
          ) : isDocx ? (
            docxViewMode === 'rich' && file.rawFile && !isEditing ? (
              <div className="w-full h-full flex flex-col relative">
                <div className="flex-shrink-0 flex items-center justify-end px-4 py-2 border-b border-[var(--theme-border-secondary)]/50 bg-[var(--theme-bg-secondary)]/40 backdrop-blur-xs z-20">
                  <button
                    type="button"
                    onClick={() => setDocxViewMode('text')}
                    className="px-2.5 py-1 text-xs rounded-lg bg-[var(--theme-bg-secondary)] border border-[var(--theme-border-secondary)] text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] shadow-2xs transition-all font-medium cursor-pointer"
                  >
                    切换至纯文本模式
                  </button>
                </div>
                <div className="flex-1 min-h-0 overflow-hidden">
                  <DocxViewer file={previewFile} />
                </div>
              </div>
            ) : isDocxPreviewLoading ? (
              <div className="w-full h-full flex items-center justify-center text-white/70">
                {t('filePreviewLoadingWord')}
              </div>
            ) : docxPreviewError ? (
              <div className="w-full h-full flex items-center justify-center text-white/60 px-6 text-center">
                {docxPreviewError}
              </div>
            ) : (
              <div className="w-full h-full flex flex-col relative">
                {file.rawFile && !isEditing && (
                  <div className="flex-shrink-0 flex items-center justify-end px-4 py-2 border-b border-[var(--theme-border-secondary)]/50 bg-[var(--theme-bg-secondary)]/40 backdrop-blur-xs z-20">
                    <button
                      type="button"
                      onClick={() => setDocxViewMode('rich')}
                      className="px-2.5 py-1 text-xs rounded-lg bg-[var(--theme-bg-secondary)] border border-[var(--theme-border-secondary)] text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] shadow-2xs transition-all font-medium cursor-pointer"
                    >
                      切换至高保真排版
                    </button>
                  </div>
                )}
                <div className="flex-1 min-h-0 overflow-hidden">
                  <TextFileViewer
                    file={previewFile}
                    renderMode="plain"
                    themeId={currentThemeId}
                    isEditable={isEditing}
                    onChange={setEditedContent}
                    content={isEditing ? editedContent : docxPreviewContent}
                  />
                </div>
              </div>
            )
          ) : isSpreadsheet ? (
            <SpreadsheetViewer file={previewFile} />
          ) : isArchive ? (
            <ZipViewer file={previewFile} onConvertToContext={onConvertToContext} />
          ) : isText ? (
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
              content={isEditing && textContentLoaded ? editedContent : undefined}
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
            <div className="w-full h-full flex items-center justify-center p-2 sm:p-6 lg:p-8">
              {previewFile.dataUrl && (
                <div
                  className="relative w-full max-w-7xl max-h-[88vh] rounded-2xl shadow-2xl overflow-hidden bg-black/95 ring-1 ring-white/15 flex items-center justify-center transition-all duration-300"
                  style={videoAspect ? { aspectRatio: `${videoAspect}` } : undefined}
                >
                  <VideoPlayer
                    ref={videoPlayerRef}
                    src={previewFile.dataUrl}
                    file={previewFile}
                    testId="file-preview-video"
                    showSegmentBar={false}
                    onControlsVisibilityChange={setAreControlsVisible}
                    onLoadedMetadata={(e) => {
                      const v = e.currentTarget;
                      if (v.videoWidth && v.videoHeight) {
                        setVideoAspect(v.videoWidth / v.videoHeight);
                      }
                    }}
                  />
                </div>
              )}
            </div>
          ) : isYoutube ? (
            <div className="w-full h-full flex items-center justify-center p-2 sm:p-6 lg:p-8">
              {youtubeEmbedUrl ? (
                <iframe
                  src={youtubeEmbedUrl}
                  title={t('filePreviewYoutubePlayer')}
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="w-full max-w-7xl max-h-[88vh] aspect-video rounded-2xl shadow-2xl ring-1 ring-white/15 bg-black"
                />
              ) : (
                <div className="text-center text-white/50">
                  <IconYoutube size={64} className="mx-auto mb-4 opacity-50" />
                  <p>{t('filePreviewInvalidYoutubeUrl')}</p>
                </div>
              )}
            </div>
          ) : isAudio ? (
            previewFile.dataUrl ? (
              <AudioPreviewViewer file={previewFile} />
            ) : null
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
