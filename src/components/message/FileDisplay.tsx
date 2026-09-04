import { logService } from '@/services/logService';
import React, { useState } from 'react';
import { type UploadedFile } from '@/types';
import { Check, Copy, Download, SlidersHorizontal, Scissors, Loader2, X } from 'lucide-react';
import { triggerDownload } from '@/utils/export/core';
import { CATEGORY_STYLES, getResolutionColor } from '@/utils/file/fileDisplayStyles';
import { formatFileSize } from '@/utils/file/fileSize';
import { getFileCardMeta } from '@/components/shared/file-preview/fileCardMeta';
import { useI18n } from '@/contexts/I18nContext';
import { FileThumbnail } from '@/components/chat/input/files/FileThumbnail';
import { interpolate } from '@/i18n/interpolate';

interface FileDisplayProps {
  file: UploadedFile;
  onFileClick?: (file: UploadedFile) => void;
  isFromMessageList?: boolean;
  isGridView?: boolean;
  isStripView?: boolean;
  onConfigure?: () => void;
  isGemini3?: boolean;
}

const COPIED_STATE_DURATION_MS = 2000;
const MIN_DISPLAY_EXTENSION_LENGTH = 2;
const MAX_DISPLAY_EXTENSION_LENGTH = 4;
const MAX_MIME_SUBTYPE_DISPLAY_LENGTH = 8;

const formatDisplayFileName = (fileName: string): string => {
  const recordingMatch = fileName.match(/^recording-\d{4}-\d{2}-\d{2}-(\d{2})(\d{2})(\d{2})(\.[^.]+)$/);
  if (recordingMatch) {
    return `rec-${recordingMatch[1]}:${recordingMatch[2]}:${recordingMatch[3]}${recordingMatch[4]}`;
  }
  return fileName;
};

const getFileExtensionLabel = (name: string): string | undefined => {
  if (!name.includes('.')) return undefined;

  const extension = name.split('.').pop()?.toUpperCase();
  const hasDisplayLength =
    extension && extension.length >= MIN_DISPLAY_EXTENSION_LENGTH && extension.length <= MAX_DISPLAY_EXTENSION_LENGTH;

  return hasDisplayLength ? extension : undefined;
};

const getDisplayType = (mimeType: string, name: string) => {
  const extensionLabel = getFileExtensionLabel(name);
  if (extensionLabel) return extensionLabel;

  if (mimeType.includes('pdf')) return 'PDF';
  if (mimeType.includes('word') || mimeType.includes('document')) return 'DOC';
  if (mimeType.includes('sheet') || mimeType.includes('excel')) return 'XLS';
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'PPT';
  if (mimeType.includes('zip') || mimeType.includes('compressed')) return 'ZIP';
  if (mimeType.includes('csv')) return 'CSV';
  if (mimeType.includes('json')) return 'JSON';
  if (mimeType.includes('html')) return 'HTML';
  if (mimeType.includes('javascript')) return 'JS';
  if (mimeType.includes('python')) return 'PY';

  const subtype = mimeType.split('/').pop()?.toUpperCase() || 'FILE';
  return subtype.length > MAX_MIME_SUBTYPE_DISPLAY_LENGTH
    ? subtype.substring(0, MAX_MIME_SUBTYPE_DISPLAY_LENGTH)
    : subtype;
};

export const FileDisplay: React.FC<FileDisplayProps> = ({
  file,
  onFileClick,
  isFromMessageList,
  isGridView,
  isStripView,
  onConfigure,
  isGemini3,
}) => {
  const { t } = useI18n();
  const [idCopied, setIdCopied] = useState(false);

  const isUploading = file.uploadState === 'uploading';
  const isProcessing = file.uploadState === 'processing_api' || file.isProcessing;
  const uploadPercent = Math.max(0, Math.min(100, Math.round(file.progress ?? 0)));

  const handleCancelUpload = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (file.abortController) {
      file.abortController.abort();
    }
  };

  const hasPreviewSource = !!file.dataUrl || file.rawFile instanceof Blob;
  const isClickable = file.uploadState === 'active' && !file.error && !!onFileClick && hasPreviewSource;
  const { category, canConfigure, ConfigIcon } = getFileCardMeta(file, {
    isGemini3,
    includeTextEditing: false,
    requireActiveForConfigure: false,
    canConfigure: !!onConfigure,
  });

  const handleCopyId = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (!file.fileApiName) return;
    navigator.clipboard
      .writeText(file.fileApiName)
      .then(() => {
        setIdCopied(true);
        setTimeout(() => setIdCopied(false), COPIED_STATE_DURATION_MS);
      })
      .catch((error) => logService.error('Failed to copy file ID:', error));
  };

  const handleDownloadFile = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (!file.dataUrl) return;

    const filename = file.name || 'download';
    triggerDownload(file.dataUrl, filename, false);
  };

  const handleClick = (event: React.MouseEvent) => {
    if (isClickable) {
      event.stopPropagation();
      onFileClick(file);
    }
  };

  if (category === 'image' && file.dataUrl && !file.error) {
    return (
      <div
        className={`relative group rounded-xl overflow-hidden border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-primary)] shadow-sm transition-all hover:shadow-md ${isGridView || isStripView ? 'w-full h-full' : 'w-fit max-w-full sm:max-w-md'}`}
      >
        <img
          src={file.dataUrl}
          alt={file.name}
          className={`block ${isGridView ? 'w-full h-full object-cover aspect-square' : isStripView ? 'w-full h-full object-cover' : 'w-auto h-auto max-w-full max-h-56 object-contain'} ${isClickable ? 'cursor-pointer hover:opacity-95 transition-opacity' : ''}`}
          aria-label={`Uploaded image: ${file.name}`}
          onClick={handleClick}
        />
        {(isUploading || isProcessing) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-[1px] z-20 p-2">
            <Loader2 size={24} className="animate-spin text-white mb-1.5" />
            {isUploading && (
              <span className="text-xs text-white font-medium drop-shadow-sm">
                {interpolate(t('selectedFileUploading'), { percent: String(uploadPercent) })}
              </span>
            )}
            {isUploading && file.uploadSpeed && (
              <span className="text-[10px] text-white/80 mt-0.5">{file.uploadSpeed}</span>
            )}
            {isUploading && (
              <div className="w-3/4 h-1.5 bg-black/30 rounded-full mt-2 overflow-hidden">
                <div
                  className="h-full bg-[var(--theme-text-link)] transition-all duration-300 rounded-full"
                  style={{ width: `${uploadPercent}%` }}
                />
              </div>
            )}
            {isProcessing && (
              <span className="text-xs text-white/90 font-medium">{t('selectedFileProcessingGemini')}</span>
            )}
          </div>
        )}
        {isUploading && file.abortController && (
          <button
            type="button"
            onClick={handleCancelUpload}
            title={t('cancel')}
            className="absolute top-2 right-2 z-30 p-1 rounded-full bg-black/60 hover:bg-black/80 text-white transition-colors"
          >
            <X size={14} strokeWidth={2} />
          </button>
        )}
        {isFromMessageList && (
          <div className="absolute top-2 right-2 flex gap-1 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity">
            {canConfigure ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  if (onConfigure) {
                    onConfigure();
                  }
                }}
                title={
                  file.mediaResolution
                    ? interpolate(t('filePreviewConfigureResolution'), { resolution: file.mediaResolution })
                    : t('selectedFileConfigureFile')
                }
                className={`p-1.5 rounded-full bg-black/75 hover:bg-black/90 transition-colors ${getResolutionColor(file.mediaResolution)}`}
              >
                <ConfigIcon size={14} strokeWidth={2} />
              </button>
            ) : file.mediaResolution ? (
              <div
                className={`p-1.5 rounded-full bg-black/75 ${getResolutionColor(file.mediaResolution)}`}
                title={interpolate(t('filePreviewResolutionLabel'), { resolution: file.mediaResolution })}
              >
                <SlidersHorizontal size={14} strokeWidth={2} />
              </div>
            ) : null}

            {(file.name.startsWith('generated-image-') || file.name.startsWith('edited-image-')) && (
              <button
                type="button"
                onClick={handleDownloadFile}
                title={t('filePreviewDownloadImage')}
                className="p-1.5 rounded-full bg-black/75 hover:bg-black/90 text-white transition-colors"
              >
                <Download size={14} strokeWidth={2} />
              </button>
            )}
            {file.fileApiName && file.uploadState === 'active' && (
              <button
                type="button"
                onClick={handleCopyId}
                title={idCopied ? t('selectedFileIdCopied') : t('selectedFileCopyFileId')}
                className={`p-1.5 rounded-full bg-black/75 hover:bg-black/90 transition-colors ${idCopied ? 'text-green-400' : 'text-white'}`}
              >
                {idCopied ? <Check size={14} strokeWidth={2} /> : <Copy size={14} strokeWidth={2} />}
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  const { Icon, colorClass, bgClass } = CATEGORY_STYLES[category] || CATEGORY_STYLES['text'];

  return (
    <div
      onClick={handleClick}
      className={`flex items-center gap-3 p-2.5 rounded-xl border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-input)] hover:bg-[var(--theme-bg-tertiary)]/50 transition-all shadow-sm hover:shadow max-w-sm sm:max-w-md relative group ${file.error ? 'border-[var(--theme-bg-danger)]/50' : ''} ${isClickable ? 'cursor-pointer' : ''}`}
    >
      <div className="w-12 h-12 rounded-lg overflow-hidden border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-primary)] flex-shrink-0 relative">
        <FileThumbnail file={file} Icon={Icon} colorClass={colorClass} bgClass={bgClass} />
        {(isUploading || isProcessing) && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/35 backdrop-blur-[1px]">
            <Loader2 size={18} className="animate-spin text-white" />
          </div>
        )}
      </div>

      <div className="flex-grow min-w-0">
        <p className="text-sm font-medium text-[var(--theme-text-primary)] truncate" title={file.name}>
          {formatDisplayFileName(file.name)}
        </p>
        <div className="flex items-center gap-1.5 text-xs text-[var(--theme-text-tertiary)]">
          {isUploading ? (
            <span className="text-[var(--theme-text-link)] font-medium">
              {interpolate(t('selectedFileUploading'), { percent: String(uploadPercent) })}
              {file.uploadSpeed ? ` (${file.uploadSpeed})` : ''}
            </span>
          ) : isProcessing ? (
            <span className="text-[var(--theme-text-link)]">{t('selectedFileProcessingGemini')}</span>
          ) : (
            <>
              <span className="truncate">{getDisplayType(file.type, file.name)}</span>
              {file.size > 0 && (
                <>
                  <span className="w-0.5 h-0.5 rounded-full bg-current flex-shrink-0 opacity-50"></span>
                  <span className="flex-shrink-0 whitespace-nowrap">{formatFileSize(file.size)}</span>
                </>
              )}
            </>
          )}
          {file.videoMetadata && (
            <span
              className="flex items-center gap-0.5 text-[var(--theme-text-link)] ml-1 flex-shrink-0"
              title={t('filePreviewVideoClipped')}
            >
              <Scissors size={10} />
            </span>
          )}
          {file.mediaResolution && (
            <span
              className="flex items-center gap-0.5 text-[var(--theme-text-link)] ml-1 flex-shrink-0"
              title={interpolate(t('filePreviewResolutionLabel'), { resolution: file.mediaResolution })}
            >
              <SlidersHorizontal size={10} />
            </span>
          )}
          {file.error && (
            <span className="text-[var(--theme-text-danger)] ml-1 flex-shrink-0">
              {file.error || t('selectedFileErrorFallback')}
            </span>
          )}
        </div>
        {isUploading && (
          <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-[var(--theme-border-secondary)]">
            <div
              className="h-full rounded-full bg-[var(--theme-text-link)] transition-[width] duration-200"
              style={{ width: `${uploadPercent}%` }}
            />
          </div>
        )}
      </div>

      <div className="flex items-center gap-1">
        {isUploading && file.abortController && (
          <button
            type="button"
            onClick={handleCancelUpload}
            title={t('cancel')}
            className="p-1.5 rounded-lg hover:bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-primary)] transition-colors"
          >
            <X size={16} strokeWidth={2} />
          </button>
        )}
        {canConfigure && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (onConfigure) {
                onConfigure();
              }
            }}
            title={t('selectedFileConfigureFile')}
            className="p-1.5 rounded-lg hover:bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-primary)] transition-colors opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus:opacity-100 focus:pointer-events-auto"
          >
            <ConfigIcon size={16} strokeWidth={2} />
          </button>
        )}

        {isFromMessageList && !file.fileApiName && file.dataUrl && !file.error && (
          <button
            type="button"
            onClick={handleDownloadFile}
            title={t('filePreviewDownloadFile')}
            className="p-1.5 rounded-lg hover:bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-primary)] transition-colors opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus:opacity-100 focus:pointer-events-auto"
          >
            <Download size={16} strokeWidth={2} />
          </button>
        )}

        {isFromMessageList && file.fileApiName && file.uploadState === 'active' && !file.error && (
          <button
            type="button"
            onClick={handleCopyId}
            title={idCopied ? t('copied') : t('selectedFileCopyFileId')}
            className={`p-1.5 rounded-lg hover:bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-primary)] transition-colors opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus:opacity-100 focus:pointer-events-auto ${idCopied ? 'text-[var(--theme-text-success)]' : ''}`}
          >
            {idCopied ? <Check size={16} strokeWidth={2} /> : <Copy size={16} strokeWidth={2} />}
          </button>
        )}
      </div>
    </div>
  );
};
