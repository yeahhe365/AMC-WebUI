import React, { useState, useEffect, useRef } from 'react';
import { deferToNextTick } from '@/utils/deferToNextTick';
import { type UploadedFile } from '@/types';
import {
  Ban,
  Trash2,
  Loader2,
  CheckCircle,
  Copy,
  Check,
  Scissors,
  SlidersHorizontal,
  FileText,
  Ellipsis,
} from 'lucide-react';
import { CATEGORY_STYLES, getResolutionColor } from '@/utils/file/fileDisplayStyles';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { formatFileSize } from '@/utils/file/fileSize';
import { isTextFile } from '@/utils/file/fileTypeClassification';
import { getFileCardMeta } from '@/components/shared/file-preview/fileCardMeta';
import { useI18n } from '@/contexts/I18nContext';
import { FileThumbnail } from './FileThumbnail';
import { interpolate } from '@/i18n/interpolate';

interface SelectedFileDisplayProps {
  file: UploadedFile;
  onRemove: (fileId: string) => void;
  onCancelUpload: (fileId: string) => void;
  onConfigure?: (file: UploadedFile) => void;
  onMoveTextToInput?: (file: UploadedFile) => Promise<void>;
  onPreview?: (file: UploadedFile) => void;
  isGemini3?: boolean;
}

const NEWLY_ACTIVE_FEEDBACK_MS = 800;

const ACTION_BUTTON_CLASS =
  'flex h-[30px] w-[30px] items-center justify-center rounded-lg border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-secondary)]/90 text-[var(--theme-text-secondary)] shadow-sm transition-colors hover:bg-[var(--theme-bg-tertiary)] hover:text-[var(--theme-text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-border-focus)]';
const MENU_ITEM_CLASS =
  'flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs leading-tight text-[var(--theme-text-secondary)] transition-colors hover:bg-[var(--theme-bg-tertiary)] hover:text-[var(--theme-text-primary)]';
const FILE_PREVIEW_BOX_CLASS =
  'file-preview-box relative w-full aspect-square rounded-xl border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-tertiary)]/30 flex items-center justify-center transition-colors group-hover:border-[var(--theme-border-focus)]/50';

const formatDisplayFileName = (fileName: string): string => {
  const recordingMatch = fileName.match(/^recording-\d{4}-\d{2}-\d{2}-(\d{2})(\d{2})(\d{2})(\.[^.]+)$/);
  if (recordingMatch) {
    return `rec-${recordingMatch[1]}:${recordingMatch[2]}:${recordingMatch[3]}${recordingMatch[4]}`;
  }
  return fileName;
};

export const SelectedFileDisplay: React.FC<SelectedFileDisplayProps> = ({
  file,
  onRemove,
  onCancelUpload,
  onConfigure,
  onMoveTextToInput,
  onPreview,
  isGemini3,
}) => {
  const { t } = useI18n();
  const [isNewlyActive, setIsNewlyActive] = useState(false);
  const [isOverflowOpen, setIsOverflowOpen] = useState(false);
  const prevUploadState = useRef(file.uploadState);
  const { isCopied: idCopied, copyToClipboard } = useCopyToClipboard();

  useEffect(() => {
    const wasPreviouslyActive = prevUploadState.current === 'active';
    prevUploadState.current = file.uploadState;

    if (wasPreviouslyActive || file.uploadState !== 'active') {
      return undefined;
    }

    const showTimer = deferToNextTick(() => setIsNewlyActive(true));
    const hideTimer = window.setTimeout(() => setIsNewlyActive(false), NEWLY_ACTIVE_FEEDBACK_MS);

    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
    };
  }, [file.uploadState]);

  const handleCopyId = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (file.fileApiName) {
      copyToClipboard(file.fileApiName);
    }
    setIsOverflowOpen(false);
  };

  const isUploading = file.uploadState === 'uploading';
  const isProcessing = file.uploadState === 'processing_api' || file.isProcessing;
  const isFailed = file.uploadState === 'failed' || !!file.error;
  const isCancelled = file.uploadState === 'cancelled';
  const uploadPercent = Math.max(0, Math.min(100, Math.round(file.progress ?? 0)));
  const canMoveTextToInput =
    !!onMoveTextToInput &&
    isTextFile(file) &&
    file.uploadState === 'active' &&
    !isProcessing &&
    !isFailed &&
    !isCancelled;

  const isCancellable = isUploading || (isProcessing && file.uploadState !== 'processing_api');
  const { category, isActive, isText, canConfigure, ConfigIcon } = getFileCardMeta(file, {
    isGemini3,
    includeTextEditing: true,
    requireActiveForConfigure: true,
    canConfigure: !!onConfigure,
  });
  const { Icon, colorClass, bgClass } = CATEGORY_STYLES[category] || CATEGORY_STYLES['text'];

  const ErrorIcon = CATEGORY_STYLES['error'].Icon;
  const canCopyFileId = Boolean(file.fileApiName && isActive && !file.error);
  const configureButtonColorClass = file.mediaResolution ? getResolutionColor(file.mediaResolution) : '';

  return (
    <div
      className={`group relative flex w-[8.25rem] flex-shrink-0 items-start gap-1.5 ${isNewlyActive ? 'newly-active-file-animate' : ''} select-none`}
    >
      <div className="w-24 min-w-0">
        <div
          onClick={() => {
            if (isActive && onPreview) {
              onPreview(file);
            }
          }}
          className={`${FILE_PREVIEW_BOX_CLASS} ${isActive && onPreview ? 'cursor-pointer hover:opacity-90' : ''}`}
        >
          <div
            className={`absolute inset-0 overflow-hidden rounded-xl flex items-center justify-center p-2 transition-all duration-300 ${isUploading || isProcessing ? 'opacity-30 blur-[1px] scale-95' : 'opacity-100'}`}
          >
            <FileThumbnail file={file} Icon={Icon} colorClass={colorClass} bgClass={bgClass} />
          </div>

          {(isUploading || isProcessing) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-20">
              <div className="flex flex-col items-center gap-1">
                <Loader2 size={20} className="animate-spin text-[var(--theme-text-link)]" />
              </div>
            </div>
          )}

          {isUploading && (
            <div className="absolute inset-x-2 bottom-2 z-20">
              <div className="h-1.5 overflow-hidden rounded-full bg-black/25">
                <div
                  className="h-full rounded-full bg-[var(--theme-text-link)] transition-[width] duration-300"
                  style={{ width: `${uploadPercent}%` }}
                />
              </div>
            </div>
          )}

          {isFailed && !isCancelled && (
            <div className="absolute inset-0 flex flex-col items-center justify-center rounded-xl bg-[var(--theme-bg-danger)]/10 backdrop-blur-[1px] z-20">
              <ErrorIcon size={20} className="text-[var(--theme-text-danger)] mb-1" />
            </div>
          )}

          {isNewlyActive && (
            <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-[var(--theme-bg-success)]/20 backdrop-blur-[1px] animate-pulse z-20">
              <CheckCircle size={24} className="text-[var(--theme-text-success)] drop-shadow-md" />
            </div>
          )}
        </div>

        <div className="mt-1.5 px-0.5 text-left w-full min-h-[3rem] flex flex-col justify-start">
          <p className="text-xs font-medium text-[var(--theme-text-primary)] truncate leading-tight" title={file.name}>
            {formatDisplayFileName(file.name)}
          </p>
          <p
            className={`text-xs truncate leading-tight mt-0.5 flex items-center gap-1 ${isFailed ? 'text-[var(--theme-text-danger)] font-medium' : 'text-[var(--theme-text-tertiary)]'}`}
            title={isFailed ? file.error : undefined}
          >
            {file.videoMetadata ? (
              <span title={t('fileBadgeVideoMetadata')}>
                <Scissors size={10} className="text-[var(--theme-text-link)]" />
              </span>
            ) : null}
            {file.mediaResolution && (
              <span title={t('fileBadgeMediaResolution')}>
                <SlidersHorizontal size={10} className="text-[var(--theme-text-link)]" />
              </span>
            )}
            {isFailed
              ? file.error || t('selectedFileErrorFallback')
              : isUploading
                ? interpolate(t('selectedFileUploading'), { percent: String(uploadPercent) })
                : isProcessing
                  ? t('selectedFileProcessingGemini')
                  : isCancelled
                    ? t('selectedFileCancelled')
                    : formatFileSize(file.size)}
          </p>
          {isUploading && file.uploadSpeed && (
            <p className="text-xs truncate leading-tight mt-0.5 text-[var(--theme-text-link)]">{file.uploadSpeed}</p>
          )}
        </div>
      </div>

      <div
        data-file-action-rail="true"
        className="relative z-30 flex w-[30px] flex-shrink-0 flex-col items-center gap-1 pt-0.5"
        onClick={(event) => event.stopPropagation()}
      >
        {canConfigure && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (onConfigure) {
                onConfigure(file);
              }
            }}
            title={isText ? t('selectedFileEditFile') : t('selectedFileConfigureFile')}
            aria-label={isText ? t('selectedFileEditFile') : t('selectedFileConfigureFile')}
            className={`${ACTION_BUTTON_CLASS} ${configureButtonColorClass}`}
          >
            <ConfigIcon size={14} strokeWidth={2} />
          </button>
        )}

        {canMoveTextToInput && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setIsOverflowOpen(false);
              void onMoveTextToInput?.(file);
            }}
            title={t('selectedFileMoveTextToInput')}
            aria-label={t('selectedFileMoveTextToInput')}
            className={ACTION_BUTTON_CLASS}
          >
            <FileText size={14} strokeWidth={2} />
          </button>
        )}

        {canCopyFileId && (
          <div className="relative">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setIsOverflowOpen((value) => !value);
              }}
              title={t('selectedFileMoreActions')}
              aria-label={t('selectedFileMoreActions')}
              aria-haspopup="menu"
              aria-expanded={isOverflowOpen}
              className={ACTION_BUTTON_CLASS}
            >
              <Ellipsis size={15} strokeWidth={2.2} />
            </button>

            {isOverflowOpen && (
              <div
                role="menu"
                className="absolute right-0 top-8 z-40 min-w-36 overflow-hidden rounded-lg border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-secondary)] py-1 shadow-lg"
              >
                {canCopyFileId && (
                  <button type="button" role="menuitem" onClick={handleCopyId} className={MENU_ITEM_CLASS}>
                    {idCopied ? <Check size={12} strokeWidth={3} /> : <Copy size={12} strokeWidth={2} />}
                    <span>{idCopied ? t('selectedFileIdCopied') : t('selectedFileCopyFileId')}</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        <div className="mt-auto">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsOverflowOpen(false);
              if (isCancellable) {
                onCancelUpload(file.id);
              } else {
                onRemove(file.id);
              }
            }}
            className={`${ACTION_BUTTON_CLASS} hover:text-[var(--theme-text-danger)]`}
            title={isCancellable ? t('selectedFileCancelUpload') : t('selectedFileRemoveFile')}
            aria-label={isCancellable ? t('selectedFileCancelUpload') : t('selectedFileRemoveFile')}
          >
            {isCancellable ? <Ban size={15} /> : <Trash2 size={15} />}
          </button>
        </div>
      </div>
    </div>
  );
};
