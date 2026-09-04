import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { type AppSettings, type ChatSettings, type ModelOption } from '@/types';
import { Modal } from '@/components/shared/Modal';
import { ConfirmationModal } from '@/components/modals/ConfirmationModal';
import { useSettingsLogic, ANCHOR_SCROLL_LOCK_MS } from '@/hooks/settings/useSettingsLogic';
import { SettingsSidebar } from './SettingsSidebar';
import { SettingsContent } from './SettingsContent';
import { SettingsSearchResults } from './SettingsSearchResults';
import { type SettingsTransferProps } from './settingsTypes';
import type { LogViewerProps } from '@/components/log-viewer/LogViewer';
import {
  buildSettingsForModal,
  type SettingsScope,
  splitScopedSettingsUpdate,
} from '@/components/layout/mainContentModels';
import { useSettingsTransferActions } from '@/hooks/data-management/useSettingsTransferActions';
import { X } from 'lucide-react';
import {
  SETTINGS_SEGMENTED_ACTIVE_CLASS,
  SETTINGS_SEGMENTED_IDLE_CLASS,
  SETTINGS_SEGMENTED_TRACK_CLASS,
} from '@/constants/designTokens';
import { MODAL_CLOSE_BUTTON_CLASS } from '@/constants/buttonClasses';
import { type SettingsTab, useSettingsUiStore } from '@/stores/settingsUiStore';
import { SETTINGS_SEARCH_RESULTS_ID, settingsSearchOptionId } from '@/constants/settingsSearchCatalog';
import { searchSettingsCatalog, type SettingsSearchResult } from '@/utils/settingsSearch';
import { interpolate } from '@/i18n/interpolate';
import { isEditableElement } from '@/utils/chat-input/focus';

const ADVANCED_SETTINGS_ITEM_IDS = new Set([
  'models-advanced',
  'models-top-k',
  'models-max-output-tokens',
  'models-stop-sequences',
  'models-presence-penalty',
  'models-frequency-penalty',
  'models-seed',
  'models-media-resolution',
  'models-raw-mode',
  'models-hide-thinking',
  'models-always-keep-thinking',
]);

const SETTINGS_FOCUS_HIGHLIGHT_CLASSES = [
  'ring-2',
  'ring-[var(--theme-border-focus)]',
  'ring-offset-2',
  'ring-offset-[var(--theme-bg-primary)]',
  'rounded-xl',
] as const;

interface SettingsModalProps extends SettingsTransferProps {
  isOpen: boolean;
  onClose: () => void;
  currentSettings: AppSettings;
  currentThemeId: string;
  currentChatSettings?: ChatSettings;
  hasActiveSession?: boolean;
  availableModels: ModelOption[];
  onSave: (newSettings: AppSettings) => void;
  onSaveCurrentChatSettings?: (newSettings: ChatSettings) => void;
  onClearAllHistory: () => void;
  onClearCache: () => void;
  onOpenLogViewer: (state?: Pick<LogViewerProps, 'initialTab' | 'initialUsageTab'>) => void;
  setAvailableModels: (models: ModelOption[]) => void;
  onImportSettings?: (file: File) => void;
  onExportSettings?: () => void;
  onImportHistory?: (file: File) => void;
  onExportHistory?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  currentSettings,
  currentThemeId,
  currentChatSettings,
  hasActiveSession = false,
  availableModels,
  onSave,
  onSaveCurrentChatSettings,
  onClearAllHistory,
  onClearCache,
  onOpenLogViewer,
  onInstallPwa,
  installState,
  onImportScenarios,
  onExportScenarios,
  setAvailableModels,
}) => {
  const { t } = useI18n();
  const [liveSettings, setLiveSettings] = useState(currentSettings);
  const [liveCurrentChatSettings, setLiveCurrentChatSettings] = useState(currentChatSettings);
  const [settingsScope, setSettingsScope] = useState<SettingsScope>('defaults');
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);
  const canEditCurrentChat = hasActiveSession && !!liveCurrentChatSettings && !!onSaveCurrentChatSettings;
  const chatScopedTabs = useMemo(() => new Set(['models']), []);
  const isSearching = searchQuery.trim().length > 0;

  useEffect(() => {
    setLiveSettings(currentSettings);
  }, [currentSettings]);

  useEffect(() => {
    setLiveCurrentChatSettings(currentChatSettings);
  }, [currentChatSettings]);

  useEffect(() => {
    if (!canEditCurrentChat && settingsScope === 'currentChat') {
      setSettingsScope('defaults');
    }
  }, [canEditCurrentChat, settingsScope]);

  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
      setPendingFocusId(null);
    }
  }, [isOpen]);

  const effectiveScope = canEditCurrentChat ? settingsScope : 'defaults';

  const scopedSettings = useMemo(
    () =>
      buildSettingsForModal({
        appSettings: liveSettings,
        activeSessionId: canEditCurrentChat ? 'active' : null,
        currentChatSettings: liveCurrentChatSettings,
        scope: effectiveScope,
      }),
    [canEditCurrentChat, effectiveScope, liveCurrentChatSettings, liveSettings],
  );
  const settingsTransferActions = useSettingsTransferActions();

  const saveScopedSettings = (nextSettings: AppSettings) => {
    const previousSettings = buildSettingsForModal({
      appSettings: liveSettings,
      activeSessionId: canEditCurrentChat ? 'active' : null,
      currentChatSettings: liveCurrentChatSettings,
      scope: effectiveScope,
    });
    const splitUpdate = splitScopedSettingsUpdate({
      scope: effectiveScope,
      previousSettings,
      nextSettings,
      appSettings: liveSettings,
      currentChatSettings: liveCurrentChatSettings,
    });

    if (splitUpdate.nextAppSettings) {
      setLiveSettings(splitUpdate.nextAppSettings);
      onSave(splitUpdate.nextAppSettings);
    }

    if (splitUpdate.nextChatSettings && onSaveCurrentChatSettings) {
      setLiveCurrentChatSettings(splitUpdate.nextChatSettings);
      onSaveCurrentChatSettings(splitUpdate.nextChatSettings);
    }
  };

  const {
    activeTab,
    setActiveTab,
    confirmConfig,
    closeConfirm,
    scrollContainerRef,
    handleContentScroll,
    beginAnchorScroll,
    saveActiveScrollPosition,
    handleResetToDefaults,
    handleClearLogs,
    handleRequestClearHistory,
    handleRequestClearCache,
    handleRequestImportHistory,
    updateSetting,
    handleModelChange,
    tabs,
  } = useSettingsLogic({
    isOpen,
    currentSettings: scopedSettings,
    onSave: saveScopedSettings,
    onClearAllHistory,
    onClearCache,
    onImportHistory: settingsTransferActions.onImportHistory,
    t,
  });

  const activeTabLabelKey = tabs.find((tab) => tab.id === activeTab)?.labelKey;
  const activeTabUsesScope = !isSearching && chatScopedTabs.has(activeTab);
  const visibleScope = activeTabUsesScope ? settingsScope : 'defaults';
  const activeTabRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchSelectedIndex, setSearchSelectedIndex] = useState(0);

  const searchResults = useMemo(() => searchSettingsCatalog(searchQuery, t), [searchQuery, t]);
  // Results can shrink without a query change (language switch recomputes
  // matches), so clamp the selection instead of indexing past the end.
  const clampedSearchSelectedIndex = Math.min(searchSelectedIndex, Math.max(searchResults.length - 1, 0));
  const activeSearchOptionId = searchResults.length > 0 ? settingsSearchOptionId(clampedSearchSelectedIndex) : null;

  useEffect(() => {
    setSearchSelectedIndex(0);
  }, [searchQuery]);

  const handleTabChange = useCallback(
    (tab: SettingsTab) => {
      setSearchQuery('');
      setActiveTab(tab);
    },
    [setActiveTab],
  );

  const handleSelectSearchResult = useCallback(
    (result: SettingsSearchResult) => {
      if (ADVANCED_SETTINGS_ITEM_IDS.has(result.id)) {
        useSettingsUiStore.getState().setIsAdvancedModeEnabled(true);
      }
      setPendingFocusId(result.id);
      setSearchQuery('');
      setActiveTab(result.tab);
    },
    [setActiveTab],
  );

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      // IME composition (e.g. pinyin): keystrokes belong to the composition,
      // not to result navigation — Enter confirms the candidate instead.
      if (event.isComposing) return;

      if (isSearching && searchResults.length > 0) {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          setSearchSelectedIndex((prev) => (prev + 1) % searchResults.length);
          return;
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          setSearchSelectedIndex((prev) => (prev - 1 + searchResults.length) % searchResults.length);
          return;
        }
        if (event.key === 'Enter') {
          const selected = searchResults[clampedSearchSelectedIndex];
          if (selected) {
            event.preventDefault();
            handleSelectSearchResult(selected);
            return;
          }
        }
      }

      if (event.key !== '/' || (event.target instanceof HTMLElement && isEditableElement(event.target))) return;
      event.preventDefault();
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [clampedSearchSelectedIndex, handleSelectSearchResult, isOpen, isSearching, searchResults]);

  // While searching, Escape clears the query before the Modal's own
  // document-level close handler can run — the capture listener wins the
  // race regardless of where focus sits.
  useEffect(() => {
    if (!isOpen || !isSearching) return undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      setSearchQuery('');
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [isOpen, isSearching]);

  useEffect(() => {
    if (!activeTabUsesScope && settingsScope !== 'defaults') {
      setSettingsScope('defaults');
    }
  }, [activeTabUsesScope, settingsScope]);

  useEffect(() => {
    if (!pendingFocusId || isSearching || !isOpen) {
      return;
    }

    let highlightTimer: number | undefined;
    let scrollSaveTimer: number | undefined;
    // The anchor scroll owns the scroll container while it animates (see
    // ANCHOR_SCROLL_LOCK_MS): without the lock, saving the per-tab scroll
    // position mid-animation cancels the smooth scroll and the highlighted
    // row stays off-screen.
    beginAnchorScroll();
    const frame = window.requestAnimationFrame(() => {
      const container = scrollContainerRef.current;
      if (!container) {
        setPendingFocusId(null);
        return;
      }

      const target = container.querySelector(
        `[data-settings-item="${CSS.escape(pendingFocusId)}"]`,
      ) as HTMLElement | null;

      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target.classList.add(...SETTINGS_FOCUS_HIGHLIGHT_CLASSES);
        highlightTimer = window.setTimeout(() => {
          target.classList.remove(...SETTINGS_FOCUS_HIGHLIGHT_CLASSES);
        }, 1600);
        scrollSaveTimer = window.setTimeout(() => {
          saveActiveScrollPosition();
        }, ANCHOR_SCROLL_LOCK_MS);
      }

      setPendingFocusId(null);
    });

    return () => {
      window.cancelAnimationFrame(frame);
      if (highlightTimer !== undefined) {
        window.clearTimeout(highlightTimer);
      }
      if (scrollSaveTimer !== undefined) {
        window.clearTimeout(scrollSaveTimer);
      }
    };
  }, [pendingFocusId, isSearching, isOpen, activeTab, scrollContainerRef, beginAnchorScroll, saveActiveScrollPosition]);

  if (!isOpen) return null;

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        noPadding
        enterAnimationClassName=""
        ariaLabel={t('settingsTitle')}
        contentClassName="w-full h-[100dvh] sm:h-[85vh] sm:max-h-[800px] sm:w-[90vw] max-w-6xl sm:rounded-xl overflow-hidden flex flex-col md:flex-row shadow-2xl bg-[var(--theme-bg-primary)] transition-all"
        initialFocusRef={searchInputRef}
      >
        <SettingsSidebar
          tabs={tabs}
          activeTab={activeTab}
          setActiveTab={handleTabChange}
          onClose={onClose}
          activeTabRef={activeTabRef}
          searchInputRef={searchInputRef}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          resultsCount={searchResults.length}
          searchExpanded={isSearching}
          searchResultsId={SETTINGS_SEARCH_RESULTS_ID}
          searchActiveOptionId={activeSearchOptionId}
        />

        <main className="flex-1 flex flex-col min-w-0 bg-[var(--theme-bg-primary)] relative overflow-hidden">
          <div
            ref={scrollContainerRef}
            onScroll={handleContentScroll}
            className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar px-4 py-4 sm:px-6 sm:py-6 md:px-8 md:pt-4 md:pb-8"
          >
            <div className="max-w-3xl mx-auto w-full pb-4 md:pb-6 md:min-h-[48px] flex flex-col justify-center">
              <div className="flex items-center justify-between gap-3">
                <h2
                  className={`${isSearching ? 'block' : 'hidden md:block'} text-xl font-semibold text-[var(--theme-text-primary)] min-w-0 truncate`}
                >
                  {isSearching ? t('settingsSearchResultsTitle') : activeTabLabelKey ? t(activeTabLabelKey) : ''}
                </h2>
                {isSearching && (
                  <span
                    data-settings-search-count
                    className="md:hidden flex-shrink-0 text-xs font-medium text-[var(--theme-text-secondary)]"
                  >
                    {interpolate(t('settingsSearchResultsCount'), { count: searchResults.length })}
                  </span>
                )}
                <div className="flex items-center gap-2 sm:gap-3 ml-auto">
                  {activeTabUsesScope && (
                    <div
                      className={SETTINGS_SEGMENTED_TRACK_CLASS}
                      role="group"
                      aria-label={t('settingsScopeDefaults')}
                    >
                      <button
                        type="button"
                        onClick={() => setSettingsScope('defaults')}
                        className={
                          visibleScope === 'defaults' ? SETTINGS_SEGMENTED_ACTIVE_CLASS : SETTINGS_SEGMENTED_IDLE_CLASS
                        }
                      >
                        {t('settingsScopeDefaults')}
                      </button>
                      <button
                        type="button"
                        onClick={() => canEditCurrentChat && setSettingsScope('currentChat')}
                        disabled={!canEditCurrentChat}
                        title={!canEditCurrentChat ? t('settingsScopeCurrentChatUnavailable') : undefined}
                        className={
                          visibleScope === 'currentChat'
                            ? SETTINGS_SEGMENTED_ACTIVE_CLASS
                            : SETTINGS_SEGMENTED_IDLE_CLASS
                        }
                      >
                        {t('settingsScopeCurrentChat')}
                      </button>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={onClose}
                    className={`${MODAL_CLOSE_BUTTON_CLASS} hidden md:inline-flex`}
                    aria-label={t('close')}
                  >
                    <X size={18} strokeWidth={2} />
                  </button>
                </div>
              </div>
            </div>
            {isSearching ? (
              <div className="max-w-3xl mx-auto w-full">
                <SettingsSearchResults
                  results={searchResults}
                  onSelect={handleSelectSearchResult}
                  selectedIndex={clampedSearchSelectedIndex}
                  query={searchQuery}
                />
              </div>
            ) : (
              <SettingsContent
                activeTab={activeTab}
                currentSettings={scopedSettings}
                currentThemeId={currentThemeId}
                availableModels={availableModels}
                updateSetting={updateSetting}
                handleModelChange={handleModelChange}
                setAvailableModels={setAvailableModels}
                onClearHistory={handleRequestClearHistory}
                onClearCache={handleRequestClearCache}
                onOpenLogViewer={() => {
                  onOpenLogViewer();
                  onClose();
                }}
                onClearLogs={handleClearLogs}
                onReset={handleResetToDefaults}
                onInstallPwa={onInstallPwa}
                installState={installState}
                onImportSettings={settingsTransferActions.onImportSettings}
                onExportSettings={settingsTransferActions.onExportSettings}
                onImportHistory={handleRequestImportHistory}
                onExportHistory={settingsTransferActions.onExportHistory}
                onImportScenarios={onImportScenarios}
                onExportScenarios={onExportScenarios}
                activeModelBadgeLabel={
                  activeTabUsesScope && visibleScope === 'defaults' ? t('settingsDefaultModelBadge') : undefined
                }
              />
            )}
          </div>
        </main>
      </Modal>

      {confirmConfig.isOpen && (
        <ConfirmationModal
          isOpen={confirmConfig.isOpen}
          onClose={closeConfirm}
          onConfirm={confirmConfig.onConfirm}
          title={confirmConfig.title}
          message={confirmConfig.message}
          isDanger={confirmConfig.isDanger}
          confirmLabel={confirmConfig.confirmLabel}
          cancelLabel={t('cancel')}
        />
      )}
    </>
  );
};
