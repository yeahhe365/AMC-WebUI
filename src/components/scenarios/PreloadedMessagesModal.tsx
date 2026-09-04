import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { type SavedScenario } from '@/types';
import { X, Plus, Upload, Download, ArrowLeft, MoreHorizontal } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { ConfirmationModal } from '@/components/modals/ConfirmationModal';
import { ScenarioEditor } from './ScenarioEditor';
import { ScenarioList } from './ScenarioList';
import { useScenarioManager } from '@/hooks/scenarios/useScenarioManager';
import { toastError, toastSuccess } from '@/stores/toastStore';
import {
  ICON_BUTTON_CLASS,
  MODAL_CLOSE_BUTTON_CLASS,
  SETTINGS_PRIMARY_ACTION_BUTTON_CLASS,
  SMALL_ICON_BUTTON_ROUND_CLASS,
} from '@/constants/buttonClasses';
import { MENU_ITEM_BUTTON_CLASS, MENU_ITEM_DEFAULT_STATE_CLASS } from '@/constants/menuClasses';

interface PreloadedMessagesModalProps {
  isOpen: boolean;
  onClose: () => void;
  savedScenarios: SavedScenario[];
  onSaveAllScenarios: (scenarios: SavedScenario[]) => void;
  onLoadScenario: (scenario: SavedScenario) => void;
}

const SCENARIO_LOAD_CLOSE_DELAY_MS = 300;

type ConfirmState = { kind: 'close' } | { kind: 'delete'; id: string } | { kind: 'none' };

export const PreloadedMessagesModal: React.FC<PreloadedMessagesModalProps> = ({
  isOpen,
  onClose,
  savedScenarios,
  onSaveAllScenarios,
  onLoadScenario,
}) => {
  const { t } = useI18n();
  const {
    scenarios,
    view,
    editingScenario,
    searchQuery,
    setSearchQuery,
    importInputRef,
    systemScenarioIds,
    builtInScenarioIds,
    hasUnsavedChanges,
    actions,
  } = useScenarioManager({
    isOpen,
    savedScenarios,
    onSaveAllScenarios,
    t,
  });

  const delayedCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  const [confirm, setConfirm] = useState<ConfirmState>({ kind: 'none' });
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);

  const clearDelayedCloseTimeout = useCallback(() => {
    if (delayedCloseTimeoutRef.current !== null) {
      clearTimeout(delayedCloseTimeoutRef.current);
      delayedCloseTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => () => clearDelayedCloseTimeout(), [clearDelayedCloseTimeout]);

  useEffect(() => {
    if (!isMoreMenuOpen) return undefined;
    const handlePointerDown = (event: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target as Node)) {
        setIsMoreMenuOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsMoreMenuOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isMoreMenuOpen]);

  useEffect(() => {
    if (!isOpen) {
      setConfirm({ kind: 'none' });
      setIsMoreMenuOpen(false);
    }
  }, [isOpen]);

  const handleClose = () => {
    clearDelayedCloseTimeout();
    if (!isOpen) return;
    if (hasUnsavedChanges) {
      setIsMoreMenuOpen(false);
      setConfirm({ kind: 'close' });
      return;
    }
    onClose();
  };

  const handleLoadAndClose = (scenario: SavedScenario) => {
    if (scenario.messages.length === 0 && !scenario.systemInstruction?.trim()) {
      toastError(t('scenariosFeedbackEmpty'));
      return;
    }
    onLoadScenario(scenario);
    toastSuccess(t('scenariosFeedbackLoaded'));
    clearDelayedCloseTimeout();
    delayedCloseTimeoutRef.current = setTimeout(() => {
      delayedCloseTimeoutRef.current = null;
      onClose();
    }, SCENARIO_LOAD_CLOSE_DELAY_MS);
  };

  const requestDelete = (id: string) => {
    setIsMoreMenuOpen(false);
    setConfirm({ kind: 'delete', id });
  };

  const handleConfirm = () => {
    if (confirm.kind === 'close') {
      onClose();
    } else if (confirm.kind === 'delete') {
      actions.handleDeleteScenario(confirm.id);
    }
    setConfirm({ kind: 'none' });
  };

  const confirmConfig =
    confirm.kind === 'close'
      ? {
          title: t('scenariosConfirmCloseTitle'),
          message: t('scenariosConfirmCloseMessage'),
          confirmLabel: t('scenariosConfirmCloseConfirm'),
          isDanger: true,
        }
      : confirm.kind === 'delete'
        ? {
            title: t('scenariosConfirmDeleteTitle'),
            message: t('scenariosConfirmDeleteMessage'),
            confirmLabel: t('delete'),
            isDanger: true,
          }
        : null;

  const isSystemScenario = editingScenario && systemScenarioIds.includes(editingScenario.id);

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      noPadding
      ariaLabelledBy="scenarios-title"
      contentClassName="w-full h-[100dvh] sm:h-[85vh] sm:max-h-[800px] sm:w-[90vw] max-w-6xl sm:rounded-xl overflow-hidden flex flex-col shadow-2xl bg-[var(--theme-bg-primary)] transition-all"
    >
      <div className="relative flex h-full flex-col">
        <div className="z-10 flex flex-shrink-0 items-center justify-between border-b border-[var(--theme-border-secondary)]/50 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            {view === 'editor' && (
              <button
                type="button"
                onClick={actions.handleCancelEdit}
                className={`${SMALL_ICON_BUTTON_ROUND_CLASS} -ml-2 text-[var(--theme-text-secondary)]`}
                aria-label={t('scenariosEditorBack')}
              >
                <ArrowLeft size={20} />
              </button>
            )}
            <h2 id="scenarios-title" className="truncate text-xl font-semibold text-[var(--theme-text-primary)]">
              {view === 'editor' ? editingScenario?.title || t('scenariosTitleCreate') : t('scenariosTitle')}
            </h2>
            {view === 'editor' && isSystemScenario && (
              <span className="hidden text-xs font-medium text-[var(--theme-text-tertiary)] sm:inline">
                {t('scenariosSystemPresetReadonlyBadge')}
              </span>
            )}
          </div>

          <div className="flex flex-shrink-0 items-center gap-1.5 sm:gap-2">
            {view === 'list' && (
              <>
                <button
                  type="button"
                  onClick={actions.handleStartAddNew}
                  className={SETTINGS_PRIMARY_ACTION_BUTTON_CLASS}
                >
                  <Plus size={16} strokeWidth={2.5} />
                  <span className="hidden sm:inline">{t('scenariosCreateButton')}</span>
                  <span className="sm:hidden">{t('add')}</span>
                </button>

                <div className="relative sm:hidden" ref={moreMenuRef}>
                  <button
                    type="button"
                    onClick={() => setIsMoreMenuOpen((open) => !open)}
                    className={ICON_BUTTON_CLASS}
                    aria-label={t('scenariosMoreActions')}
                    aria-haspopup="menu"
                    aria-expanded={isMoreMenuOpen}
                  >
                    <MoreHorizontal size={20} />
                  </button>
                  {isMoreMenuOpen && (
                    <div
                      role="menu"
                      className="absolute right-0 top-full z-20 mt-1 w-40 rounded-md border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-primary)] py-1 shadow-lg"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setIsMoreMenuOpen(false);
                          importInputRef.current?.click();
                        }}
                        className={`${MENU_ITEM_BUTTON_CLASS} ${MENU_ITEM_DEFAULT_STATE_CLASS}`}
                      >
                        <Upload size={14} /> <span>{t('import')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsMoreMenuOpen(false);
                          actions.handleExportScenarios();
                        }}
                        className={`${MENU_ITEM_BUTTON_CLASS} ${MENU_ITEM_DEFAULT_STATE_CLASS}`}
                      >
                        <Download size={14} /> <span>{t('export')}</span>
                      </button>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => importInputRef.current?.click()}
                  className={`hidden sm:inline-flex ${ICON_BUTTON_CLASS}`}
                  title={t('import')}
                  aria-label={t('import')}
                >
                  <Upload size={20} />
                </button>
                <input
                  type="file"
                  ref={importInputRef}
                  onChange={actions.handleImportScenarios}
                  accept=".json"
                  className="hidden"
                />

                <button
                  type="button"
                  onClick={actions.handleExportScenarios}
                  className={`hidden sm:inline-flex ${ICON_BUTTON_CLASS}`}
                  title={t('export')}
                  aria-label={t('export')}
                >
                  <Download size={20} />
                </button>
              </>
            )}

            <button
              type="button"
              onClick={handleClose}
              className={MODAL_CLOSE_BUTTON_CLASS}
              aria-label={t('scenariosCloseAria')}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-grow flex-col overflow-hidden bg-[var(--theme-bg-secondary)] p-3 sm:p-4 md:px-6 md:py-5">
          {view === 'list' ? (
            <ScenarioList
              scenarios={scenarios}
              systemScenarioIds={systemScenarioIds}
              builtInScenarioIds={builtInScenarioIds}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              onLoad={handleLoadAndClose}
              onEdit={actions.handleStartEdit}
              onDelete={requestDelete}
              onDuplicate={actions.handleDuplicateScenario}
              onExport={actions.handleExportSingleScenario}
              onView={actions.handleStartEdit}
            />
          ) : (
            <ScenarioEditor
              initialScenario={editingScenario}
              onSave={actions.handleSaveScenario}
              readOnly={!!isSystemScenario}
            />
          )}
        </div>
      </div>

      {confirmConfig && (
        <ConfirmationModal
          isOpen
          onClose={() => setConfirm({ kind: 'none' })}
          onConfirm={handleConfirm}
          title={confirmConfig.title}
          message={confirmConfig.message}
          confirmLabel={confirmConfig.confirmLabel}
          cancelLabel={t('cancel')}
          isDanger={confirmConfig.isDanger}
        />
      )}
    </Modal>
  );
};
