import React from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { Settings2, Scissors, X } from 'lucide-react';
import { FOCUS_VISIBLE_RING_SECONDARY_OFFSET_CLASS } from '@/constants/focusClasses';
import { formatFileSize } from '@/utils/file/fileSize';

interface FileConfigHeaderProps {
  onClose: () => void;
  showResolutionSettings: boolean;
  isVideo: boolean;
  /** Name of the file being configured, shown under the title. */
  fileName?: string;
  fileSize?: number;
  fileType?: string;
  isYoutube?: boolean;
}

const getFileBadge = (fileName?: string, isYoutube?: boolean, fileType?: string): string | null => {
  if (isYoutube) return 'YouTube';
  if (fileType?.startsWith('video/')) {
    const sub = fileType.split('/')[1]?.toUpperCase();
    if (sub && sub.length <= 5) return sub;
  }
  if (!fileName) return null;
  const ext = fileName.split('.').pop()?.toUpperCase();
  if (ext && ext.length <= 5 && ext !== fileName.toUpperCase()) {
    return ext;
  }
  return null;
};

export const FileConfigHeader: React.FC<FileConfigHeaderProps> = ({
  onClose,
  showResolutionSettings,
  isVideo,
  fileName,
  fileSize,
  fileType,
  isYoutube,
}) => {
  const { t } = useI18n();
  const badge = getFileBadge(fileName, isYoutube, fileType);

  return (
    <div className="p-4 border-b border-[var(--theme-border-secondary)] bg-[var(--theme-bg-secondary)] flex justify-between items-center rounded-t-xl">
      <div className="min-w-0 pr-2">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-[var(--theme-text-primary)] flex items-center gap-2">
            {showResolutionSettings ? (
              <Settings2 size={18} />
            ) : isVideo ? (
              <Scissors size={18} />
            ) : (
              <Settings2 size={18} />
            )}
            {t('fileSettingsTitle')}
          </h3>
          {badge && (
            <span className="px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-secondary)] border border-[var(--theme-border-secondary)]">
              {badge}
            </span>
          )}
        </div>
        {fileName && (
          <p className="text-xs text-[var(--theme-text-tertiary)] truncate mt-0.5 max-w-[320px]" title={fileName}>
            {fileName}
            {typeof fileSize === 'number' && fileSize > 0 ? ` · ${formatFileSize(fileSize)}` : ''}
          </p>
        )}
      </div>
      <button
        onClick={onClose}
        className={`text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-primary)] rounded-full p-1 ${FOCUS_VISIBLE_RING_SECONDARY_OFFSET_CLASS}`}
      >
        <X size={20} />
      </button>
    </div>
  );
};
