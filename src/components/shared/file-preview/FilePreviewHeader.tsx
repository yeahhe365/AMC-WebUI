import { logService } from '@/services/logService';
import React, { useState, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { X, Check, Download, ClipboardCopy, Loader2, Save, Edit3 } from 'lucide-react';
import { type UploadedFile } from '@/types';
import { useI18n } from '@/contexts/I18nContext';
import { toastError } from '@/stores/toastStore';
import { createManagedObjectUrl } from '@/services/objectUrlManager';
import { triggerDownload } from '@/utils/export/core';
import { copyFileToClipboard } from '@/utils/file/fileClipboard';
import { formatFileSize } from '@/utils/file/fileSize';
import { getFileKindFlags } from '@/utils/file/fileTypeClassification';
import { getFileDisplayMeta } from '@/utils/file/fileDisplayStyles';
import { ToolbarButton, ToolbarDivider } from './FloatingToolbar';
import { Tooltip } from '@/components/shared/Tooltip';

interface FilePreviewHeaderProps {
  file: UploadedFile;
  onClose: () => void;
  isEditable?: boolean;
  onToggleEdit?: () => void;
  onSave?: () => void;
  editedName?: string;
  onNameChange?: (name: string) => void;
  className?: string;
}

export interface FilePreviewHeaderHandle {
  showCopyFeedback: () => void;
}

export const FilePreviewHeader = React.forwardRef<FilePreviewHeaderHandle, FilePreviewHeaderProps>(
  ({ file, onClose, isEditable = false, onToggleEdit, onSave, editedName, onNameChange, className = '' }, ref) => {
    const { t } = useI18n();
    const [isDownloading, setIsDownloading] = useState(false);
    const [isCopied, setIsCopied] = useState(false);
    const copyFeedbackTimeoutRef = useRef<number | null>(null);

    const { isTextFallback: isText, isAudio, isVideo, isYoutube } = getFileKindFlags(file);
    const isMermaidDiagram = file.type === 'image/svg+xml';
    const isCopyable =
      !isAudio && !isVideo && !isYoutube && (isText || file.type?.startsWith('image/') || isMermaidDiagram);
    const { Icon: FileIcon, colorClass, bgClass } = getFileDisplayMeta(file);

    const showCopyFeedback = useCallback(() => {
      setIsCopied(true);

      if (copyFeedbackTimeoutRef.current !== null) {
        window.clearTimeout(copyFeedbackTimeoutRef.current);
      }

      copyFeedbackTimeoutRef.current = window.setTimeout(() => {
        setIsCopied(false);
        copyFeedbackTimeoutRef.current = null;
      }, 2000);
    }, []);

    useImperativeHandle(ref, () => ({ showCopyFeedback }), [showCopyFeedback]);

    useEffect(() => {
      return () => {
        if (copyFeedbackTimeoutRef.current !== null) {
          window.clearTimeout(copyFeedbackTimeoutRef.current);
        }
      };
    }, []);

    const handleCopy = useCallback(async () => {
      if (!file.dataUrl || isCopied) return;
      try {
        await copyFileToClipboard(file);
        showCopyFeedback();
      } catch (copyError) {
        logService.error('Failed to copy content:', copyError);
        toastError(t('filePreviewCopyFailed'));
      }
    }, [file, isCopied, showCopyFeedback, t]);

    const handleDownload = useCallback(async () => {
      if (!file.dataUrl || isDownloading) return;

      if (isMermaidDiagram) {
        setIsDownloading(true);
        try {
          const base64Content = file.dataUrl.split(',')[1];
          const svgContent = decodeURIComponent(escape(atob(base64Content)));
          const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
          const url = createManagedObjectUrl(blob);
          const filename = `${file.name.split('.')[0] || 'diagram'}.svg`;
          triggerDownload(url, filename, true);
        } catch (svgDownloadError) {
          logService.error('Failed to download SVG:', svgDownloadError);
        } finally {
          setIsDownloading(false);
        }
        return;
      }

      setIsDownloading(true);
      try {
        triggerDownload(file.dataUrl, file.name, false);
      } catch (downloadError) {
        logService.error('Failed to initiate download:', downloadError);
      } finally {
        setIsDownloading(false);
      }
    }, [file, isDownloading, isMermaidDiagram]);

    return (
      <header
        className={`flex-shrink-0 w-full h-13 sm:h-14 bg-[#101113] border-b border-white/10 px-3 sm:px-5 flex items-center justify-between gap-3 z-40 select-none ${className}`}
      >
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 max-w-[calc(100%-160px)] sm:max-w-xl md:max-w-2xl">
          <div
            className={`p-1.5 sm:p-2 rounded-lg ${bgClass} ${colorClass} transition-colors flex-shrink-0 flex items-center justify-center shadow-xs`}
          >
            <FileIcon size={18} strokeWidth={1.75} />
          </div>
          <div className="min-w-0 flex flex-col justify-center">
            {isEditable && onNameChange ? (
              <input
                type="text"
                value={editedName}
                onChange={(e) => onNameChange(e.target.value)}
                className="bg-white/10 border border-white/20 rounded px-2 py-0.5 text-xs sm:text-sm font-medium text-white/95 focus:border-white/50 focus:bg-white/15 outline-none w-full"
                placeholder={t('filePreviewFilenamePlaceholder')}
                autoFocus
              />
            ) : (
              <Tooltip text={file.name} side="bottom" align="start" asChild>
                <span
                  className="text-xs sm:text-sm font-medium text-white/95 truncate leading-snug tracking-tight cursor-default"
                  title={file.name}
                >
                  {file.name}
                </span>
              </Tooltip>
            )}

            {!isEditable && (
              <div className="flex items-center gap-1.5 text-[11px] font-mono text-white/55 leading-none mt-0.5">
                <span className="truncate max-w-[90px] uppercase font-semibold text-white/70">
                  {file.type.split('/').pop()?.toUpperCase() || 'FILE'}
                </span>
                <span className="w-0.5 h-0.5 rounded-full bg-white/30 flex-shrink-0"></span>
                <span className="whitespace-nowrap">{formatFileSize(file.size)}</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
          {isEditable ? (
            <Tooltip text={t('filePreviewSaveChanges')} side="bottom" asChild>
              <ToolbarButton
                onClick={onSave}
                className="!text-emerald-400 hover:!bg-emerald-500/20 active:scale-95"
                title={t('filePreviewSaveChanges')}
                aria-label={t('filePreviewSaveChanges')}
              >
                <Save size={18} strokeWidth={2} />
              </ToolbarButton>
            </Tooltip>
          ) : (
            <>
              {isText && onToggleEdit && (
                <Tooltip text={t('filePreviewEditFile')} side="bottom" asChild>
                  <ToolbarButton
                    onClick={onToggleEdit}
                    title={t('filePreviewEditFile')}
                    aria-label={t('filePreviewEditFile')}
                  >
                    <Edit3 size={18} strokeWidth={1.5} />
                  </ToolbarButton>
                </Tooltip>
              )}
              {isCopyable && (
                <Tooltip text={isCopied ? t('copiedButtonTitle') : t('filePreviewCopyContent')} side="bottom" asChild>
                  <ToolbarButton
                    onClick={handleCopy}
                    disabled={isCopied}
                    data-testid="file-preview-copy-button"
                    data-copied={isCopied ? 'true' : 'false'}
                    title={isCopied ? t('copiedButtonTitle') : t('filePreviewCopyContent')}
                    aria-label={isCopied ? t('copiedButtonTitle') : t('filePreviewCopyContent')}
                  >
                    {isCopied ? (
                      <Check size={18} className="text-emerald-400" strokeWidth={2} />
                    ) : (
                      <ClipboardCopy size={18} strokeWidth={1.5} />
                    )}
                  </ToolbarButton>
                </Tooltip>
              )}
              <Tooltip
                text={isMermaidDiagram ? t('filePreviewDownloadSvg') : t('filePreviewDownloadFile')}
                side="bottom"
                asChild
              >
                <ToolbarButton
                  onClick={handleDownload}
                  disabled={isDownloading}
                  title={isMermaidDiagram ? t('filePreviewDownloadSvg') : t('filePreviewDownloadFile')}
                  aria-label={isMermaidDiagram ? t('filePreviewDownloadSvg') : t('filePreviewDownloadFile')}
                >
                  {isDownloading ? (
                    <Loader2 size={18} className="animate-spin" strokeWidth={1.5} />
                  ) : (
                    <Download size={18} strokeWidth={1.5} />
                  )}
                </ToolbarButton>
              </Tooltip>
            </>
          )}

          <ToolbarDivider />

          <Tooltip
            text={isEditable ? t('filePreviewCancelEdit') : `${t('imageZoomCloseTitle')} (Esc)`}
            side="bottom"
            asChild
          >
            <ToolbarButton
              onClick={isEditable && onToggleEdit ? onToggleEdit : onClose}
              danger
              className="!text-white/90 hover:!bg-red-500/30 hover:!text-red-200"
              aria-label={isEditable ? t('filePreviewCancelEdit') : t('imageZoomCloseAria')}
              title={isEditable ? t('filePreviewCancelEdit') : `${t('imageZoomCloseTitle')} (Esc)`}
            >
              <X size={18} strokeWidth={2} />
            </ToolbarButton>
          </Tooltip>
        </div>
      </header>
    );
  },
);

FilePreviewHeader.displayName = 'FilePreviewHeader';
