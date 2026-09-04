import React from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { Modal } from '@/components/shared/Modal';
import { type UploadedFile, type AppSettings, type ModelOption } from '@/types';
import { ChevronDown, X, Calculator, KeyRound } from 'lucide-react';
import { ModelPicker } from '@/components/shared/ModelPicker';
import { getModelIcon } from '@/components/shared/ModelIcon';
import { useTokenCountLogic } from '@/hooks/token-count/useTokenCountLogic';
import { TokenCountInput } from './token-count/TokenCountInput';
import { TokenCountFiles } from './token-count/TokenCountFiles';
import { TokenCountFooter } from './token-count/TokenCountFooter';
import { TokenCountApiKeyConfig } from './token-count/TokenCountApiKeyConfig';
import { MODAL_CLOSE_BUTTON_CLASS } from '@/constants/buttonClasses';

interface TokenCountModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialText: string;
  initialFiles: UploadedFile[];
  appSettings: AppSettings;
  availableModels: ModelOption[];
  currentModelId: string;
}

export const TokenCountModal: React.FC<TokenCountModalProps> = (props) => {
  const { t } = useI18n();
  const { isOpen, onClose, availableModels } = props;

  const {
    text,
    setText,
    files,
    selectedModelId,
    tokenCount,
    videoTokenEstimate,
    isLoading,
    error,
    fileInputRef,
    handleFileChange,
    removeFile,
    clearAll,
    handleCalculateClick,
    handleModelSelect,
    setTokenCount,
    dedicatedApiKey,
    handleSaveDedicatedApiKey,
    isApiKeyConfigOpen,
    setIsApiKeyConfigOpen,
    hasDedicatedApiKey,
  } = useTokenCountLogic(props);

  const displayModelName = availableModels.find((model) => model.id === selectedModelId)?.name || selectedModelId;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      contentClassName="w-full max-w-2xl bg-[var(--theme-bg-primary)] rounded-xl shadow-2xl flex flex-col overflow-hidden border border-[var(--theme-border-primary)] max-h-[85vh]"
      noPadding
    >
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--theme-border-secondary)] bg-[var(--theme-bg-secondary)]/50">
        <h2 className="text-lg font-semibold text-[var(--theme-text-primary)] flex items-center gap-2">
          <Calculator size={20} className="text-[var(--theme-text-tertiary)]" />
          {t('tokenModalTitle')}
        </h2>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setIsApiKeyConfigOpen(!isApiKeyConfigOpen)}
            className={`p-1.5 rounded-lg transition-colors flex items-center gap-1.5 text-xs ${
              hasDedicatedApiKey
                ? 'text-emerald-500 hover:bg-emerald-500/10'
                : isApiKeyConfigOpen
                  ? 'text-[var(--theme-text-primary)] bg-[var(--theme-bg-tertiary)]'
                  : 'text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)]'
            }`}
            title={t('tokenModalApiKeyToggle')}
            aria-expanded={isApiKeyConfigOpen}
          >
            <KeyRound size={18} />
            {hasDedicatedApiKey && (
              <span className="hidden sm:inline font-medium text-[11px]">{t('tokenModalDedicatedKeyBadge')}</span>
            )}
          </button>
          <button onClick={onClose} className={MODAL_CLOSE_BUTTON_CLASS}>
            <X size={20} />
          </button>
        </div>
      </div>

      <div className="flex-grow flex flex-col min-h-0 overflow-y-auto custom-scrollbar p-5 space-y-5">
        <TokenCountApiKeyConfig
          isOpen={isApiKeyConfigOpen}
          apiKey={dedicatedApiKey}
          onSave={handleSaveDedicatedApiKey}
          hasDedicatedKey={hasDedicatedApiKey}
        />
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase text-[var(--theme-text-tertiary)] tracking-wider">
            {t('tokenModalModel')}
          </label>
          <ModelPicker
            models={availableModels}
            selectedId={selectedModelId}
            onSelect={handleModelSelect}
            dropdownClassName="w-full max-h-60"
            renderTrigger={({ isOpen, setIsOpen, selectedModel, listboxId, activeDescendantId }) => (
              <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between gap-3 px-3 py-2.5 bg-[var(--theme-bg-input)] border border-[var(--theme-border-secondary)] rounded-lg text-sm text-[var(--theme-text-primary)] hover:border-[var(--theme-border-focus)] transition-colors focus:ring-2 focus:ring-[var(--theme-border-focus)] outline-none"
                aria-haspopup="listbox"
                aria-expanded={isOpen}
                aria-controls={isOpen ? listboxId : undefined}
                aria-activedescendant={isOpen ? activeDescendantId : undefined}
              >
                <div className="flex items-start gap-2.5 min-w-0 text-left">
                  <div className="mt-0.5 flex-shrink-0">{getModelIcon(selectedModel)}</div>
                  <div className="min-w-0">
                    <div className="truncate">{displayModelName}</div>
                    <div className="text-xs text-[var(--theme-text-tertiary)] font-mono truncate">
                      {selectedModelId}
                    </div>
                  </div>
                </div>
                <ChevronDown
                  size={16}
                  className={`flex-shrink-0 text-[var(--theme-text-tertiary)] transition-transform ${isOpen ? 'rotate-180' : ''}`}
                  strokeWidth={1.75}
                />
              </button>
            )}
          />
        </div>

        <TokenCountInput
          text={text}
          onChange={(newText) => {
            setText(newText);
            setTokenCount(null);
          }}
        />

        <TokenCountFiles
          files={files}
          fileInputRef={fileInputRef}
          onFileChange={handleFileChange}
          onRemoveFile={removeFile}
        />

        {error && (
          <div className="p-3 rounded-lg bg-[var(--theme-bg-danger)]/10 border border-[var(--theme-bg-danger)]/20 text-sm text-[var(--theme-text-danger)] animate-in fade-in slide-in-from-top-1">
            {error}
          </div>
        )}
      </div>

      <TokenCountFooter
        tokenCount={tokenCount}
        videoTokenEstimate={videoTokenEstimate}
        isLoading={isLoading}
        hasContent={!!text.trim() || files.length > 0}
        onClear={clearAll}
        onCalculate={handleCalculateClick}
      />
    </Modal>
  );
};
