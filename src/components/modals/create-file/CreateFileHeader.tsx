import React from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { FileText, Download, Loader2, Edit3, Eye, X, ChevronDown } from 'lucide-react';
import { CREATE_FILE_EXTENSION_OPTIONS } from './createFileExtensionOptions';

interface CreateFileHeaderProps {
  isEditing: boolean;
  isPdf: boolean;
  isExportingPdf: boolean;
  canDownloadPdf: boolean;
  supportsRichPreview: boolean;
  isPreviewMode: boolean;
  setIsPreviewMode: (mode: boolean) => void;
  handleDownloadPdf: () => void;
  onClose: () => void;
  titleId: string;
  filenameBase: string;
  setFilenameBase: (name: string) => void;
  filenamePlaceholder: string;
  extension: string;
  setExtension: (ext: string) => void;
  onSaveKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
}

export const CreateFileHeader: React.FC<CreateFileHeaderProps> = ({
  isEditing,
  isPdf,
  isExportingPdf,
  canDownloadPdf,
  supportsRichPreview,
  isPreviewMode,
  setIsPreviewMode,
  handleDownloadPdf,
  onClose,
  titleId,
  filenameBase,
  setFilenameBase,
  filenamePlaceholder,
  extension,
  setExtension,
  onSaveKeyDown,
}) => {
  const { t } = useI18n();
  return (
    <div data-create-file-header className="flex-shrink-0 z-10 bg-[var(--theme-bg-secondary)]/50">
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <h2
          id={titleId}
          className="text-lg font-semibold text-[var(--theme-text-primary)] flex items-center gap-2 min-w-0"
        >
          <FileText size={20} className="text-[var(--theme-text-tertiary)] flex-shrink-0" />
          <span className="truncate">{isEditing ? t('createTextEditTitle') : t('createTextTitle')}</span>
        </h2>
        <div className="flex items-center gap-2 flex-shrink-0">
          {isPdf && (
            <button
              onClick={handleDownloadPdf}
              disabled={isExportingPdf || !canDownloadPdf}
              className="flex items-center justify-center h-9 w-9 sm:w-auto sm:px-3 rounded-lg text-xs font-medium transition-colors bg-[var(--theme-bg-input)] text-[var(--theme-text-primary)] border border-[var(--theme-border-secondary)] hover:bg-[var(--theme-bg-tertiary)] disabled:opacity-50"
              title={t('createTextDownloadPdf')}
            >
              {isExportingPdf ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              <span className="hidden sm:inline ml-2">PDF</span>
            </button>
          )}

          {supportsRichPreview && (
            <button
              onClick={() => setIsPreviewMode(!isPreviewMode)}
              className={`lg:hidden flex items-center justify-center h-9 w-9 sm:w-auto sm:px-3 rounded-lg text-xs font-medium transition-colors border ${
                isPreviewMode
                  ? 'bg-[var(--theme-bg-accent)] text-[var(--theme-text-accent)] border-[var(--theme-bg-accent)]'
                  : 'bg-[var(--theme-bg-input)] text-[var(--theme-text-primary)] border-[var(--theme-border-secondary)] hover:bg-[var(--theme-bg-tertiary)]'
              }`}
              title={isPreviewMode ? t('createTextSwitchToEdit') : t('createTextSwitchToPreview')}
            >
              {isPreviewMode ? <Edit3 size={16} /> : <Eye size={16} />}
              <span className="hidden sm:inline ml-2">{isPreviewMode ? t('edit') : t('preview')}</span>
            </button>
          )}

          <button
            onClick={onClose}
            className="h-9 w-9 flex items-center justify-center text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] rounded-lg transition-colors"
            aria-label={t('close')}
          >
            <X size={20} />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 px-4 pb-3">
        <input
          type="text"
          value={filenameBase}
          onChange={(e) => setFilenameBase(e.target.value)}
          onKeyDown={onSaveKeyDown}
          placeholder={filenamePlaceholder}
          className="w-full h-9 px-3 bg-[var(--theme-bg-input)] border border-[var(--theme-border-secondary)] rounded-lg focus:ring-2 focus:ring-[var(--theme-border-focus)] focus:border-transparent text-[var(--theme-text-primary)] placeholder-[var(--theme-text-tertiary)] outline-none transition-all text-sm font-medium"
          aria-label={t('createTextFilenamePlaceholder')}
          autoComplete="off"
        />

        <div className="relative flex-shrink-0">
          <select
            value={extension}
            onChange={(e) => setExtension(e.target.value)}
            className="h-9 pl-3 pr-8 bg-[var(--theme-bg-input)] border border-[var(--theme-border-secondary)] rounded-lg focus:ring-2 focus:ring-[var(--theme-border-focus)] focus:border-transparent text-[var(--theme-text-primary)] outline-none transition-all text-sm font-mono cursor-pointer appearance-none"
            aria-label={t('createTextFileExtensionAria')}
          >
            {CREATE_FILE_EXTENSION_OPTIONS.map((ext) => (
              <option key={ext} value={ext}>
                {ext}
              </option>
            ))}
            {!CREATE_FILE_EXTENSION_OPTIONS.includes(extension) && <option value={extension}>{extension}</option>}
          </select>
          <ChevronDown
            size={14}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--theme-text-tertiary)] pointer-events-none"
          />
        </div>
      </div>
    </div>
  );
};
