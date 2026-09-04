import type React from 'react';
import { X } from 'lucide-react';
import type { ModelOption } from '@/types';
import { useI18n } from '@/contexts/I18nContext';
import { Modal } from '@/components/shared/Modal';
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

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      ariaLabelledBy="openai-compatible-model-manager-title"
      contentClassName="w-full max-w-5xl max-h-[92vh] overflow-hidden rounded-xl border border-[var(--theme-border-primary)] bg-[var(--theme-bg-primary)] shadow-2xl"
      noPadding
    >
      <div className="flex max-h-[92vh] flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--theme-border-secondary)] px-4 py-3">
          <div className="min-w-0">
            <h3
              id="openai-compatible-model-manager-title"
              className="truncate text-sm font-semibold text-[var(--theme-text-primary)]"
            >
              {t('settingsOpenAICompatibleManageModels')}
            </h3>
            <p className="mt-0.5 text-xs text-[var(--theme-text-secondary)]">
              {t('settingsOpenAICompatibleManageModelsHelp')}
            </p>
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
    </Modal>
  );
};
