import React, { type RefObject } from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { type UploadedFile } from '@/types';
import { Plus, X } from 'lucide-react';
import { formatFileSize } from '@/utils/file/fileSize';
import { SUPPORTED_UPLOAD_MIME_TYPES } from '@/constants/fileTypeSupport';
import { getFileDisplayMeta } from '@/utils/file/fileDisplayStyles';

interface TokenCountFilesProps {
  files: UploadedFile[];
  fileInputRef: RefObject<HTMLInputElement>;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveFile: (id: string) => void;
}

export const TokenCountFiles: React.FC<TokenCountFilesProps> = ({
  files,
  fileInputRef,
  onFileChange,
  onRemoveFile,
}) => {
  const { t } = useI18n();
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold uppercase text-[var(--theme-text-tertiary)] tracking-wider">
          {t('tokenModalFiles')}
        </label>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="text-xs flex items-center gap-1 text-[var(--theme-text-link)] hover:underline"
        >
          <Plus size={12} /> {t('add')}
        </button>
        <input
          type="file"
          multiple
          ref={fileInputRef}
          onChange={onFileChange}
          className="hidden"
          accept={SUPPORTED_UPLOAD_MIME_TYPES.join(',')}
        />
      </div>

      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((file) => {
            const { Icon: FileIcon, colorClass } = getFileDisplayMeta(file);
            return (
              <div
                key={file.id}
                className="flex items-center gap-2 px-2.5 py-1.5 bg-[var(--theme-bg-tertiary)]/50 border border-[var(--theme-border-secondary)] rounded-md text-xs group"
              >
                <span className={`${colorClass} flex-shrink-0`}>
                  <FileIcon size={14} strokeWidth={1.75} />
                </span>
                <span className="max-w-[150px] truncate text-[var(--theme-text-primary)]" title={file.name}>
                  {file.name}
                </span>
                <span className="text-[var(--theme-text-tertiary)]">({formatFileSize(file.size)})</span>
                <button
                  onClick={() => onRemoveFile(file.id)}
                  className="ml-1 text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-danger)] opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity"
                >
                  <X size={12} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
