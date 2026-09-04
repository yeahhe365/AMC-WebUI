import React from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { Settings2, Scissors, X } from 'lucide-react';
import { FOCUS_VISIBLE_RING_SECONDARY_OFFSET_CLASS } from '@/constants/focusClasses';

interface FileConfigHeaderProps {
  onClose: () => void;
  showResolutionSettings: boolean;
  isVideo: boolean;
  /** Name of the file being configured, shown under the title. */
  fileName?: string;
}

export const FileConfigHeader: React.FC<FileConfigHeaderProps> = ({
  onClose,
  showResolutionSettings,
  isVideo,
  fileName,
}) => {
  const { t } = useI18n();
  return (
    <div className="p-4 border-b border-[var(--theme-border-secondary)] bg-[var(--theme-bg-secondary)] flex justify-between items-center rounded-t-xl">
      <div className="min-w-0">
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
        {fileName && (
          <p className="text-xs text-[var(--theme-text-tertiary)] truncate mt-0.5 max-w-[280px]" title={fileName}>
            {fileName}
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
