import { logService } from '@/services/logService';
import React, { useState, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import {
  X,
  Check,
  Download,
  ClipboardCopy,
  Loader2,
  FileText,
  ImageIcon,
  FileVideo,
  FileAudio,
  FileCode2,
  Save,
  Edit3,
} from 'lucide-react';
import { type UploadedFile } from '@/types';
import { useI18n } from '@/contexts/I18nContext';
import { toastError } from '@/stores/toastStore';
import { createManagedObjectUrl } from '@/services/objectUrlManager';
import { triggerDownload } from '@/utils/export/core';
import { copyFileToClipboard } from '@/utils/file/fileClipboard';
import { formatFileSize } from '@/utils/file/fileSize';
import { getFileKindFlags } from '@/utils/file/fileTypeClassification';
import { FloatingToolbar, ToolbarButton, ToolbarDivider } from './FloatingToolbar';

interface FilePreviewHeaderProps {
  file: UploadedFile;
  onClose: () => void;
  isEditable?: boolean;
  onToggleEdit?: () => void;
  onSave?: () => void;
  editedName?: string;
  onNameChange?: (name: string) => void;
}

export interface FilePreviewHeaderHandle {
  showCopyFeedback: () => void;
}

export const FilePreviewHeader = React.forwardRef<FilePreviewHeaderHandle, FilePreviewHeaderProps>(
  ({ file, onClose, isEditable = false, onToggleEdit, onSave, editedName, onNameChange }, ref) => {
    const { t } = useI18n();
    const [isDownloading, setIsDownloading] = useState(false);
    const [isCopied, setIsCopied] = useState(false);
    const copyFeedbackTimeoutRef = useRef<number | null>(null);

    const { isImage, isPdf, isVideo, isAudio, isTextFallback: isText } = getFileKindFlags(file);
    const isMermaidDiagram = file.type === 'image/svg+xml';

    const FileIcon = isImage ? ImageIcon : isPdf ? FileText : isVideo ? FileVideo : isAudio ? FileAudio : FileCode2;

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
      <div className="absolute top-0 left-0 right-0 p-4 sm:p-6 flex flex-row items-start justify-between gap-3 z-50 pointer-events-none">
        <FloatingToolbar className="pointer-events-auto pl-2 pr-4 py-1.5 max-w-[calc(100%-140px)] sm:max-w-md group/info">
          <div className="bg-white/10 p-1.5 rounded-full text-white/90 group-hover/info:bg-white/20 transition-colors flex-shrink-0">
            <FileIcon size={16} strokeWidth={1.5} />
          </div>
          <div className="min-w-0 flex flex-col justify-center ml-2">
            {isEditable && onNameChange ? (
              <input
                type="text"
                value={editedName}
                onChange={(e) => onNameChange(e.target.value)}
                className="bg-transparent border-b border-white/20 text-xs sm:text-sm font-medium text-white/90 focus:border-white/50 outline-none w-full"
                placeholder={t('filePreviewFilenamePlaceholder')}
                autoFocus
              />
            ) : (
              <span className="text-xs sm:text-sm font-medium text-white/90 truncate leading-tight" title={file.name}>
                {file.name}
              </span>
            )}

            {!isEditable && (
              <div className="flex items-center gap-1.5 text-xs font-mono text-white/50 leading-none mt-0.5">
                <span className="truncate max-w-[60px]">{file.type.split('/').pop()?.toUpperCase()}</span>
                <span className="w-0.5 h-0.5 rounded-full bg-white/30 flex-shrink-0"></span>
                <span className="whitespace-nowrap">{formatFileSize(file.size)}</span>
              </div>
            )}
          </div>
        </FloatingToolbar>

        <FloatingToolbar className="pointer-events-auto p-1">
          {isEditable ? (
            <ToolbarButton
              onClick={onSave}
              className="!text-green-400 hover:!bg-green-500/20"
              title={t('filePreviewSaveChanges')}
            >
              <Save size={18} strokeWidth={2} />
            </ToolbarButton>
          ) : (
            <>
              {isText && onToggleEdit && (
                <ToolbarButton onClick={onToggleEdit} title={t('filePreviewEditFile')}>
                  <Edit3 size={18} strokeWidth={1.5} />
                </ToolbarButton>
              )}
              <ToolbarButton
                onClick={handleCopy}
                disabled={isCopied}
                title={isCopied ? t('copiedButtonTitle') : t('filePreviewCopyContent')}
              >
                {isCopied ? (
                  <Check size={18} className="text-green-400" strokeWidth={2} />
                ) : (
                  <ClipboardCopy size={18} strokeWidth={1.5} />
                )}
              </ToolbarButton>
              <ToolbarButton
                onClick={handleDownload}
                disabled={isDownloading}
                title={isMermaidDiagram ? t('filePreviewDownloadSvg') : t('filePreviewDownloadFile')}
              >
                {isDownloading ? (
                  <Loader2 size={18} className="animate-spin" strokeWidth={1.5} />
                ) : (
                  <Download size={18} strokeWidth={1.5} />
                )}
              </ToolbarButton>
            </>
          )}

          <ToolbarDivider />

          <ToolbarButton
            onClick={isEditable && onToggleEdit ? onToggleEdit : onClose}
            danger
            aria-label={isEditable ? t('filePreviewCancelEdit') : t('imageZoomCloseAria')}
            title={isEditable ? t('filePreviewCancelEdit') : t('imageZoomCloseTitle')}
          >
            <X size={18} strokeWidth={1.5} />
          </ToolbarButton>
        </FloatingToolbar>
      </div>
    );
  },
);

FilePreviewHeader.displayName = 'FilePreviewHeader';
