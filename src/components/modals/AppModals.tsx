import React, { Suspense, useState } from 'react';
import { type AppSettings, type ModelOption, type ChatSettings, type SavedScenario } from '@/types';
import type { LogViewerProps } from '@/components/log-viewer/LogViewer';
import type { PwaInstallState } from '@/pwa/install';
import { lazyNamedComponent } from '@/utils/lazyNamedComponent';
import { ensureFeatureTranslations } from '@/i18n/translations';
import { logService } from '@/services/logService';

const LazySettingsModal = lazyNamedComponent(() => import('@/components/settings/SettingsModal'), 'SettingsModal');
const LazyLogViewer = lazyNamedComponent(() => import('@/components/log-viewer/LogViewer'), 'LogViewer');
const LazyPreloadedMessagesModal = lazyNamedComponent(
  () => import('@/components/scenarios/PreloadedMessagesModal'),
  'PreloadedMessagesModal',
);
const LazyExportChatModal = lazyNamedComponent(() => import('./ExportChatModal'), 'ExportChatModal');

interface AppModalsProps {
  isSettingsModalOpen?: boolean;
  setIsSettingsModalOpen?: (isOpen: boolean) => void;
  appSettings?: AppSettings;
  currentThemeId: string;
  availableModels: ModelOption[];
  handleSaveSettings: (newSettings: AppSettings) => void;
  handleSaveCurrentChatSettings: (newSettings: ChatSettings) => void;
  clearCacheAndReload: () => void;
  clearAllHistory: () => void;
  handleInstallPwa: () => void;
  installState: PwaInstallState;

  handleImportAllScenarios: (file: File) => void;
  handleExportAllScenarios: () => void;

  isPreloadedMessagesModalOpen?: boolean;
  setIsPreloadedMessagesModalOpen?: (isOpen: boolean) => void;
  savedScenarios: SavedScenario[];
  handleSaveAllScenarios: (scenarios: SavedScenario[]) => void;
  handleLoadPreloadedScenario: (scenario: SavedScenario) => void;

  isExportModalOpen: boolean;
  setIsExportModalOpen: (isOpen: boolean) => void;
  handleExportChat: (format: 'png' | 'html' | 'txt' | 'json') => Promise<void>;
  exportStatus: 'idle' | 'exporting';

  isLogViewerOpen?: boolean;
  setIsLogViewerOpen?: (isOpen: boolean | ((prev: boolean) => boolean)) => void;
  currentChatSettings: ChatSettings;
  activeSessionId: string | null;

  setAvailableModels: (models: ModelOption[]) => void;
}

export const AppModals: React.FC<AppModalsProps> = (props) => {
  const [logViewerState, setLogViewerState] = useState<Pick<LogViewerProps, 'initialTab' | 'initialUsageTab'>>({
    initialTab: 'console',
    initialUsageTab: 'overview',
  });
  const [readyFeatures, setReadyFeatures] = useState({
    settings: false,
    logViewer: false,
    scenarios: false,
  });
  const {
    isSettingsModalOpen = false,
    setIsSettingsModalOpen = () => {},
    appSettings,
    currentThemeId,
    availableModels,
    handleSaveSettings,
    handleSaveCurrentChatSettings,
    clearCacheAndReload,
    clearAllHistory,
    handleInstallPwa,
    installState,
    handleImportAllScenarios,
    handleExportAllScenarios,
    isPreloadedMessagesModalOpen = false,
    setIsPreloadedMessagesModalOpen = () => {},
    savedScenarios,
    handleSaveAllScenarios,
    handleLoadPreloadedScenario,
    isExportModalOpen,
    setIsExportModalOpen,
    handleExportChat,
    exportStatus,
    isLogViewerOpen = false,
    setIsLogViewerOpen = () => {},
    currentChatSettings,
    activeSessionId,
    setAvailableModels,
  } = props;

  const openLogViewer = (state?: Pick<LogViewerProps, 'initialTab' | 'initialUsageTab'>) => {
    setLogViewerState({
      initialTab: 'console',
      initialUsageTab: 'overview',
      ...state,
    });
    setIsLogViewerOpen(true);
  };

  React.useEffect(() => {
    if (!isSettingsModalOpen || readyFeatures.settings) return;

    let isCancelled = false;
    void ensureFeatureTranslations('settings')
      .then(() => {
        if (!isCancelled) {
          setReadyFeatures((current) => ({ ...current, settings: true }));
        }
      })
      .catch((error) => logService.error('[AppModals] Failed to load settings translations', { error }));

    return () => {
      isCancelled = true;
    };
  }, [isSettingsModalOpen, readyFeatures.settings]);

  React.useEffect(() => {
    if (!isLogViewerOpen || readyFeatures.logViewer) return;

    let isCancelled = false;
    void ensureFeatureTranslations('logViewer')
      .then(() => {
        if (!isCancelled) {
          setReadyFeatures((current) => ({ ...current, logViewer: true }));
        }
      })
      .catch((error) => logService.error('[AppModals] Failed to load logViewer translations', { error }));

    return () => {
      isCancelled = true;
    };
  }, [isLogViewerOpen, readyFeatures.logViewer]);

  React.useEffect(() => {
    if (!isPreloadedMessagesModalOpen || readyFeatures.scenarios) return;

    let isCancelled = false;
    void ensureFeatureTranslations('scenarios')
      .then(() => {
        if (!isCancelled) {
          setReadyFeatures((current) => ({ ...current, scenarios: true }));
        }
      })
      .catch((error) => logService.error('[AppModals] Failed to load scenarios translations', { error }));

    return () => {
      isCancelled = true;
    };
  }, [isPreloadedMessagesModalOpen, readyFeatures.scenarios]);

  return (
    <>
      {isLogViewerOpen && readyFeatures.logViewer && (
        <Suspense fallback={null}>
          <LazyLogViewer
            isOpen={isLogViewerOpen}
            onClose={() => {
              setIsLogViewerOpen(false);
              setLogViewerState({ initialTab: 'console', initialUsageTab: 'overview' });
            }}
            appSettings={appSettings!}
            currentChatSettings={currentChatSettings}
            initialTab={logViewerState.initialTab}
            initialUsageTab={logViewerState.initialUsageTab}
          />
        </Suspense>
      )}
      {isSettingsModalOpen && readyFeatures.settings && (
        <Suspense fallback={null}>
          <LazySettingsModal
            isOpen={isSettingsModalOpen}
            onClose={() => setIsSettingsModalOpen(false)}
            currentSettings={appSettings!}
            currentThemeId={currentThemeId}
            currentChatSettings={currentChatSettings}
            hasActiveSession={!!activeSessionId}
            availableModels={availableModels}
            onSave={handleSaveSettings}
            onSaveCurrentChatSettings={handleSaveCurrentChatSettings}
            onClearAllHistory={clearAllHistory}
            onClearCache={clearCacheAndReload}
            onOpenLogViewer={openLogViewer}
            onInstallPwa={handleInstallPwa}
            installState={installState}
            onImportScenarios={handleImportAllScenarios}
            onExportScenarios={handleExportAllScenarios}
            setAvailableModels={setAvailableModels}
          />
        </Suspense>
      )}
      {isPreloadedMessagesModalOpen && readyFeatures.scenarios && (
        <Suspense fallback={null}>
          <LazyPreloadedMessagesModal
            isOpen={isPreloadedMessagesModalOpen}
            onClose={() => setIsPreloadedMessagesModalOpen(false)}
            savedScenarios={savedScenarios}
            onSaveAllScenarios={handleSaveAllScenarios}
            onLoadScenario={handleLoadPreloadedScenario}
          />
        </Suspense>
      )}
      {isExportModalOpen && (
        <Suspense fallback={null}>
          <LazyExportChatModal
            isOpen={isExportModalOpen}
            onClose={() => setIsExportModalOpen(false)}
            onExport={handleExportChat}
            exportStatus={exportStatus}
          />
        </Suspense>
      )}
    </>
  );
};
