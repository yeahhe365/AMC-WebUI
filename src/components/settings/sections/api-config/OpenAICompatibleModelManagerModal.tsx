import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, X } from 'lucide-react';
import type { ModelOption } from '@/types';
import { useI18n } from '@/contexts/I18nContext';
import { OpenAICompatibleCurrentModelsPanel } from './OpenAICompatibleCurrentModelsPanel';
import { OpenAICompatibleModelImportPanel } from './OpenAICompatibleModelImportPanel';
import type { EditableOpenAICompatibleModelRow } from './openaiCompatibleModelListState';

interface OpenAICompatibleModelManagerModalProps {
  isOpen: boolean;
  rows: EditableOpenAICompatibleModelRow[];
  currentModelIds: ReadonlySet<string>;
  fetchRequestId: number;
  onClose: () => void;
  onCommitRows: (rows: EditableOpenAICompatibleModelRow[]) => void;
  onFetchModelsForImportPreview?: () => Promise<ModelOption[]>;
  isFetchModelsDisabled?: boolean;
  isFetchingModels?: boolean;
  fetchModelsStatus?: 'idle' | 'success' | 'error';
  fetchModelsMessage?: string | null;
}

export const OpenAICompatibleModelManagerModal: React.FC<OpenAICompatibleModelManagerModalProps> = ({
  isOpen,
  rows,
  currentModelIds,
  fetchRequestId,
  onClose,
  onCommitRows,
  onFetchModelsForImportPreview,
  isFetchModelsDisabled = false,
  isFetchingModels = false,
  fetchModelsStatus = 'idle',
  fetchModelsMessage = null,
}) => {
  const { t } = useI18n();
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const target =
      document.querySelector<HTMLElement>('[data-settings-main-container="true"]') ||
      document.getElementById('settings-main-container');
    setContainer(target);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  const content = (
    <div
      role="region"
      aria-label={t('settingsOpenAICompatibleManageModels')}
      className="absolute inset-0 z-30 flex flex-col bg-[var(--theme-bg-primary)] animate-in fade-in duration-200"
    >
      <div className="flex items-center justify-between gap-3 border-b border-[var(--theme-border-secondary)] px-4 py-3 bg-[var(--theme-bg-secondary)]/30">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-border-focus)]"
            aria-label={t('back')}
          >
            <ArrowLeft size={16} />
            <span className="hidden sm:inline">{t('back')}</span>
          </button>
          <div className="h-4 w-[1px] bg-[var(--theme-border-secondary)]/60" />
          <div className="min-w-0">
            <h3
              id="openai-compatible-model-manager-title"
              className="truncate text-sm font-semibold text-[var(--theme-text-primary)]"
            >
              {t('settingsOpenAICompatibleManageModels')}
            </h3>
            <p className="mt-0.5 text-xs text-[var(--theme-text-secondary)] truncate hidden sm:block">
              {t('settingsOpenAICompatibleManageModelsHelp')}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1.5 text-[var(--theme-text-secondary)] transition-colors hover:bg-[var(--theme-bg-tertiary)] hover:text-[var(--theme-text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-border-focus)]"
          aria-label={t('close')}
        >
          <X size={18} />
        </button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto p-4 custom-scrollbar lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <OpenAICompatibleCurrentModelsPanel rows={rows} onCommitRows={onCommitRows} />
        <OpenAICompatibleModelImportPanel
          rows={rows}
          currentModelIds={currentModelIds}
          fetchRequestId={fetchRequestId}
          onCommitRows={onCommitRows}
          onFetchModelsForImportPreview={onFetchModelsForImportPreview}
          isOpen={isOpen}
          isFetchModelsDisabled={isFetchModelsDisabled}
          isFetchingModels={isFetchingModels}
          fetchModelsStatus={fetchModelsStatus}
          fetchModelsMessage={fetchModelsMessage}
        />
      </div>
    </div>
  );

  return container ? createPortal(content, container) : content;
};
